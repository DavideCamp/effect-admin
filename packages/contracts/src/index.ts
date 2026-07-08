import * as Schema from "effect/Schema"

/** A filter format every v1 list endpoint understands. */
export const AdminFilter = Schema.Struct({
  field: Schema.String,
  operator: Schema.Literal("eq", "contains", "gte", "lte"),
  value: Schema.Union(Schema.String, Schema.Number, Schema.Boolean)
})
export type AdminFilter = typeof AdminFilter.Type

/**
 * Conventional query schema for an admin `list` endpoint. `filters` is
 * encoded as JSON in one query parameter, while its decoded value stays a
 * typed array in handlers and HttpApi clients.
 */
export const AdminListParams = Schema.Struct({
  page: Schema.optionalWith(Schema.NumberFromString, { default: () => 1 }),
  pageSize: Schema.optionalWith(Schema.NumberFromString, { default: () => 25 }),
  orderBy: Schema.optional(Schema.String),
  orderDir: Schema.optional(Schema.Literal("asc", "desc")),
  search: Schema.optional(Schema.String),
  filters: Schema.optional(Schema.parseJson(Schema.Array(AdminFilter)))
})
export type AdminListParams = typeof AdminListParams.Type

export const AdminListResult = <A, I, R>(row: Schema.Schema<A, I, R>) =>
  Schema.Struct({
    rows: Schema.Array(row),
    total: Schema.Number
  })

export class AdminValidationError extends Schema.TaggedError<AdminValidationError>()(
  "AdminValidationError",
  {
    message: Schema.String,
    fields: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) })
    )
  }
) {}

export class AdminNotFound extends Schema.TaggedError<AdminNotFound>()(
  "AdminNotFound",
  { message: Schema.String }
) {}

export interface ResourceCapabilities {
  readonly list?: boolean
  readonly get?: boolean
  readonly create?: boolean
  readonly update?: boolean
  readonly delete?: boolean
  readonly actions?: Readonly<Record<string, boolean>>
}

export type AdminCapabilities = Readonly<Record<string, ResourceCapabilities>>
