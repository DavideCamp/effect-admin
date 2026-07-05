import {
  AdminRepo,
  assertWritable,
  decodeWith,
  normalizeListOpts,
  NotFound,
  RepoError,
  ValidationError,
  type NormalizedListOpts,
  type ResourceDef
} from "@effect-admin/core"
import { SqlClient, type SqlError, type Statement } from "@effect/sql"
import { type Context, Effect, Layer } from "effect"

type Row = Record<string, unknown>

/**
 * `AdminRepo` on a real database via the dialect-agnostic
 * `SqlClient.SqlClient` (D5/D6: generic SQL, Postgres first). The host app
 * provides the client Layer (`@effect/sql-pg`'s `PgClient.layer`), so the
 * pool configuration stays where it belongs (D2).
 *
 * Security invariants (roadmap F1/F2):
 * - identifiers (table, columns) only ever come from the ResourceDef —
 *   FieldMeta names are the whitelist; caller input NEVER becomes an
 *   identifier (normalizeListOpts drops unknown columns upstream)
 * - every value is a bound parameter; there is no string-built SQL
 */

/**
 * DB → decoded-space normalization, driven by FieldMeta kind. The pg
 * driver returns `numeric` as string (lossless by design): a "number"
 * field coerces it back. timestamptz already arrives as Date, boolean as
 * boolean, jsonb as object (left untouched: kind "unsupported" is opaque).
 */
const normalizeRow = (r: ResourceDef, row: Row): Row => {
  const out: Row = { ...row }
  for (const f of r.fields) {
    const v = out[f.name]
    if (v === null || v === undefined) continue
    if (f.kind === "number" && typeof v === "string") out[f.name] = Number(v)
    if (f.kind === "date" && typeof v === "string") out[f.name] = new Date(v)
  }
  return out
}

/**
 * Postgres class 23 (integrity_constraint_violation: FK, unique, check,
 * not-null) is the DB refusing bad DATA, not the storage failing: it maps
 * to ValidationError with the constraint message, everything else is an
 * opaque RepoError. The DB constraint is the safety net under schema
 * validation (D5).
 */
const mapSqlError = (e: SqlError.SqlError): ValidationError | RepoError => {
  const cause = e.cause as { code?: unknown; message?: unknown; detail?: unknown } | undefined
  if (typeof cause?.code === "string" && cause.code.startsWith("23")) {
    const message = [cause.message, cause.detail]
      .filter((p): p is string => typeof p === "string")
      .join(" — ")
    return new ValidationError({ message })
  }
  return new RepoError({ cause: e })
}

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (m) => `\\${m}`)

export const AdminRepoSqlLive: Layer.Layer<AdminRepo, never, SqlClient.SqlClient> = Layer.effect(
  AdminRepo,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient

    const cols = (r: ResourceDef) => sql.csv(r.fields.map((f) => sql`${sql(f.name)}`))

    const contains = (field: string, value: string) =>
      sql`lower(${sql(field)}) LIKE lower(${`%${escapeLike(value)}%`})`

    const whereFragment = (opts: NormalizedListOpts): Statement.Fragment => {
      const clauses: Array<Statement.Fragment> = []
      for (const f of opts.filters) {
        switch (f._tag) {
          case "eq":
            clauses.push(sql`${sql(f.field)} = ${f.value}`)
            break
          case "contains":
            clauses.push(contains(f.field, f.value))
            break
          case "range":
            if (f.min !== undefined) clauses.push(sql`${sql(f.field)} >= ${f.min}`)
            if (f.max !== undefined) clauses.push(sql`${sql(f.field)} <= ${f.max}`)
            break
        }
      }
      if (opts.search !== undefined && opts.searchFields.length > 0) {
        clauses.push(sql.or(opts.searchFields.map((f) => contains(f, opts.search!))))
      }
      return clauses.length > 0 ? sql` WHERE ${sql.and(clauses)}` : sql``
    }

    const selectById = (r: ResourceDef, id: number) =>
      sql`SELECT ${cols(r)} FROM ${sql(r.table)} WHERE ${sql(r.primaryKey)} = ${id}`

    const getRow = (r: ResourceDef, id: number) =>
      selectById(r, id).pipe(
        Effect.mapError((e) => new RepoError({ cause: e })),
        Effect.flatMap((rows) =>
          rows[0] === undefined
            ? Effect.fail(new NotFound({ resource: r.name, id }))
            : Effect.succeed(normalizeRow(r, rows[0] as Row))
        )
      )

    const repo: Context.Tag.Service<AdminRepo> = {
      list: (r, rawOpts) =>
        Effect.gen(function* () {
          const opts = normalizeListOpts(r, rawOpts)
          const where = whereFragment(opts)
          // Always a deterministic ORDER BY: pagination without one is
          // undefined behavior in SQL.
          const orderCol = opts.orderBy ?? r.primaryKey
          const direction = opts.orderDir === "desc" ? sql.literal("DESC") : sql.literal("ASC")
          const rows = yield* sql`SELECT ${cols(r)} FROM ${sql(r.table)}${where} ORDER BY ${
            sql(orderCol)
          } ${direction} LIMIT ${opts.pageSize} OFFSET ${opts.offset}`
          const counted = yield* sql`SELECT count(*) AS total FROM ${sql(r.table)}${where}`
          return {
            rows: rows.map((row) => normalizeRow(r, row as Row)),
            total: Number((counted[0] as { total: unknown }).total)
          }
        }).pipe(Effect.mapError((e) => new RepoError({ cause: e }))),

      get: getRow,

      create: (r, data) =>
        assertWritable(r).pipe(
          Effect.zipRight(decodeWith(r.schemas.create, data)),
          Effect.flatMap((row) =>
            sql.withTransaction(
              sql`INSERT INTO ${sql(r.table)} ${sql.insert(row)} RETURNING ${cols(r)}`
            ).pipe(Effect.mapError(mapSqlError))
          ),
          Effect.map((rows) => normalizeRow(r, rows[0] as Row))
        ),

      update: (r, id, data) =>
        assertWritable(r).pipe(
          Effect.zipRight(decodeWith(r.schemas.update, data)),
          Effect.flatMap((patch) =>
            Object.keys(patch).length === 0
              ? getRow(r, id)
              : sql.withTransaction(
                  sql`UPDATE ${sql(r.table)} SET ${sql.update(patch)} WHERE ${
                    sql(r.primaryKey)
                  } = ${id} RETURNING ${cols(r)}`
                ).pipe(
                  Effect.mapError(mapSqlError),
                  Effect.flatMap((rows) =>
                    rows[0] === undefined
                      ? Effect.fail(new NotFound({ resource: r.name, id }))
                      : Effect.succeed(normalizeRow(r, rows[0] as Row))
                  )
                )
          )
        ),

      del: (r, id) =>
        assertWritable(r).pipe(
          Effect.zipRight(
            sql.withTransaction(
              sql`DELETE FROM ${sql(r.table)} WHERE ${sql(r.primaryKey)} = ${id} RETURNING ${
                sql(r.primaryKey)
              }`
            ).pipe(Effect.mapError(mapSqlError))
          ),
          Effect.flatMap((rows) =>
            rows[0] === undefined
              ? Effect.fail(new NotFound({ resource: r.name, id }))
              : Effect.void
          )
        )
    }
    return repo
  })
)
