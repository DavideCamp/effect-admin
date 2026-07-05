# effect-admin — Plan (Slice Verticale Minimo) — v2

> Revisione del piano originale con le correzioni della review integrate:
> dipendenza introspezione→derivazione resa esplicita, fallback per `Schema.partial`
> sulle transformation, strategia id, `NumberFromString` per i path param,
> errori 400 leggibili, static serving same-origin, unit test su `introspect`,
> time-box come dato di decisione.

## Obiettivo

Un proof of concept eseguibile che dimostri il concetto centrale: **uno schema
`@effect/schema` come unica fonte di verità**, da cui derivare metadati UI,
varianti CRUD, API e una UI grezza. Nessuna duplicazione di schema.

Lo scopo NON è un prodotto completo, ma validare la parte rischiosa
(introspezione AST + derivazione) prima di decidere se investire mesi nel
pacchetto vero.

**Time-box: 3-4 giorni di lavoro effettivo.** Se lo slice li supera, questo è
di per sé un dato per la decisione finale, indipendentemente dal fatto che
funzioni.

## Scope dello slice

### Incluso
- Una sola risorsa (`User`)
- Tipi base: `String`, `Number`, `Boolean`, `Date`, `Literal`-union
- Derivazione automatica varianti: `full`, `create`, `update`
- Introspezione AST → metadati campo (`FieldMeta`), **con unit test**
- Repo con implementazione **in-memory** (parte senza DB), con strategia id definita
- CRUD: `list`, `get`, `create`, `update`, `delete`
- Endpoint HTTP dei 5 CRUD + `GET /_schema`
- Errori di validazione → **HTTP 400 con body JSON leggibile** (niente per-campo)
- UI HTML minimale (tabella + form) servita **same-origin** dall'API stessa

### Escluso (esplicitamente fuori dallo slice)
- Relazioni (ForeignKey / ManyToMany / inline)
- Paginazione, ordinamento, filtri per colonna, ricerca
- Auth / permessi
- Widget avanzati (file, immagini, JSON, rich text)
- Errori di validazione per-campo nella UI (solo messaggio grezzo del 400)
- Azioni bulk / export
- Persistenza SQL reale (arriva in roadmap, fase 1)

## Architettura del PoC

```
schema (User)
     │
     ▼
introspezione AST ──────────► FieldMeta[]  (con flag auto, pk, kind, options)
     │                             │
     │        defineResource ◄─────┘
     │              │
     │              ├─► schemas.full   = schema
     │              ├─► schemas.create = Struct ricostruito SENZA pk e campi auto
     │              └─► schemas.update = Struct ricostruito, campi opzionali
     │
     ▼
Resource descriptor
     │
AdminRepo (Context.Tag) ─── impl. in-memory (id: counter interno)
     │
HttpApi CRUD (@effect/platform) + /_schema + static UI (same-origin)
     │
UI HTML minimale (fetch /_schema + CRUD, mostra errori 400)
```

**Nota architetturale chiave (correzione #1):** la derivazione delle varianti
NON è un `omit` con nomi hardcoded. `defineResource` prima esegue
l'introspezione, poi usa i `FieldMeta` risultanti (flag `auto`, pk) per
decidere cosa omettere. L'introspezione è quindi a monte della derivazione,
non solo un output per la UI.

## Struttura file del PoC

```
effect-admin-poc/
  src/
    core/
      annotations.ts     # simbolo AdminField ({ auto?: boolean })
      introspect.ts      # AST → FieldMeta[]   ← PEZZO RISCHIOSO
      introspect.test.ts # unit test: schema noto → FieldMeta attesi
      derive.ts          # ricostruzione Struct per create/update dai FieldMeta
      resource.ts        # defineResource = introspect + derive + descriptor
      types.ts           # FieldMeta, ResourceDef, ListOpts, errori tipati
    repo/
      repo.ts            # AdminRepo Context.Tag (interfaccia)
      inMemory.ts        # Layer con Map + counter per gli id
    http/
      api.ts             # HttpApi CRUD + /_schema + mapping ParseError→400
      static.ts          # serving di ui/index.html (same-origin)
    ui/
      index.html         # tabella + form generati dai metadati
    schemas.ts           # definizione User (unica fonte di verità)
    main.ts              # wiring dei Layer + avvio server
  package.json
  tsconfig.json
```

## Cosa implementare, in ordine

### Passo 1 — Fondamenta e schema (~mezza giornata)
- `package.json`: `effect`, `@effect/platform`, `@effect/platform-node`, `vitest`
- `schemas.ts`: `User` con annotations (`title`; `AdminField: { auto: true }`
  su `id` e `createdAt`)
- `types.ts`:
  - `FieldMeta = { name, title, kind, optional, auto, options? }`
  - `ResourceDef`, `ListOpts`
  - errori tipati: `NotFound`, `ValidationError`, `RepoError` (via `Data.TaggedError`)

### Passo 2 — Introspezione AST (il proof of concept vero, ~1 giorno)
- `introspect.ts`: cammina `schema.ast`, matcha su `AST._tag`
  - `TypeLiteral` → itera `propertySignatures` (nome, `isOptional`, tipo)
  - `StringKeyword` → `kind: "text"`
  - `NumberKeyword` → `kind: "number"`
  - `BooleanKeyword` → `kind: "checkbox"`
  - `Union` di soli `Literal` → `kind: "select"` + `options`
  - `Transformation` (es. `Schema.Date`): riconoscere e mappare a
    `kind: "date"`; per transformation non riconosciute → `kind: "unsupported"`
    (esplicito, mai crash)
  - legge annotations: `title`, `AdminField.auto`
- `introspect.test.ts` (**correzione review, minore #1**): 3-4 unit test
  con schema noto in input e `FieldMeta[]` attesi in output. È l'unico punto
  del PoC dove i test ripagano subito: rete di sicurezza per quando si
  estenderanno i casi AST.
- **Milestone**: `pnpm test` verde + stampa in console dei `FieldMeta` di `User`.

### Passo 3 — Derivazione varianti (~mezza giornata)
- `derive.ts` (**correzione #2**): NON usare `Schema.partial` /
  `Schema.omit` sull'intero schema — `Schema.Date` è una transformation e
  `partial` su schemi con trasformazioni può fallire o comportarsi in modo
  inatteso. Strategia:
  1. partire dai `propertySignatures` dell'AST originale,
  2. filtrare (per `create`: via pk e campi `auto: true` dai FieldMeta;
     per `update`: via pk),
  3. ricostruire un nuovo `Schema.Struct` dai signature filtrati
     (per `update`: avvolgendo ogni campo in `Schema.optional`).
  - Se `Schema.omit`/`partial` funzionano sul caso specifico, usarli pure —
    ma il fallback via ricostruzione è il percorso di riferimento.
- `resource.ts`: `defineResource(config)` = `introspect` → `derive` →
  descriptor `{ ...config, schemas: { full, create, update }, fields }`
- **Milestone**: test che verifica: `create` non contiene `id`/`createdAt`,
  `update` accetta payload parziali, `full` invariato. Tutto senza aver
  riscritto `User`.

### Passo 4 — Repo in-memory (~mezza giornata)
- `repo.ts`: `AdminRepo` come `Context.Tag`, metodi `list/get/create/update/delete`,
  tutti `Effect` con errori tipati nel canale E
- `inMemory.ts` (**correzione #3**): `Layer` con `Map<id, row>` +
  **counter interno per generare gli id** in `create`. Documentare nel codice
  che in SQL questo diventerà autoincrement + `RETURNING` — l'interfaccia
  `create` restituisce sempre la riga completa con id, così il contratto non
  cambia tra le implementazioni.
- Validazione input via `Schema.decodeUnknown(resource.schemas.create/update)`,
  errori mappati su `ValidationError`
- **Milestone**: test dei 5 metodi senza alcun DB (fornendo il Layer in-memory).

### Passo 5 — HttpApi CRUD (~1 giorno)
- `api.ts`: 5 endpoint con gli schemi derivati
  - `POST` payload = `schemas.create`; `PATCH` payload = `schemas.update`;
    risposte = `schemas.full`
  - (**correzione #4**) path param `/:id`: usare `Schema.NumberFromString`
    (i path param HTTP sono stringhe). Verificare anche il lato **encode**
    delle risposte: `Date` → ISO string nel JSON, non solo il decode in ingresso.
  - (**correzione #5**) mapping errori: `ParseError`/`ValidationError` →
    **HTTP 400 con body JSON leggibile** (`{ error: "...", detail: "..." }`),
    `NotFound` → 404. Niente errori per-campo: solo "mai fallire in silenzio".
- endpoint `GET /admin/api/_schema` → serializza `fields` + nome risorsa per la UI
- `static.ts` (**correzione #6**): l'API serve anche `ui/index.html` sulla
  stessa origin (es. `GET /admin`), così **niente CORS** nel PoC.
- **Milestone**: CRUD completo via `curl`, incluso un 400 leggibile su payload
  invalido; OpenAPI generato automaticamente.

### Passo 6 — UI minimale (~mezza-1 giornata)
- `ui/index.html`: JS vanilla, zero build step
  - `fetch /_schema` → colonne tabella e campi form dai `FieldMeta`
    (`kind` → input type; `options` → `<select>`; campi `auto` esclusi dal form)
  - lista → tabella; "nuovo"/"modifica" → form generato
  - submit → POST/PATCH; delete con conferma
  - su risposta 400: mostrare il messaggio d'errore del body (grezzo va bene)
- **Milestone**: creare/editare/cancellare uno `User` dal browser, con la UI
  interamente generata dai metadati, servita dall'API stessa.

## Criterio di successo dello slice

Riuscito quando, **senza aver duplicato lo schema `User`**:
1. i `FieldMeta` sono derivati automaticamente dall'AST (e i test passano),
2. si crea/modifica/cancella uno `User` dal browser,
3. i payload API hanno le varianti corrette (create senza `id`/`createdAt`,
   update parziale),
4. un payload invalido produce un 400 leggibile, non un crash.

## Decisione dopo lo slice

- **Regge e piace, entro il time-box** → si passa alla roadmap (vedi
  `roadmap.md`): SQL reale su DB Django, relazioni, auth, paginazione, widget.
- **Troppo oneroso, o time-box sforato in modo significativo** → nessun
  rimpianto: si passa ad AdminJS / React Admin sopra l'OpenAPI che Effect
  genera comunque. Il lavoro su schemi e HttpApi resta riusabile.

## Rischio principale

L'introspezione AST (Passo 2). L'AST di `@effect/schema` è ricco: union,
refinement, branded types, transformation annidate. Lo slice ne copre
volutamente un sottoinsieme, con `kind: "unsupported"` come uscita esplicita
per tutto il resto. L'estensione ai casi complessi è il lavoro vero della
roadmap — per questo il Passo 2 va prototipato per primo e coperto da test.

## Nota per le fasi successive

Il mapping DB Django → Schema Effect (fase 1 della roadmap) sarà **manuale o
da costruire**: non esiste oggi un introspettore DB → `@effect/schema`
equivalente a `prisma db pull`. L'analogia regge come concetto, non come
tooling disponibile. Vedi `roadmap.md`, fase 1.
