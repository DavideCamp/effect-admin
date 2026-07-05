# effect-admin — Piano di implementazione (PoC)

> Compagno operativo di `plan.md`: traduce i 6 passi dello slice in task
> concreti a livello di codice, con firme, decisioni tecniche e definition
> of done per ogni task. Riferimenti alla roadmap per ciò che viene dopo.

## Setup iniziale

```bash
mkdir effect-admin-poc && cd effect-admin-poc
pnpm init
pnpm add effect @effect/platform @effect/platform-node
pnpm add -D typescript vitest @types/node tsx
```

- `tsconfig.json`: `strict: true`, `module/moduleResolution: NodeNext`,
  `target: ES2022`
- Script: `"dev": "tsx src/main.ts"`, `"test": "vitest run"`
- Verificare le versioni correnti dei pacchetti Effect al momento del setup:
  l'API di `@effect/platform` (HttpApi) è evoluta rapidamente — fissare le
  versioni nel lockfile e consultare la documentazione della versione
  installata, non esempi datati.

---

## Task 1 — Tipi ed errori (`core/types.ts`)

```typescript
export type FieldKind =
  | "text" | "number" | "checkbox" | "select" | "date" | "unsupported"

export interface FieldMeta {
  readonly name: string
  readonly title: string          // fallback: name
  readonly kind: FieldKind
  readonly optional: boolean
  readonly auto: boolean          // escluso da create, presente in full
  readonly options?: ReadonlyArray<string | number>  // solo kind: "select"
}

export interface ListOpts { /* vuoto nel PoC; si riempie in roadmap F2 */ }
```

Errori con `Data.TaggedError` (catch-abili per tag con `Effect.catchTag`):

```typescript
import { Data } from "effect"

export class NotFound extends Data.TaggedError("NotFound")<{
  readonly resource: string
  readonly id: unknown
}> {}

export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string        // ParseError formattato leggibile
}> {}

export class RepoError extends Data.TaggedError("RepoError")<{
  readonly cause: unknown
}> {}
```

**DoD:** compila; nessuna logica, solo contratti.

---

## Task 2 — Annotation (`core/annotations.ts`)

```typescript
export const AdminField = Symbol.for("effect-admin/AdminField")

export interface AdminFieldAnnotation {
  readonly auto?: boolean
  // future (roadmap F4): ref?: string, displayField?: string
}
```

Uso in `schemas.ts`:

```typescript
import { Schema } from "effect"
import { AdminField } from "./core/annotations"

export const User = Schema.Struct({
  id: Schema.Number.annotations({
    title: "ID", [AdminField]: { auto: true },
  }),
  email: Schema.String.annotations({ title: "Email" }),
  active: Schema.Boolean.annotations({ title: "Attivo" }),
  role: Schema.Literal("admin", "user").annotations({ title: "Ruolo" }),
  createdAt: Schema.Date.annotations({
    title: "Creato il", [AdminField]: { auto: true },
  }),
})
```

Lettura dell'annotation: `SchemaAST.getAnnotation<AdminFieldAnnotation>(AdminField)(ast)`
restituisce `Option<AdminFieldAnnotation>`.

**Decisione:** un solo symbol con oggetto, non un symbol per flag — così le
estensioni future (`ref`, `displayField`, roadmap F4) non toccano l'API.

**DoD:** `User` compila con le annotation; `getAnnotation` le legge in un test.

---

## Task 3 — Introspezione (`core/introspect.ts`) ← IL TASK CRITICO

Firma:

```typescript
export const introspect: (ast: AST.AST) => ReadonlyArray<FieldMeta>
```

Algoritmo:

1. Il top-level deve essere `TypeLiteral` (è ciò che produce `Schema.Struct`).
   Se non lo è → errore esplicito con messaggio chiaro (defect, non silenzio:
   nel PoC gli schemi risorsa DEVONO essere Struct).
2. Per ogni `propertySignature`: `name`, `isOptional`, e il tipo AST → `kindOf`.
3. `kindOf(ast)` — pattern match su `ast._tag`:

| `_tag` / caso                              | `kind`          |
|--------------------------------------------|-----------------|
| `StringKeyword`                            | `"text"`        |
| `NumberKeyword`                            | `"number"`      |
| `BooleanKeyword`                           | `"checkbox"`    |
| `Union` con soli membri `Literal`          | `"select"` + `options` = literal values |
| `Literal` singolo                          | `"select"` con una option |
| `Transformation`                           | vedi sotto      |
| `Refinement`                               | ricorri su `ast.from` (il vincolo si ignora nel PoC) |
| altro                                      | `"unsupported"` |

4. **Transformation** (il caso `Schema.Date`): una transformation ha `from`
   e `to`. Euristica del PoC: se il `to` è una dichiarazione la cui identità
   riconosciamo come Date (confronto con l'AST di `Schema.DateFromSelf` /
   annotation identifier `"Date"`) → `kind: "date"`. Qualunque altra
   transformation → `"unsupported"`. Documentare l'euristica nel codice:
   è il punto che la roadmap F6 estenderà.
5. Annotations: `title` via `AST.TitleAnnotationId` (fallback: `name`),
   `auto` via `AdminField` (fallback: `false`). Attenzione: sulle property
   signature l'annotation può stare sul signature o sul tipo — controllare
   entrambi.

Unit test (`core/introspect.test.ts`), minimo 4:

1. `User` completo → snapshot dei 5 `FieldMeta` attesi (nome, kind, auto, title)
2. `Union` di literal misti string/number → `select` con options corrette
3. campo `Schema.optional(...)` → `optional: true`
4. transformation sconosciuta (es. `Schema.NumberFromString`) → `"unsupported"`,
   nessun crash

**DoD:** test verdi; `tsx` di uno script che stampa i FieldMeta di `User`
in tabella console. **Questa è la milestone che decide se proseguire.**

---

## Task 4 — Derivazione varianti (`core/derive.ts`)

Firma:

```typescript
export const deriveSchemas: (
  schema: Schema.Schema.AnyNoContext,
  fields: ReadonlyArray<FieldMeta>,
  primaryKey: string
) => {
  full: Schema.Schema.AnyNoContext
  create: Schema.Schema.AnyNoContext
  update: Schema.Schema.AnyNoContext
}
```

Strategia (dal plan, correzione #2 — **niente `Schema.partial` sull'intero
schema**, `Schema.Date` è una transformation e `partial` può non reggere):

1. Prendere i `propertySignatures` dal `TypeLiteral` originale.
2. `create`: filtrare via pk e ogni campo con `auto: true` (dai `FieldMeta`,
   NON da una lista hardcoded — è qui che la dipendenza introspezione→derivazione
   diventa codice); ricostruire con `Schema.Struct` mappando ogni signature
   al suo schema originale. Per recuperare lo schema di campo dal signature:
   `Schema.make(signature.type)`.
3. `update`: filtrare via solo il pk; ogni campo avvolto in
   `Schema.optional(Schema.make(signature.type))`.
4. `full`: lo schema originale, invariato.

Nota di onestà tecnica: `Schema.make(ast)` ricostruisce lo schema dal punto
di vista di validazione/encoding, che è ciò che serve a repo e HTTP. I tipi
TypeScript *statici* delle varianti derivate saranno meno precisi di quelli
del `full` (il descriptor le espone come schemi generici). Per il PoC va
bene: la type-safety piena end-to-end sulle varianti è lavoro da roadmap F6.

Test:

- `Schema.decodeUnknownEither(create)` rifiuta payload con `id`
  (con `onExcessProperty: "error"`) e accetta `{ email, active, role }`
- `update` accetta `{}` e `{ email: "x@y.z" }`
- `full` decodifica una riga completa

**DoD:** test verdi; nessun campo duplicato a mano in nessun punto.

---

## Task 5 — defineResource (`core/resource.ts`)

```typescript
export interface ResourceConfig<S extends Schema.Schema.AnyNoContext> {
  readonly name: string          // "users" → path API
  readonly schema: S
  readonly primaryKey: string
  readonly list?: { readonly columns?: ReadonlyArray<string> }
}

export interface ResourceDef { /* config + fields + schemas */ }

export const defineResource = (config) => {
  const fields = introspect(config.schema.ast)
  const schemas = deriveSchemas(config.schema, fields, config.primaryKey)
  return { ...config, fields, schemas }
}
```

Validazioni a fault-fast (defect con messaggio chiaro): `primaryKey` deve
esistere nei `fields`; `list.columns`, se presenti, devono esistere nei
`fields`. Errori di configurazione = crash all'avvio, mai a runtime.

**DoD:** `defineResource({ schema: User, ... })` produce descriptor completo;
config sbagliata fallisce all'avvio con messaggio utile.

---

## Task 6 — Repo (`repo/repo.ts` + `repo/inMemory.ts`)

Interfaccia (Tag):

```typescript
export class AdminRepo extends Context.Tag("AdminRepo")<AdminRepo, {
  readonly list:   (r: ResourceDef, opts: ListOpts) => Effect.Effect<ReadonlyArray<unknown>, RepoError>
  readonly get:    (r: ResourceDef, id: number)     => Effect.Effect<unknown, NotFound | RepoError>
  readonly create: (r: ResourceDef, data: unknown)  => Effect.Effect<unknown, ValidationError | RepoError>
  readonly update: (r: ResourceDef, id: number, data: unknown) => Effect.Effect<unknown, NotFound | ValidationError | RepoError>
  readonly del:    (r: ResourceDef, id: number)     => Effect.Effect<void, NotFound | RepoError>
}>() {}
```

Implementazione in-memory (`Layer.sync` o `Layer.effect`):

- Stato: `Map<string /* resource name */, Map<number, Record<string, unknown>>>`
  + counter id per risorsa (correzione #3 del plan)
- `create`: decode con `schemas.create` → assegna `id = ++counter` → riempie
  i campi `auto` non forniti (nel PoC: `createdAt = new Date()`; regola:
  campo auto di kind `date` → now. Documentare che in SQL sarà `DEFAULT now()`
  del DB) → salva → restituisce la riga completa (contratto: `create`
  restituisce SEMPRE la riga con id — identico in SQL con `RETURNING`)
- `update`: `get` → decode con `schemas.update` → merge shallow → salva
- Decode fallito → `ValidationError` con `ParseError` formattato tramite
  `ParseResult.TreeFormatter` (leggibile, multi-riga)
- Seed: 2-3 utenti finti nel Layer, così la UI mostra subito qualcosa

Test: i 5 metodi via `Effect.provide(inMemoryLayer)`, inclusi i casi
`NotFound` e `ValidationError`.

**DoD:** test verdi; nessun accesso allo stato fuori dal Layer.

---

## Task 7 — HTTP (`http/api.ts` + `http/static.ts`)

Endpoint (prefisso `/admin/api`):

| Metodo | Path                  | Payload            | Success            | Errori |
|--------|-----------------------|--------------------|--------------------|--------|
| GET    | `/_schema`            | —                  | metadati risorse   | —      |
| GET    | `/users`              | —                  | `full[]`           | 500    |
| GET    | `/users/:id`          | —                  | `full`             | 404    |
| POST   | `/users`              | `schemas.create`   | `full` (201)       | 400    |
| PATCH  | `/users/:id`          | `schemas.update`   | `full`             | 400/404|
| DELETE | `/users/:id`          | —                  | 204                | 404    |

Dettagli obbligati (correzioni #4/#5/#6 del plan):

- path param: `HttpApiSchema.param("id", Schema.NumberFromString)`
- risposte: usare `schemas.full` come schema di successo → l'encode
  Date→ISO string è gestito dallo schema stesso. Test manuale esplicito:
  il JSON di risposta ha `createdAt` come stringa ISO.
- error mapping: `ValidationError` → status 400 con
  `{ error: "validation", message }`; `NotFound` → 404 con
  `{ error: "not_found" }`; `RepoError` → 500 generico (no leak del cause)
- `/_schema` risponde `{ resources: [{ name, primaryKey, fields, listColumns }] }`
- `static.ts`: `GET /admin` serve `ui/index.html` dal filesystem
  (`HttpServerResponse.file`), stessa origin → zero CORS
- Il PoC è mono-risorsa ma il codice itera su `ReadonlyArray<ResourceDef>`:
  aggiungere la seconda risorsa deve essere una riga in `main.ts`

Verifica via curl (script `scripts/smoke.sh` con questi casi):

```bash
curl -s localhost:3000/admin/api/_schema | jq .
curl -s localhost:3000/admin/api/users | jq .
curl -s -X POST localhost:3000/admin/api/users \
  -H 'content-type: application/json' \
  -d '{"email":"a@b.it","active":true,"role":"user"}' | jq .
# atteso: 201 con id e createdAt valorizzati
curl -s -X POST localhost:3000/admin/api/users \
  -H 'content-type: application/json' -d '{"email":123}' | jq .
# atteso: 400 con message leggibile
curl -s -X PATCH localhost:3000/admin/api/users/1 \
  -H 'content-type: application/json' -d '{"role":"admin"}' | jq .
curl -s -X DELETE localhost:3000/admin/api/users/1 -i
# atteso: 204; ripetuto: 404
```

**DoD:** smoke script passa per intero; OpenAPI generato raggiungibile.

---

## Task 8 — UI (`ui/index.html`)

Un solo file, vanilla JS, zero build. Struttura:

```
state = { schema: null, rows: [] }

load():   fetch /_schema → render colonne; fetch /users → render righe
render(): tabella con listColumns; bottoni Modifica/Elimina per riga; Nuovo
form(row?): per ogni field NON auto → input da kind:
            text→<input type=text>, number→type=number,
            checkbox→type=checkbox, select→<select> da options,
            date→type=datetime-local
submit(): row esistente → PATCH (inviando SOLO i campi toccati, coerente
          con update parziale); nuovo → POST
          risposta !ok → mostra body.message in un <div class=error>
delete(): confirm() → DELETE → reload
```

Dettagli:

- I campi `auto` compaiono nella tabella (sono nel `full`) ma MAI nel form
- checkbox: inviare `true/false` esplicito, non lo stato "assente" dell'HTML
- niente librerie: il punto è dimostrare che i metadati bastano

**DoD:** dal browser su `/admin`: vedo i seed, creo un utente, lo modifico
(cambio ruolo dal select), lo cancello; un input errato mostra il messaggio
del 400 senza rompere la pagina.

---

## Task 9 — Wiring (`main.ts`) e chiusura

```typescript
const resources = [UserResource]

const HttpLive = makeAdminApi(resources).pipe(
  Layer.provide(InMemoryRepoLive),
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)

NodeRuntime.runMain(Layer.launch(HttpLive))
```

Chiusura del PoC:

- [ ] smoke script verde
- [ ] `pnpm test` verde (introspezione + derivazione + repo)
- [ ] checklist dei 4 criteri di successo di `plan.md` spuntata
- [ ] appunti: ore reali per task vs stima, punti dove l'API Effect ha
      sorpreso, casi AST incontrati non gestiti
- [ ] decisione registrata per iscritto: roadmap F1 oppure uscita AdminJS
      (criteri in `plan.md` § Decisione e `roadmap.md` § Criteri di stop)

---

## Ordine, tempi, dipendenze

```
T1 tipi ─┬─► T3 introspezione ─► T4 derive ─► T5 defineResource ─► T6 repo ─► T7 http ─► T8 ui ─► T9 wiring
T2 annot ┘         │
                   └── GATE: se T3 non regge nel budget, stop e decisione anticipata
```

| Task | Stima | Note |
|------|-------|------|
| T1+T2 | 0.5 g | meccanico |
| T3 | 1 g | il rischio; gate esplicito |
| T4 | 0.5 g | la trappola è `partial`/transformation, già disinnescata |
| T5 | 0.25 g | colla |
| T6 | 0.5 g | attenzione ai campi auto in create |
| T7 | 1 g | la parte con più attrito API (versioni HttpApi) |
| T8 | 0.5-1 g | volutamente brutto |
| T9 | 0.25 g | chiusura e decisione |

Totale: ~4 giorni effettivi, coerente con il time-box di `plan.md`. T3 e T7
sono i punti dove il budget può saltare: se accade, è un dato per la
decisione, non un fallimento.
