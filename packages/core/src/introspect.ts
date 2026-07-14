import * as Option from "effect/Option"
import * as AST from "effect/SchemaAST"
import { AdminField, type AdminFieldAnnotation } from "@effect-admin/annotations"
import type { FieldKind, FieldMeta } from "./types.js"

/**
 * Titles that effect Schema attaches to nodes by default (e.g. `Schema.String`
 * carries title "string", `Schema.Date` carries "validDate"). These are
 * machine noise, not user intent: when the resolved title is one of these we
 * fall back to the field name. A user-provided `.annotations({ title })`
 * always wins because it overwrites the annotation on the outermost node.
 */
const MACHINE_TITLES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "boolean",
  "bigint",
  "symbol",
  "object",
  "validDate",
  "Date",
  "DateFromSelf"
])

const getTitle = (
  annotated: AST.Annotated,
  options: { readonly ignoreMachineTitles: boolean }
): Option.Option<string> =>
  AST.getAnnotation<string>(AST.TitleAnnotationId)(annotated).pipe(
    Option.filter((t) => !options.ignoreMachineTitles || !MACHINE_TITLES.has(t))
  )

const getAdminField = (annotated: AST.Annotated): Option.Option<AdminFieldAnnotation> =>
  AST.getAnnotation<AdminFieldAnnotation>(AdminField)(annotated)

/** Strip refinement layers (min/max/pattern...): constraints are ignored for now (form constraints are roadmap F5). */
const unwrapRefinements = (ast: AST.AST): AST.AST =>
  AST.isRefinement(ast) ? unwrapRefinements(ast.from) : ast

/**
 * Date detection heuristic (the point roadmap F5 will extend).
 *
 * `Schema.Date` decodes string → Date, so its AST is a Refinement (valid
 * date check) wrapping a Transformation whose `to` side lands on the
 * `DateFromSelf` Declaration. We recognise a "date" by unwrapping
 * refinements and checking that the transformation target (or the node
 * itself, for `Schema.DateFromSelf`) is a Declaration identified as
 * "DateFromSelf". Any other transformation is `unsupported` — explicit,
 * never a crash.
 */
const isDate = (ast: AST.AST): boolean => {
  const inner = unwrapRefinements(ast)
  if (AST.isTransformation(inner)) {
    const target = unwrapRefinements(inner.to)
    return AST.isDeclaration(target) && hasIdentifier(target, "DateFromSelf")
  }
  return AST.isDeclaration(inner) && hasIdentifier(inner, "DateFromSelf")
}

const hasIdentifier = (ast: AST.AST, id: string): boolean =>
  Option.contains(
    AST.getAnnotation<string>(AST.IdentifierAnnotationId)(ast),
    id
  )

const isNullLiteral = (ast: AST.AST): boolean =>
  AST.isLiteral(ast) && ast.literal === null

const literalOptions = (
  literals: ReadonlyArray<AST.Literal>
): ReadonlyArray<string | number> | undefined => {
  const values = literals.map((l) => l.literal)
  return values.every((v): v is string | number =>
    typeof v === "string" || typeof v === "number"
  )
    ? values
    : undefined
}

interface Kind {
  readonly kind: FieldKind
  readonly nullable: boolean
  readonly options?: ReadonlyArray<string | number>
}

const UNSUPPORTED: Kind = { kind: "unsupported", nullable: false }

const arrayElement = (ast: AST.AST): AST.AST | undefined => {
  const inner = unwrapRefinements(ast)
  return AST.isTupleType(inner) && inner.elements.length === 0 && inner.rest.length === 1
    ? inner.rest[0]?.type
    : undefined
}

const kindOf = (ast: AST.AST): Kind => {
  switch (ast._tag) {
    case "StringKeyword":
      return { kind: "text", nullable: false }
    case "NumberKeyword":
      return { kind: "number", nullable: false }
    case "BooleanKeyword":
      return { kind: "checkbox", nullable: false }
    case "Literal": {
      const options = literalOptions([ast])
      return options ? { kind: "select", nullable: false, options } : UNSUPPORTED
    }
    case "Union": {
      // `Schema.optional(S)` unions S with undefined (optionality is read
      // from the property signature) and `Schema.NullOr(S)` unions S with
      // the null literal (mina #2): both are wrappers to see through, and
      // null's presence becomes the `nullable` flag.
      const members = ast.types.filter(
        (t) => !AST.isUndefinedKeyword(t) && !isNullLiteral(t)
      )
      const nullable = ast.types.some(isNullLiteral)
      if (members.length === 0) return { ...UNSUPPORTED, nullable }
      if (members.every(AST.isLiteral)) {
        const options = literalOptions(members)
        return options ? { kind: "select", nullable, options } : { ...UNSUPPORTED, nullable }
      }
      if (members.length === 1) {
        const inner = kindOf(members[0]!)
        return { ...inner, nullable: nullable || inner.nullable }
      }
      return { ...UNSUPPORTED, nullable }
    }
    case "Refinement":
      return isDate(ast) ? { kind: "date", nullable: false } : kindOf(ast.from)
    case "Transformation":
      return isDate(ast) ? { kind: "date", nullable: false } : UNSUPPORTED
    case "Declaration":
      return isDate(ast) ? { kind: "date", nullable: false } : UNSUPPORTED
    case "TupleType": {
      const element = arrayElement(ast)
      return element ? kindOf(element) : UNSUPPORTED
    }
    default:
      return UNSUPPORTED
  }
}

/**
 * Resolve a resource schema's AST to its decoded TypeLiteral. The React
 * client receives decoded HttpApi values, so `fromKey("full_name")` is
 * represented here as `fullName`.
 *
 * A plain `Schema.Struct` IS a TypeLiteral. A struct with `fromKey`
 * property signatures (mina #1) becomes a Transformation whose
 * `transformation` is a TypeLiteralTransformation. Its `to` side carries
 * decoded keys and complete per-field ASTs, which is exactly what the React
 * client consumes.
 */
export const resolveStruct = (ast: AST.AST): AST.TypeLiteral => {
  if (AST.isTypeLiteral(ast)) return ast
  if (
    AST.isTransformation(ast) &&
    ast.transformation._tag === "TypeLiteralTransformation"
  ) {
    return resolveStruct(ast.to)
  }
  throw new Error(
    `effect-admin: resource schemas must be a Schema.Struct (TypeLiteral), got "${ast._tag}". ` +
      `Wrap your fields in Schema.Struct({ ... }).`
  )
}

/**
 * Walk a resource schema's AST and produce the field metadata that drives
 * the generated React UI and startup validation.
 */
export const introspect = (ast: AST.AST): ReadonlyArray<FieldMeta> => {
  const struct = resolveStruct(ast)

  return struct.propertySignatures.map((sig): FieldMeta => {
    const name = String(sig.name)
    // Annotations may live on the property signature or on the field type:
    // check the signature first, then the type.
    const title = getTitle(sig, { ignoreMachineTitles: false }).pipe(
      Option.orElse(() => getTitle(sig.type, { ignoreMachineTitles: true })),
      Option.getOrElse(() => name)
    )
    const admin = getAdminField(sig).pipe(
      Option.orElse(() => getAdminField(sig.type)),
      Option.getOrElse((): AdminFieldAnnotation => ({}))
    )
    const { kind, nullable, options } = kindOf(sig.type)
    return {
      name,
      title,
      kind,
      optional: sig.isOptional,
      auto: admin.auto ?? false,
      nullable,
      ...(options !== undefined ? { options } : {}),
      ...(admin.ref !== undefined
        ? {
            relation: {
              resource: admin.ref,
              multiple: arrayElement(sig.type) !== undefined,
              ...(admin.displayField !== undefined
                ? { displayField: admin.displayField }
                : {})
            }
          }
        : {}),
      hidden: admin.hidden ?? false,
      readOnly: admin.readOnly ?? false,
      sensitive: admin.sensitive ?? false
    }
  })
}
