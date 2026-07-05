import { Data } from "effect"

/**
 * The UI widget kind a field maps to. `unsupported` is the explicit
 * escape hatch: introspection never crashes on an unknown AST node,
 * it marks the field and moves on (read-only in list/detail, excluded
 * from forms — mina #3).
 */
export type FieldKind =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "date"
  | "unsupported"

/**
 * Field identity note: `name` is the ENCODED property key — for a
 * `fromKey("full_name")` field that is `full_name`, not `fullName`.
 * The encoded key is simultaneously the SQL column name and the JSON
 * wire key (Schema's encoded side), so the admin — a generic JSON/SQL
 * layer — lives entirely in that space. The decoded name belongs to
 * the host app's typed code, which the admin never sees.
 */
export interface FieldMeta {
  readonly name: string
  /** Human label. Fallback: the field name. */
  readonly title: string
  readonly kind: FieldKind
  readonly optional: boolean
  /** Auto-generated field (pk, timestamps): excluded from `create`, present in `full`. */
  readonly auto: boolean
  /** `Schema.NullOr(...)`: the DB column admits NULL. */
  readonly nullable: boolean
  /** Only for kind "select": the literal values. */
  readonly options?: ReadonlyArray<string | number>
}

// ---------------------------------------------------------------------------
// List options (roadmap F2)
// ---------------------------------------------------------------------------

/**
 * One column filter, already structured: parsing query params into these
 * is the API layer's job, so repos only see well-formed shapes. Repos
 * still whitelist `field` against the resource's FieldMeta — they must
 * not trust callers (never SQL from free input).
 */
export type ListFilter =
  | { readonly _tag: "eq"; readonly field: string; readonly value: string | number | boolean }
  | { readonly _tag: "contains"; readonly field: string; readonly value: string }
  | {
      readonly _tag: "range"
      readonly field: string
      readonly min?: number | Date
      readonly max?: number | Date
    }

export interface ListOpts {
  /** 1-based. Default 1. */
  readonly page?: number
  /** Default 25, clamped to [1, 200]. */
  readonly pageSize?: number
  /** Field name to sort by; ignored unless it is a sortable field of the resource. */
  readonly orderBy?: string
  readonly orderDir?: "asc" | "desc"
  /** Case-insensitive contains across all text fields. */
  readonly search?: string
  readonly filters?: ReadonlyArray<ListFilter>
}

/** `total` counts ALL rows matching filters/search, ignoring pagination. */
export interface ListResult {
  readonly rows: ReadonlyArray<unknown>
  readonly total: number
}

/** Row not found for the given id. */
export class NotFound extends Data.TaggedError("NotFound")<{
  readonly resource: string
  readonly id: unknown
}> {}

/** Input failed schema validation. `message` is a readable, formatted ParseError. */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly message: string
}> {}

/** Unexpected storage failure (in SQL: connection/query errors). */
export class RepoError extends Data.TaggedError("RepoError")<{
  readonly cause: unknown
}> {}
