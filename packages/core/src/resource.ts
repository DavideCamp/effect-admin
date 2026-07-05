import type { Schema } from "effect"
import { deriveSchemas, type DerivedSchemas } from "./derive.js"
import { introspect } from "./introspect.js"
import type { FieldMeta } from "./types.js"

export interface ResourceConfig<S extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext> {
  /** Resource name, becomes the API path segment: "users" → /admin/api/users */
  readonly name: string
  readonly schema: S
  readonly primaryKey: string
  /** SQL table name. Default: the resource name. */
  readonly table?: string
  /**
   * Read-only resource (D5): the admin exposes list/get only — no write
   * endpoints, and repos refuse writes as defense in depth. For rows whose
   * invariants belong to the host app's services (e.g. orders).
   */
  readonly readOnly?: boolean
  readonly list?: {
    /** Subset of field names to show as table columns. Default: all fields. */
    readonly columns?: ReadonlyArray<string>
  }
}

export interface ResourceDef extends ResourceConfig {
  readonly table: string
  readonly readOnly: boolean
  readonly fields: ReadonlyArray<FieldMeta>
  readonly schemas: DerivedSchemas
}

/**
 * Build the resource descriptor: introspection first, then derivation
 * driven by the resulting FieldMeta.
 *
 * Configuration errors are defects, not runtime errors: a wrong
 * `primaryKey` or `list.columns` crashes at startup with a clear message,
 * never mid-request.
 */
export const defineResource = <S extends Schema.Schema.AnyNoContext>(
  config: ResourceConfig<S>
): ResourceDef => {
  const fields = introspect(config.schema.ast)
  const names = new Set(fields.map((f) => f.name))

  if (!names.has(config.primaryKey)) {
    throw new Error(
      `effect-admin: resource "${config.name}": primaryKey "${config.primaryKey}" ` +
        `is not a field of the schema (fields: ${[...names].join(", ")}).`
    )
  }
  for (const col of config.list?.columns ?? []) {
    if (!names.has(col)) {
      throw new Error(
        `effect-admin: resource "${config.name}": list column "${col}" ` +
          `is not a field of the schema (fields: ${[...names].join(", ")}).`
      )
    }
  }

  const schemas = deriveSchemas(config.schema, fields, config.primaryKey)
  return {
    ...config,
    table: config.table ?? config.name,
    readOnly: config.readOnly ?? false,
    fields,
    schemas
  }
}
