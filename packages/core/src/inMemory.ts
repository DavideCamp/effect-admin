import { type Context, Effect, Layer } from "effect"
import { decodeWith } from "./decode.js"
import { normalizeListOpts, type NormalizedListOpts } from "./list.js"
import type { ResourceDef } from "./resource.js"
import { NotFound } from "./types.js"
import { AdminRepo, assertWritable } from "./repo.js"

type Row = Record<string, unknown>

/**
 * In-memory storage: one table per resource plus an id counter.
 * In SQL the counter becomes the DB autoincrement and `create` uses
 * `INSERT ... RETURNING` — the repo contract (create always returns the
 * full row with id) does not change.
 *
 * The list pipeline (filter → search → sort → paginate) mirrors the SQL
 * adapter's semantics 1:1 so tests can validate behavior without a DB.
 */
interface Table {
  readonly rows: Map<number, Row>
  nextId: number
}

/**
 * Fill auto fields the client never sends. In-memory rule: an auto field
 * of kind "date" gets `now`. In SQL this is the column's `DEFAULT now()`
 * and disappears from application code.
 */
const fillAutoFields = (r: ResourceDef, row: Row): Row => {
  const filled = { ...row }
  for (const f of r.fields) {
    if (f.auto && f.kind === "date" && filled[f.name] === undefined) {
      filled[f.name] = new Date()
    }
  }
  return filled
}

// --- list pipeline ----------------------------------------------------------

const containsCI = (value: unknown, needle: string): boolean =>
  value !== null &&
  value !== undefined &&
  String(value).toLowerCase().includes(needle.toLowerCase())

const asComparable = (v: unknown): number | string | null => {
  if (v === null || v === undefined) return null
  if (typeof v === "number" || typeof v === "boolean") return Number(v)
  if (v instanceof Date) return v.valueOf()
  return String(v)
}

const matches = (row: Row, opts: NormalizedListOpts): boolean => {
  for (const filter of opts.filters) {
    const v = row[filter.field]
    switch (filter._tag) {
      case "eq":
        if (v !== filter.value) return false
        break
      case "contains":
        if (!containsCI(v, filter.value)) return false
        break
      case "range": {
        const c = asComparable(v)
        if (c === null || typeof c === "string") return false
        if (filter.min !== undefined && c < filter.min.valueOf()) return false
        if (filter.max !== undefined && c > filter.max.valueOf()) return false
        break
      }
    }
  }
  if (opts.search !== undefined) {
    if (!opts.searchFields.some((f) => containsCI(row[f], opts.search!))) return false
  }
  return true
}

const compareRows = (orderBy: string, dir: "asc" | "desc") => (a: Row, b: Row): number => {
  const av = asComparable(a[orderBy])
  const bv = asComparable(b[orderBy])
  // nulls always last, regardless of direction (matches SQL's NULLS LAST)
  if (av === null && bv === null) return 0
  if (av === null) return 1
  if (bv === null) return -1
  const cmp =
    typeof av === "string" || typeof bv === "string"
      ? String(av).localeCompare(String(bv))
      : av - bv
  return dir === "desc" ? -cmp : cmp
}

export const InMemoryRepoLive = Layer.sync(AdminRepo, () => {
  const tables = new Map<string, Table>()
  const tableOf = (r: ResourceDef): Table => {
    let table = tables.get(r.name)
    if (table === undefined) {
      table = { rows: new Map(), nextId: 1 }
      tables.set(r.name, table)
    }
    return table
  }

  const getRow = (r: ResourceDef, id: number) =>
    Effect.suspend(() => {
      const row = tableOf(r).rows.get(id)
      return row === undefined
        ? Effect.fail(new NotFound({ resource: r.name, id }))
        : Effect.succeed(row)
    })

  const repo: Context.Tag.Service<AdminRepo> = {
    list: (r, rawOpts) =>
      Effect.sync(() => {
        const opts = normalizeListOpts(r, rawOpts)
        const filtered = [...tableOf(r).rows.values()].filter((row) => matches(row, opts))
        if (opts.orderBy !== undefined) {
          filtered.sort(compareRows(opts.orderBy, opts.orderDir))
        }
        return {
          rows: filtered.slice(opts.offset, opts.offset + opts.pageSize),
          total: filtered.length
        }
      }),

    get: getRow,

    create: (r, data) =>
      assertWritable(r).pipe(
        Effect.zipRight(decodeWith(r.schemas.create, data)),
        Effect.map((decoded) => {
          const table = tableOf(r)
          const id = table.nextId++
          const row = fillAutoFields(r, { ...decoded, [r.primaryKey]: id })
          table.rows.set(id, row)
          return row
        })
      ),

    update: (r, id, data) =>
      Effect.gen(function* () {
        yield* assertWritable(r)
        const current = yield* getRow(r, id)
        const patch = yield* decodeWith(r.schemas.update, data)
        const merged = { ...current, ...patch }
        tableOf(r).rows.set(id, merged)
        return merged
      }),

    del: (r, id) =>
      assertWritable(r).pipe(
        Effect.zipRight(getRow(r, id)),
        Effect.map(() => void tableOf(r).rows.delete(id))
      )
  }
  return repo
})

/**
 * Seed rows bypassing the read-only guard (seeding read-only resources
 * is exactly what a seed is for). Values go through the create schema.
 */
export const seed = (r: ResourceDef, rows: ReadonlyArray<Row>) =>
  Effect.gen(function* () {
    const repo = yield* AdminRepo
    const writable: ResourceDef = { ...r, readOnly: false }
    for (const row of rows) {
      yield* repo.create(writable, row)
    }
  })
