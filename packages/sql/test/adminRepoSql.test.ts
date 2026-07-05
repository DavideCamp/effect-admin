import { AdminField } from "@effect-admin/annotations"
import { AdminRepo, defineResource } from "@effect-admin/core"
import { PgClient } from "@effect/sql-pg"
import { Effect, Exit, Layer, ManagedRuntime, Redacted, Schema } from "effect"
import { connect } from "node:net"
import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { AdminRepoSqlLive } from "../src/index.js"

/**
 * Integration tests against a REAL Postgres — the example package's
 * docker-compose one by default:
 *
 *   cd packages/example && docker compose up -d --wait
 *
 * If the DB is not reachable the suite SKIPS (loudly): unit-level list
 * semantics are already covered DB-less by core's in-memory tests, which
 * are the executable spec this adapter must match.
 */

const url = process.env.ADMIN_TEST_DATABASE_URL ?? "postgres://admin:admin@localhost:5434/admin"
const parsed = new URL(url)

const available = await new Promise<boolean>((resolve) => {
  const socket = connect({ host: parsed.hostname, port: Number(parsed.port || 5432) }, () => {
    socket.end()
    resolve(true)
  })
  socket.on("error", () => resolve(false))
  socket.setTimeout(1500, () => {
    socket.destroy()
    resolve(false)
  })
})

if (!available) {
  // eslint-disable-next-line no-console
  console.warn(
    `[adminRepoSql.test] SKIPPED: no Postgres at ${parsed.host} — run "docker compose up -d --wait" in packages/example`
  )
}

// A scratch resource exercising every F1 shape: fromKey, NullOr, select,
// checkbox, double precision, auto id + auto date with DB defaults, unique
// constraint (for the error mapping test).
const Item = Schema.Struct({
  id: Schema.Int.annotations({ title: "ID", [AdminField]: { auto: true } }),
  name: Schema.String,
  code: Schema.String,
  fullLabel: Schema.propertySignature(Schema.String).pipe(Schema.fromKey("full_label")),
  price: Schema.Number,
  active: Schema.Boolean,
  status: Schema.Literal("alpha", "beta"),
  note: Schema.NullOr(Schema.String),
  dueAt: Schema.propertySignature(Schema.NullOr(Schema.Date)).pipe(Schema.fromKey("due_at")),
  createdAt: Schema.propertySignature(
    Schema.Date.annotations({ [AdminField]: { auto: true } })
  ).pipe(Schema.fromKey("created_at"))
})

const items = defineResource({
  name: "items",
  schema: Item,
  primaryKey: "id",
  table: "_admin_test_items"
})

const readOnlyItems = defineResource({
  name: "items_ro",
  schema: Item,
  primaryKey: "id",
  table: "_admin_test_items",
  readOnly: true
})

const PgLive = PgClient.layer({ url: Redacted.make(url), maxConnections: 3 })
const TestLayer = Layer.merge(AdminRepoSqlLive.pipe(Layer.provide(PgLive)), PgLive)

const runtime = ManagedRuntime.make(TestLayer)

const DDL = `
CREATE TABLE IF NOT EXISTS _admin_test_items (
  id serial PRIMARY KEY,
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  full_label text NOT NULL,
  price double precision NOT NULL,
  active boolean NOT NULL,
  status text NOT NULL CHECK (status IN ('alpha', 'beta')),
  note text,
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)`

const baseItem = {
  name: "Item",
  code: "C-1",
  full_label: "Etichetta",
  price: 12.5,
  active: true,
  status: "alpha",
  note: null,
  due_at: null
}

const withRepo = <A, E>(f: (repo: typeof AdminRepo.Service) => Effect.Effect<A, E>) =>
  runtime.runPromise(Effect.flatMap(AdminRepo, f))

const withRepoExit = <A, E>(f: (repo: typeof AdminRepo.Service) => Effect.Effect<A, E>) =>
  runtime.runPromiseExit(Effect.flatMap(AdminRepo, f))

describe.skipIf(!available)("AdminRepoSql on Postgres", () => {
  beforeEach(() =>
    runtime.runPromise(
      Effect.flatMap(PgClient.PgClient, (sql) =>
        sql.unsafe(DDL).pipe(
          Effect.zipRight(sql`TRUNCATE _admin_test_items RESTART IDENTITY`)
        )
      )
    )
  )

  afterAll(async () => {
    if (available) {
      await runtime.runPromise(
        Effect.flatMap(PgClient.PgClient, (sql) => sql`DROP TABLE IF EXISTS _admin_test_items`)
      )
    }
    await runtime.dispose()
  })

  it("create: INSERT..RETURNING gives the full row, DB fills id and created_at", () =>
    withRepo((repo) =>
      Effect.sync(() => 0).pipe(
        Effect.zipRight(repo.create(items, baseItem)),
        Effect.map((created) => {
          const row = created as Record<string, unknown>
          expect(row.id).toBe(1)
          expect(row.full_label).toBe("Etichetta")
          expect(row.price).toBe(12.5)
          expect(row.active).toBe(true)
          expect(row.note).toBeNull()
          expect(row.due_at).toBeNull()
          expect(row.created_at).toBeInstanceOf(Date)
        })
      )
    ))

  it("date round-trip: ISO string in the payload lands as timestamptz and comes back as Date", () =>
    withRepo((repo) =>
      repo.create(items, { ...baseItem, due_at: "2026-07-01T10:00:00.000Z" }).pipe(
        Effect.map((created) => {
          const due = (created as Record<string, unknown>).due_at as Date
          expect(due).toBeInstanceOf(Date)
          expect(due.toISOString()).toBe("2026-07-01T10:00:00.000Z")
        })
      )
    ))

  it("get returns the row; missing id is NotFound", async () => {
    await withRepo((repo) => repo.create(items, baseItem))
    const row = (await withRepo((repo) => repo.get(items, 1))) as Record<string, unknown>
    expect(row.name).toBe("Item")
    const missing = await withRepoExit((repo) => repo.get(items, 999))
    expect(Exit.isFailure(missing)).toBe(true)
    expect(String(missing)).toContain("NotFound")
  })

  it("update is a partial UPDATE..RETURNING; missing id is NotFound", async () => {
    await withRepo((repo) => repo.create(items, baseItem))
    const row = (await withRepo((repo) =>
      repo.update(items, 1, { price: 99.9, note: "aggiornato" })
    )) as Record<string, unknown>
    expect(row.price).toBe(99.9)
    expect(row.note).toBe("aggiornato")
    expect(row.name).toBe("Item") // untouched columns survive
    const missing = await withRepoExit((repo) => repo.update(items, 999, { price: 1 }))
    expect(String(missing)).toContain("NotFound")
  })

  it("delete removes the row; deleting twice is NotFound", async () => {
    await withRepo((repo) => repo.create(items, baseItem))
    await withRepo((repo) => repo.del(items, 1))
    const again = await withRepoExit((repo) => repo.del(items, 1))
    expect(String(again)).toContain("NotFound")
  })

  it("list: pagination + total, sort, eq/range filters and search — the in-memory spec, on SQL", async () => {
    await withRepo((repo) =>
      Effect.all(
        Array.from({ length: 30 }, (_, idx) => {
          const i = idx + 1
          return repo.create(items, {
            ...baseItem,
            name: `Item ${String(i).padStart(2, "0")}`,
            code: `C-${i}`,
            full_label: i % 11 === 0 ? "speciale" : "normale",
            price: i,
            active: i % 2 === 0,
            status: i % 3 === 0 ? "beta" : "alpha"
          })
        }),
        { discard: true }
      )
    )

    const page2 = (await withRepo((repo) =>
      repo.list(items, { page: 2, pageSize: 10, orderBy: "price", orderDir: "asc" })
    )) as { rows: Array<Record<string, unknown>>; total: number }
    expect(page2.total).toBe(30)
    expect(page2.rows).toHaveLength(10)
    expect(page2.rows[0]?.price).toBe(11)

    const beta = (await withRepo((repo) =>
      repo.list(items, { filters: [{ _tag: "eq", field: "status", value: "beta" }] })
    )) as { total: number }
    expect(beta.total).toBe(10)

    const range = (await withRepo((repo) =>
      repo.list(items, { filters: [{ _tag: "range", field: "price", min: 5, max: 8 }] })
    )) as { total: number }
    expect(range.total).toBe(4)

    const search = (await withRepo((repo) => repo.list(items, { search: "SPECIALE" }))) as {
      total: number
      rows: Array<Record<string, unknown>>
    }
    expect(search.total).toBe(2) // 11 and 22

    const combined = (await withRepo((repo) =>
      repo.list(items, {
        search: "Item",
        filters: [
          { _tag: "eq", field: "active", value: true },
          { _tag: "range", field: "price", min: 10 }
        ],
        orderBy: "price",
        orderDir: "desc",
        pageSize: 5
      })
    )) as { total: number; rows: Array<Record<string, unknown>> }
    expect(combined.total).toBe(11) // even numbers 10..30
    expect(combined.rows[0]?.price).toBe(30)
  })

  it("read-only resource refuses writes (defense in depth under the API guard)", async () => {
    const exit = await withRepoExit((repo) => repo.create(readOnlyItems, baseItem))
    expect(String(exit)).toContain("read-only")
  })

  it("DB constraint violations map to readable ValidationError, not opaque 500s", async () => {
    await withRepo((repo) => repo.create(items, baseItem))
    const exit = await withRepoExit((repo) => repo.create(items, baseItem)) // same unique code
    expect(Exit.isFailure(exit)).toBe(true)
    expect(String(exit)).toContain("ValidationError")
    expect(String(exit)).toContain("duplicate key")
  })

  it("LIKE wildcards in search are escaped: '%' matches literally", async () => {
    await withRepo((repo) =>
      repo.create(items, { ...baseItem, name: "sconto 50%" }).pipe(
        Effect.zipRight(repo.create(items, { ...baseItem, name: "senza sconto", code: "C-2" }))
      )
    )
    const result = (await withRepo((repo) => repo.list(items, { search: "50%" }))) as {
      total: number
    }
    expect(result.total).toBe(1)
  })
})
