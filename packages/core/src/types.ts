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
 * `name` is the decoded model property key. For a field declared as
 * `fullName` with `fromKey("full_name")`, the admin uses `fullName`: that is
 * the value returned by the decoded HttpApiClient.
 */
export interface FieldMeta {
  readonly name: string
  /** Human label. Fallback: the field name. */
  readonly title: string
  readonly kind: FieldKind
  readonly optional: boolean
  /** Auto-generated field (pk, timestamps): excluded from generated forms. */
  readonly auto: boolean
  /** `Schema.NullOr(...)`: the API value admits null. */
  readonly nullable: boolean
  /** Only for kind "select": the literal values. */
  readonly options?: ReadonlyArray<string | number>
  readonly relation?: {
    readonly resource: string
    readonly displayField?: string
    readonly multiple: boolean
  }
  readonly hidden: boolean
  readonly readOnly: boolean
  readonly sensitive: boolean
}
