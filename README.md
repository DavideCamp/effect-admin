# effect-admin

**L'equivalente del Django admin per l'ecosistema Effect, come libreria.**
Un'app `@effect/platform` con modelli in `effect/Schema` monta un router
admin e ottiene un pannello di amministrazione derivato interamente dai
suoi schemi. Nessuna duplicazione: lo schema dell'app è l'unica fonte di
verità.

> Stato: **Fase 2 completata** — Postgres reale (`@effect-admin/sql`),
> introspezione completa (fromKey, NullOr, refinement, branded; ciò che
> non si mappa degrada a read-only), risorse read-only, lista con
> paginazione/sort/filtri/ricerca e stato nella query string. Prossima:
> F3 (auth + permessi — **blocca qualunque deploy pubblico**). Vedi
> `docs/plan.md` (decisioni D1–D10) e `docs/roadmap.md`.

## Struttura

| Package                    | Cosa contiene                                             |
| -------------------------- | --------------------------------------------------------- |
| `@effect-admin/annotations`| Il symbol `AdminField` + tipi. Zero dipendenze: è l'unico accoppiamento che l'app ospite prende (D3). |
| `@effect-admin/core`       | Introspezione AST → `FieldMeta`, derivazione varianti CRUD, `defineResource`, contratto `AdminRepo` (+ repo in-memory). |
| `@effect-admin/sql`        | Adapter Postgres (`AdminRepoSqlLive`) sul `SqlClient` generico di `@effect/sql`. |
| `@effect-admin/web`        | Il router montabile: API JSON + UI generata dai metadati (D2/D8). |
| `@effect-admin/example`    | L'app ospite d'esempio (dominio blog+shop) — primo consumatore e palestra della libreria. |

## Quickstart: installarlo in un altro progetto

> ⚠️ **Niente autenticazione fino alla F3**: chiunque raggiunga `/admin`
> può leggere e scrivere. Solo localhost / reti fidate.

I package non sono (ancora) su npm: si installano come **tarball locali**.
Da questo repo:

```bash
pnpm run pack:all        # builda e produce artifacts/*.tgz
```

Nel progetto ospite (un'app `@effect/platform` qualunque):

```bash
pnpm add ../effect-admin/artifacts/effect-admin-core-0.1.0.tgz \
         ../effect-admin/artifacts/effect-admin-web-0.1.0.tgz
# per Postgres, anche:
pnpm add ../effect-admin/artifacts/effect-admin-sql-0.1.0.tgz @effect/sql @effect/sql-pg
```

Le dipendenze **interne** dei tarball (`@effect-admin/core` → `annotations`,
`web` → `core`) puntano a versioni che non esistono sul registry: vanno
reindirizzate ai tarball con gli override pnpm nel `package.json` ospite:

```jsonc
"pnpm": {
  "overrides": {
    "@effect-admin/annotations": "file:../effect-admin/artifacts/effect-admin-annotations-0.1.0.tgz",
    "@effect-admin/core": "file:../effect-admin/artifacts/effect-admin-core-0.1.0.tgz"
  }
}
```

Poi l'admin si **monta** (non appare da solo — come `admin.site.urls` in
Django). App minima completa, JavaScript puro, `node server.js`:

```js
import { AdminField, defineResource, InMemoryRepoLive } from "@effect-admin/core"
import { makeAdminRouter } from "@effect-admin/web"
import { HttpLayerRouter } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Layer, Schema } from "effect"
import { createServer } from "node:http"

const Todo = Schema.Struct({
  id: Schema.Int.annotations({ title: "ID", [AdminField]: { auto: true } }),
  title: Schema.String.annotations({ title: "Titolo" }),
  done: Schema.Boolean.annotations({ title: "Fatto" })
})

const todos = defineResource({ name: "todos", schema: Todo, primaryKey: "id" })
const AdminRoutes = makeAdminRouter({ resources: [todos], basePath: "/admin" })

const HttpLive = HttpLayerRouter.serve(AdminRoutes).pipe(
  Layer.provide(InMemoryRepoLive), // ← lo storage lo scegli tu
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 }))
)
NodeRuntime.runMain(Layer.launch(HttpLive))
```

Con Postgres al posto dell'in-memory (le tabelle devono già esistere:
l'admin non genera DDL, il DB è dell'app ospite — D5):

```js
import { AdminRepoSqlLive } from "@effect-admin/sql"
import { PgClient } from "@effect/sql-pg"
import { Redacted } from "effect"

const RepoLive = AdminRepoSqlLive.pipe(
  Layer.provide(PgClient.layer({ url: Redacted.make(process.env.DATABASE_URL) })),
  Layer.orDie
)
// … Layer.provide(RepoLive) al posto di InMemoryRepoLive
```

## Sviluppo

```bash
pnpm install
pnpm typecheck
pnpm test                # i test SQL richiedono il Postgres qui sotto (altrimenti skippano)

# con Postgres (seed di volume: 50k comments, 20k orders, 5k posts...)
cd packages/example && docker compose up -d --wait && cd ../..
PORT=3001 pnpm dev:pg    # admin su http://localhost:3001/admin

# senza DB (in-memory, seed minimo)
PORT=3001 pnpm dev
```

Nota d'architettura: i nomi campo dell'admin sono le **chiavi encoded**
degli schemi (`fromKey("full_name")` → `full_name`): è insieme il nome
colonna SQL e la chiave JSON sul wire. I nomi decodificati (`fullName`)
appartengono al codice tipato dell'app ospite, che l'admin non vede mai.
