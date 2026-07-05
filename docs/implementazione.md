# effect-admin — Stato dell'implementazione (F0–F2 + packaging)

> Aggiornato al 2026-07-05. Le decisioni di design (D1–D10) sono in
> `plan.md`, la sequenza delle fasi in `roadmap.md`. Questo documento è la
> fotografia tecnica di **ciò che esiste e come funziona**, di **dove
> vivono i model**, e di **cosa manca** — con il dettaglio implementativo.

---

## 1. Cosa fa, in una frase

Un'app `@effect/platform` che ha i suoi modelli in `effect/Schema` monta
un router (`makeAdminRouter`) e ottiene un pannello di amministrazione
alla Django: lista con paginazione/sort/filtri/ricerca, pagine di
dettaglio con URL propri, API JSON validata, documentazione OpenAPI —
tutto **derivato dagli schemi**, senza duplicazione.

## 2. Architettura: i 5 package e chi dipende da chi

```
                    app ospite (es. packages/example)
                         │  monta il router, fornisce i Layer
                         ▼
   @effect-admin/web ────────► @effect-admin/core ────► @effect-admin/annotations
   (router montabile:          (introspezione AST,       (solo il symbol AdminField
    API + UI)                   varianti CRUD,            + tipi; ZERO dipendenze)
                                defineResource,
                                contratto AdminRepo,
                                repo in-memory)
   @effect-admin/sql ─────────►     "
   (AdminRepoSqlLive su
    SqlClient generico)
```

- **`annotations`** è l'unico accoppiamento che l'app ospite si prende
  per "marcare" gli schemi (D3). Zero dipendenze: importarlo non porta
  dentro nulla.
- **`core`** non sa niente di HTTP né di SQL: produce metadati e varianti
  di schema, e definisce il contratto di storage (`AdminRepo`, un
  `Context.Tag`).
- **`sql`** e il repo in-memory di core sono due implementazioni dello
  STESSO Tag: HTTP e UI non si accorgono dello swap.
- **`web`** costruisce API e UI **dai metadati**, mai dagli schemi
  direttamente.
- **`example`** è l'app ospite di riferimento: primo consumatore e
  palestra dei test (dominio blog+shop).

## 3. Dove stanno i model (la domanda chiave)

**I model appartengono all'app ospite, non alla libreria** (decisione D3).
effect-admin non ha un suo posto per i model, non genera schemi dal DB,
non chiede di ereditare da classi sue. Il flusso è:

```ts
// Nel TUO progetto, dove già definisci i tuoi schemi di dominio:
import { AdminField } from "@effect-admin/core" // (re-export di annotations)
import { Schema } from "effect"

export const User = Schema.Struct({
  id: Schema.Int.annotations({ title: "ID", [AdminField]: { auto: true } }),
  email: Schema.String.pipe(Schema.minLength(3)).annotations({ title: "Email" }),
  // fromKey: nel codice usi `fullName`, su DB/JSON la colonna è `full_name`
  fullName: Schema.propertySignature(
    Schema.String.annotations({ title: "Nome completo" })
  ).pipe(Schema.fromKey("full_name")),
  role: Schema.Literal("admin", "staff", "user").annotations({ title: "Ruolo" }),
  createdAt: Schema.propertySignature(
    Schema.Date.annotations({ title: "Creato il", [AdminField]: { auto: true } })
  ).pipe(Schema.fromKey("created_at"))
})
```

Le annotazioni sono **in-place** sullo schema esistente: `title` (label
umana), `[AdminField]: { auto }` (campo generato dal DB: fuori dai form,
il DB lo riempie con `DEFAULT`), `[AdminField]: { ref, displayField }`
(FK — dichiarabile già oggi, usata dai widget in F4).

Poi, tipicamente in un file `admin.ts` del tuo progetto (equivalente di
`admin.py` in Django), registri le risorse e monti il router:

```ts
import { defineResource } from "@effect-admin/core"
import { makeAdminRouter } from "@effect-admin/web"
import { User } from "./domain/user.js"

export const users = defineResource({
  name: "users",          // segmento URL e nome API
  schema: User,
  primaryKey: "id",
  table: "users",         // opzionale, default = name
  // readOnly: true,      // opzionale: solo list/get, niente scritture
  list: { columns: ["id", "email", "full_name", "role"] } // chiavi ENCODED
})

export const AdminRoutes = makeAdminRouter({ resources: [users], basePath: "/admin" })
// → Layer.mergeAll(AdminRoutes, ...) nel tuo HttpLayerRouter.serve,
//   con Layer.provide(AdminRepoSqlLive + PgClient.layer) o InMemoryRepoLive
```

Anche il **DDL è tuo**: l'admin non crea tabelle (D5). Gli invarianti
stanno nei constraint del DB; la validazione schema dell'admin è davanti,
il constraint è la rete di sicurezza.

### La scelta d'identità: spazio encoded

Decisione presa in F1, documentata in `core/src/types.ts`: **il nome di
un campo per l'admin è la chiave ENCODED** dello schema. Per un campo con
`fromKey("full_name")`, l'admin vede `full_name` ovunque: è insieme il
nome colonna SQL e la chiave JSON sul wire (il lato encoded di Schema è
per definizione il formato di scambio). Il nome decodificato (`fullName`)
appartiene al codice tipato dell'app ospite, che l'admin non vede mai.
Conseguenza pratica: in `list.columns`, nei filtri e nelle API si usano i
nomi colonna.

## 4. Il flusso dei dati, end-to-end

```
schema (Struct)                      ── l'app ospite lo scrive
   │ introspect(ast)                    core/src/introspect.ts
   ▼
FieldMeta[]  { name, title, kind, optional, auto, nullable, options? }
   │ deriveSchemas(schema, fields, pk)  core/src/derive.ts
   ▼
{ full, create, update }             ── varianti Schema ricostruite
   │ defineResource(...)                core/src/resource.ts
   ▼
ResourceDef  { name, table, readOnly, primaryKey, fields, schemas, list }
   │                                    │
   │ makeAdminApi + handlers            │ AdminRepo (Tag)
   ▼                                    ▼
HTTP (web/src/api.ts)  ──chiama──►  InMemoryRepoLive | AdminRepoSqlLive
   │
   ▼
UI (web/src/ui/index.html) — si costruisce da GET /_schema
```

### 4.1 Introspezione (`core/src/introspect.ts`)

`resolveStruct(ast)` normalizza l'AST al `TypeLiteral` giusto:

- `Schema.Struct` piatto → è già un TypeLiteral.
- Struct con `fromKey` → l'AST top-level è una `Transformation` con
  `transformation._tag === "TypeLiteralTransformation"`; si usa il lato
  **`from`**: ha le chiavi encoded E gli AST di campo completi (compresa
  la Transformation di `Schema.Date`), con le annotazioni intatte.
- Qualunque altra cosa → errore di configurazione, a startup, con
  messaggio chiaro (mai a metà richiesta).

`kindOf(ast)` mappa ogni AST di campo su un `FieldKind`:

| AST | kind | note |
|---|---|---|
| `StringKeyword` | `text` | |
| `NumberKeyword` | `number` | |
| `BooleanKeyword` | `checkbox` | |
| `Literal` / Union di Literal | `select` | `options` = i valori |
| `Schema.Date` (Refinement→Transformation→`DateFromSelf`) | `date` | riconosciuta per identifier |
| `Refinement` (minLength, pattern, brand, Int…) | unwrap ricorsivo | il vincolo si ignora (→ F5) |
| `Union` con `null` literal (`NullOr`) | kind del ramo non-null + `nullable: true` | il null non entra mai nelle `options` |
| `Union` con `undefined` (`Schema.optional`) | kind del ramo | l'opzionalità si legge dalla property signature |
| tutto il resto (`Unknown`, trasformazioni ignote…) | `unsupported` | **mai un errore**: degrada |

`unsupported` = visibile in lista/dettaglio come valore read-only,
**escluso dai form e dalle varianti di scrittura**. È così che una
colonna `jsonb` (es. `orders.metadata`, tipata `NullOr(Unknown)`)
convive con l'admin senza editor dedicato.

### 4.2 Derivazione varianti (`core/src/derive.ts`)

Ricostruisce tre `Schema.Struct` dai property signature del TypeLiteral
risolto (NON `Schema.omit/partial` sull'intero schema: inaffidabili sopra
le trasformazioni):

- **`full`** — tutti i campi: risposta API. Ricostruito anch'esso dal
  lato encoded, quindi il wire di un fromKey-schema usa `full_name`.
- **`create`** — senza pk, senza `auto`, senza `unsupported`; payload POST.
- **`update`** — senza pk e `unsupported`, tutti i campi `optional`; PATCH.

Le varianti di scrittura hanno `onExcessProperty: "error"`: mandare la pk
o un campo auto in un payload fallisce rumorosamente a ogni decode.

### 4.3 Contratto storage (`core/src/repo.ts`)

```ts
AdminRepo (Context.Tag) {
  list(r, opts)   → { rows, total }          // total PRIMA della paginazione
  get(r, id)      → row | NotFound
  create(r, data) → row completa con id      // = INSERT..RETURNING
  update(r, id, patch) → row | NotFound      // PATCH parziale
  del(r, id)      → void | NotFound
}
// errori: NotFound | ValidationError (messaggio leggibile) | RepoError (opaco)
```

Regole comuni alle implementazioni: ogni repo **decodifica il proprio
input** (`decodeWith`, difesa in profondità: non si fida dei caller) e
**rifiuta le scritture su risorse readOnly** (`assertWritable`) anche se
l'API già non espone quelle rotte.

Le opzioni lista passano SEMPRE da `normalizeListOpts` (`core/src/list.ts`):
clamp di page/pageSize (max 200), `orderBy` accettato solo se è un campo
non-unsupported della risorsa, filtri scartati se il campo non esiste o il
kind non ammette quella forma. **È la whitelist di colonne**: nessun
identificatore SQL arriva mai dall'input del client.

### 4.4 Repo in-memory (`core/src/inMemory.ts`)

`Map<id, row>` per risorsa + contatore id. Implementa l'intera pipeline
lista (filter → search → sort → paginate) in JS: è la **specifica
eseguibile** che l'adapter SQL deve rispettare, testabile senza DB.
Dettagli: sort con NULLS LAST (come Postgres), ricerca case-insensitive
sui campi `text`, `seed()` bypassa il guard readOnly (seedare una risorsa
di sola lettura è esattamente ciò che serve).

### 4.5 Adapter SQL (`sql/src/index.ts`)

`AdminRepoSqlLive: Layer<AdminRepo, never, SqlClient.SqlClient>` — è
scritto contro il **`SqlClient` generico** di `@effect/sql` (D5); l'app
ospite fornisce il client concreto (`PgClient.layer` di `@effect/sql-pg`)
e quindi la configurazione del pool resta sua (D2).

Query (tutte con identifier escaping via `sql(name)` e **parametri
bindati** — non esiste SQL costruito con stringhe):

```
list:   SELECT <cols> FROM <table> [WHERE ...] ORDER BY <col> ASC|DESC LIMIT $ OFFSET $
        SELECT count(*) FROM <table> [WHERE ...]           ← total
        (senza orderBy esplicito ordina per pk: paginazione deterministica)
get:    SELECT <cols> FROM <table> WHERE <pk> = $
create: INSERT INTO <table> (...) VALUES (...) RETURNING <cols>   [in transazione]
update: UPDATE <table> SET ... WHERE <pk> = $ RETURNING <cols>    [in transazione]
        (patch vuoto → get)
del:    DELETE FROM <table> WHERE <pk> = $ RETURNING <pk>         [in transazione]
```

Filtri → frammenti WHERE: `eq` → `col = $`; `contains`/search →
`lower(col) LIKE lower($)` con `%`/`_`/`\` escapati (dialetto-neutro);
`range` → `col >= $` / `col <= $`. La ricerca è un OR sui campi `text`.

Mapping tipi e normalizzazione riga (guidata dai FieldMeta):
`timestamptz` → `Date` (nativo del driver), `numeric` arriva come stringa
→ ricoercizzato a `number` per i kind `number`, `boolean` nativo,
`jsonb` passa opaco (kind `unsupported`). Nel DDL dell'esempio i float
sono `double precision` (round-trip pulito con `Schema.Number`); i soldi
sono **integer cents** (`total_cents int` + brand `Cents`).

Errori: violazioni di constraint Postgres (classe `23xxx`: FK, unique,
check, not-null) → `ValidationError` con il messaggio del DB (è il DB che
rifiuta DATI, non lo storage che fallisce); tutto il resto → `RepoError`
opaco (il client vede un 500 senza dettagli).

### 4.6 HTTP (`web/src/api.ts`)

Un `HttpApiGroup` per risorsa + il gruppo `meta`:

```
GET    {base}/api/_schema           ← metadati per la UI (fields, listColumns, readOnly)
GET    {base}/api/:res              ← lista { rows, total }, query params validati
GET    {base}/api/:res/:id
POST   {base}/api/:res              ← 201, payload = variante create   ┐ NON registrati
PATCH  {base}/api/:res/:id          ← payload = variante update        │ se readOnly
DELETE {base}/api/:res/:id          ← 204                              ┘
GET    {base}/api/openapi.json      GET {base}/docs (Scalar)
```

I query param della lista sono **uno Schema costruito per-risorsa** dai
FieldMeta: `page`, `pageSize`, `orderDir`, `search`, `orderBy` =
`Schema.Literal(<solo colonne ordinabili>)`, e per i filtri
`f_<col>` (select: valore; checkbox: `true|false`) e
`f_<col>_min`/`f_<col>_max` (number/date). Un `orderBy` o un filtro fuori
whitelist muore con 400 **alla frontiera HTTP**, prima di toccare il repo.
`toListOpts` coercizza le stringhe dei query param nel tipo giusto per
kind (numeri, Date, boolean, select numeriche).

Errori wire (union discriminata da `error`): `{error:"not_found"}` 404,
`{error:"validation", message}` 400, `{error:"internal"}` 500 — la causa
interna non arriva mai al client.

Nota di onestà: l'API è assemblata in un loop, quindi i tipi statici
degli handler degradano ad `any` alle giunture (runtime comunque validato
dagli schemi endpoint per endpoint). Tipizzazione statica end-to-end = F5.

### 4.7 Router montabile (`web/src/router.ts`)

`makeAdminRouter({ resources, basePath = "/admin" })` restituisce UN
Layer (D2) che fonde: rotte API, docs Scalar, e la UI su `GET {base}` **e
`GET {base}/*`** (wildcard: i deep-link tipo `/admin/products/4/edit`
servono la stessa pagina; le rotte statiche api/docs vincono sul
wildcard). L'HTML è letto con `readFileSync` **alla costruzione del
router** e il placeholder `%ADMIN_BASE%` sostituito col basePath → la
pagina funziona ovunque la monti. (Conseguenza dev: modifiche all'HTML
richiedono il riavvio del server.)

### 4.8 UI (`web/src/ui/index.html`)

Una pagina statica che si costruisce da `/_schema`. Niente framework,
niente build step (D8: crescerà verso server-rendered + isole JS).

- **Routing client** con History API, URL alla Django:
  `{base}/:res` (lista), `{base}/:res/new`, `{base}/:res/:id/edit`.
  Il click sulla RIGA naviga al dettaglio.
- **Stato lista nella query string** (bookmarkabile):
  `?page=2&orderBy=price&orderDir=desc&search=...&f_status=paid&f_price_min=10`.
  Barra filtri generata dai FieldMeta (select, sì/no, range min/max),
  ricerca con debounce, header cliccabili col verso ▲▼, paginazione con
  totale e page-size.
- **Dettaglio**: breadcrumb, form **full-width a griglia responsive**
  precompilato via `GET /:res/:id`; i campi auto/unsupported mostrati
  read-only sopra il form; PATCH manda solo i campi cambiati; campo
  nullable vuoto → `null` (un optional vuoto → omesso).
- **readOnly**: badge "sola lettura" in sidebar, niente +Nuovo/Elimina,
  dettaglio con input disabilitati senza Salva.

### 4.9 Packaging (F5-light)

- Build TypeScript con **project references** (`tsconfig.build.json` per
  package) → `dist/` con `.js` ESM + `.d.ts` + sourcemap; il build di
  `web` copia `src/ui` in `dist/ui` (il router la legge da lì a runtime).
- Gli `exports` dei package puntano ai sorgenti (`./src/index.ts`) per la
  DX interna; al pack `publishConfig.exports` li riscrive su `dist/` e
  pnpm converte `workspace:*` in versioni concrete.
- `pnpm run pack:all` → `artifacts/*.tgz`. Consumo in un altro progetto:
  `pnpm add <tarball core> <tarball web>` + **override pnpm** per le
  dipendenze interne (che non esistono sul registry) — vedi quickstart nel
  README. Verificato con un consumer esterno in JavaScript puro (`node`).

## 5. Test: cosa coprono (54, tutti verdi)

| Suite | Copre |
|---|---|
| `core/test/introspect.test.ts` | ogni kind, fromKey (chiavi encoded + annotazioni sopravvissute), NullOr in tutte le salse, branded, degradazione unsupported |
| `core/test/derive.test.ts` | forma delle varianti full/create/update |
| `core/test/inMemory.test.ts` | CRUD + errori + guard readOnly + **semantica lista completa** (paginazione, sort bidirezionale, filtri combinati, range, search, clamp) |
| `example/test/f1-debt.test.ts` | l'intero dominio d'esempio si introspetta e registra (era il debito F1, promosso da `it.fails`) |
| `sql/test/adminRepoSql.test.ts` | **9 test contro Postgres vero** (docker, porta 5434): round-trip date, RETURNING, la stessa spec lista dell'in-memory su SQL, violazioni unique → ValidationError, escape dei wildcard LIKE. Skippa (rumorosamente) se il DB è giù; in CI c'è un service Postgres, quindi lì non skippa mai. |

## 6. Cosa manca (in ordine di roadmap)

### F3 — Auth, permessi, audit ⟵ **prossima; blocca qualunque deploy**
Oggi chiunque raggiunga `/admin` legge e scrive tutto. Tecnicamente:
- Interfaccia auth come `Context.Tag` implementata dall'app ospite
  (verifica credenziali/sessione); la libreria porta il flusso
  login/logout con cookie di sessione `HttpOnly`+`Secure` (il bottone
  Login nell'header è già lì, oggi è solo visuale).
- Matrice permessi alla Django: `view/add/change/delete` per risorsa, per
  utente/gruppo, su **tabelle di proprietà della libreria** (schema +
  migration fornite da noi); in F3 popolata via seed/SQL, la UI di
  gestione arriva gratis in F4 registrando quelle tabelle come risorse.
- Middleware di enforcement su OGNI rotta (pagine + JSON): non
  autenticato → redirect login; senza permesso → 403.
- Audit log (chi/cosa/quando per ogni scrittura) nel repo layer.
- CSRF sui form, rate limiting sul login, security header.

### F4 — Relazioni (il salto "Django-like"; spike prima di stimare)
- FK: le annotazioni `ref`/`displayField` esistono già in
  `annotations`, ma oggi **non sono esposte** in FieldMeta/_schema e le FK
  si vedono come numeri grezzi. Serve: propagarle nei metadati, endpoint
  di lookup con ricerca asincrona (permessi inclusi), widget select-search
  nel form, label della riga riferita in lista.
- Validazione referenziale amichevole (oggi: il constraint FK del DB
  risponde già con ValidationError leggibile, ma generica).
- M2M: widget multi-select, scrittura transazionale sulla tabella ponte
  (`post_tags` esiste già nel DDL d'esempio).
- Dogfooding: gestire i permessi di F3 dall'admin stesso.
- Inline read-only delle righe figlie; `onDelete` esplicito.

### F5 — Packaging completo e docs
- Pubblicazione npm vera: nome/scope definitivo, licenza, semver freeze,
  CI di release (con questo spariscono gli override pnpm dei tarball).
- `AdminServer.make({ resources, auth, db })`: wrapper standalone.
- Refinement → vincoli di form (min/max/pattern sugli input), matrice
  documentata supportato/read-only/non supportato.
- Tipizzazione statica end-to-end (via i cast `any` in api.ts).
- Quickstart "10 minuti" per utenti esterni.

### Debito tecnico minore, noto e accettato
- Le `<option>` delle select portano valori JSON-encoded
  (`'"available"'`) — funziona (preserva string vs number) ma va ripulito
  quando il form diventerà server-rendered.
- Prefisso `f_` nei query param: una colonna che finisce in `_min`
  colliderebbe col range di un'omonima — caso d'angolo ignorato.
- La lista SQL senza `orderBy` esplicito ordina per pk; CON `orderBy` su
  colonna con valori duplicati manca il tie-break secondario sulla pk
  (pagine potenzialmente instabili ai bordi).
- `it.fails`/introspezione: `Schema.optional` con default, union
  eterogenee, array — oggi `unsupported` (per design, ma estendibili).
- L'HTML della UI è letto a startup: in dev serve riavviare per vederne
  le modifiche.

## 7. Comandi di riferimento

```bash
pnpm install
pnpm typecheck && pnpm test        # 54 test; i 9 SQL skippano senza DB
cd packages/example && docker compose up -d --wait   # Postgres :5434, seed volume
pnpm dev:pg                        # admin su http://localhost:${PORT:-3000}/admin
pnpm run pack:all                  # → artifacts/*.tgz per installarlo altrove
```
