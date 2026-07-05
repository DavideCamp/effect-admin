import { InMemoryRepoLive, seed } from "@effect-admin/core"
import { AdminRepoSqlLive } from "@effect-admin/sql"
import { makeAdminRouter } from "@effect-admin/web"
import { HttpLayerRouter, HttpServerResponse } from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { PgClient } from "@effect/sql-pg"
import { Effect, Layer, Redacted } from "effect"
import { createServer } from "node:http"
import { products, resources, tags } from "./resources.js"

/**
 * The example app is a normal @effect/platform server that MOUNTS the
 * admin (decision D2) — the admin does not own the process.
 *
 * Storage (F1): with DATABASE_URL set, the real Postgres adapter
 * (`docker compose up -d` in this package, then
 * DATABASE_URL=postgres://admin:admin@localhost:5433/admin). Without it,
 * the in-memory repo with a tiny seed — same AdminRepo Tag, nothing else
 * changes.
 */
const AdminRoutes = makeAdminRouter({ resources, basePath: "/admin" })

// A route of the host app itself, to prove cohabitation on one router.
const HomeRoute = HttpLayerRouter.add(
  "GET",
  "/",
  Effect.succeed(
    HttpServerResponse.html(
      `<!doctype html><meta charset="utf-8"><h1>Example app</h1><p>L'app ospite. L'admin è montato su <a href="/admin">/admin</a>.</p>`
    )
  )
)

const databaseUrl = process.env.DATABASE_URL

// The in-memory seed only makes sense without a DB (Postgres seeds itself
// via sql/ at first boot).
const InMemorySeedLive = Layer.effectDiscard(
  Effect.gen(function* () {
    yield* seed(tags, [{ name: "effect" }, { name: "typescript" }, { name: "admin" }])
    yield* seed(products, [
      { name: "Tastiera meccanica", sku: "KB-001", price: 129.9, status: "available", stock: 12 },
      { name: "Mouse verticale", sku: "MS-014", price: 59.0, status: "out_of_stock", stock: 0 },
      { name: "Hub USB-C", sku: "HB-102", price: 39.5, status: "available", stock: 34 }
    ])
  })
)

const RepoLive =
  databaseUrl !== undefined
    ? AdminRepoSqlLive.pipe(
        Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl) })),
        Layer.orDie
      )
    : Layer.merge(InMemoryRepoLive, InMemorySeedLive.pipe(Layer.provide(InMemoryRepoLive)))

const AllRoutes = Layer.mergeAll(AdminRoutes, HomeRoute)

const port = Number(process.env.PORT ?? 3000)

const HttpLive = HttpLayerRouter.serve(AllRoutes).pipe(
  Layer.provide(RepoLive),
  Layer.provide(NodeHttpServer.layer(createServer, { port }))
)

console.log(
  databaseUrl !== undefined
    ? `[example] storage: Postgres (${databaseUrl.replace(/:[^:@/]+@/, ":***@")})`
    : "[example] storage: in-memory (set DATABASE_URL for Postgres)"
)

NodeRuntime.runMain(Layer.launch(HttpLive))
