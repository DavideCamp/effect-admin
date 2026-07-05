import { Schema, type SchemaAST as AST } from "effect"
import { resolveStruct } from "./introspect.js"
import type { FieldMeta } from "./types.js"

export interface DerivedSchemas {
  /** All fields: API responses. */
  readonly full: Schema.Schema.AnyNoContext
  /** No pk, no auto fields, no unsupported fields: POST payload. */
  readonly create: Schema.Schema.AnyNoContext
  /** No pk, no unsupported fields, every field optional: PATCH payload. */
  readonly update: Schema.Schema.AnyNoContext
}

/**
 * Derive the CRUD schema variants by rebuilding Structs from the resolved
 * property signatures. Deliberately NOT `Schema.omit`/`Schema.partial` on
 * the whole schema: `Schema.Date` is a transformation and `partial` over
 * transformations is unreliable (plan, correction #2).
 *
 * ALL variants (full included) are rebuilt from the ENCODED-side
 * TypeLiteral (see resolveStruct): for a `fromKey` schema this means the
 * admin's wire format uses the encoded keys (`full_name`), the same keys
 * the DB uses. Per-field value codecs are preserved (a Date field still
 * decodes ISO string → Date), only the key renaming is dropped — the
 * decoded names belong to the host app, not to the admin.
 *
 * What to drop comes from the introspected `FieldMeta` (the `auto` and
 * `unsupported` flags), never from a hardcoded name list: introspection
 * sits upstream of derivation by design (plan, correction #1).
 */
export const deriveSchemas = (
  schema: Schema.Schema.AnyNoContext,
  fields: ReadonlyArray<FieldMeta>,
  primaryKey: string
): DerivedSchemas => {
  const struct = resolveStruct(schema.ast)

  const autoFields = new Set(fields.filter((f) => f.auto).map((f) => f.name))
  const unsupported = new Set(
    fields.filter((f) => f.kind === "unsupported").map((f) => f.name)
  )
  const fieldSchema = (sig: AST.PropertySignature): Schema.Schema.AnyNoContext =>
    Schema.make(sig.type)

  const fullProps: Record<string, Schema.Schema.AnyNoContext | Schema.PropertySignature.All> = {}
  const createProps: Record<string, Schema.Schema.AnyNoContext | Schema.PropertySignature.All> = {}
  const updateProps: Record<string, Schema.PropertySignature.All> = {}

  for (const sig of struct.propertySignatures) {
    const name = String(sig.name)
    fullProps[name] = sig.isOptional
      ? Schema.optional(fieldSchema(sig))
      : fieldSchema(sig)
    if (unsupported.has(name)) continue // read-only: never in a write payload
    if (name !== primaryKey && !autoFields.has(name)) {
      createProps[name] = sig.isOptional
        ? Schema.optional(fieldSchema(sig))
        : fieldSchema(sig)
    }
    if (name !== primaryKey) {
      updateProps[name] = Schema.optional(fieldSchema(sig))
    }
  }

  // Excess properties are a hard error, not silently stripped: sending the
  // pk, an auto field or an unsupported field in a create/update payload
  // must fail loudly, at every decode site (HTTP payload validation included).
  const strict = { parseOptions: { onExcessProperty: "error" as const } }

  return {
    full: Schema.Struct(fullProps as never) as unknown as Schema.Schema.AnyNoContext,
    create: Schema.Struct(createProps as never).annotations(
      strict
    ) as unknown as Schema.Schema.AnyNoContext,
    update: Schema.Struct(updateProps as never).annotations(
      strict
    ) as unknown as Schema.Schema.AnyNoContext
  }
}
