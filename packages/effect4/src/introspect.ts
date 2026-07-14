import { AdminField, type AdminFieldAnnotation } from "@effect-admin/annotations"
import type { FieldKind, FieldMeta } from "@effect-admin/shared"
import { SchemaAST as AST } from "effect"

const MACHINE_TITLES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "boolean",
  "bigint",
  "symbol",
  "object",
  "Date"
])

type Annotations = Readonly<Record<PropertyKey, unknown>>

const annotationsOf = (ast: AST.AST): Annotations => {
  const checkAnnotations = ast.checks?.[ast.checks.length - 1]?.annotations
  return {
    ...(ast.annotations as Annotations | undefined),
    ...(checkAnnotations as Annotations | undefined)
  }
}

const keyAnnotationsOf = (ast: AST.AST): Annotations =>
  ast.context?.annotations as Annotations | undefined ?? {}

const titleOf = (
  annotations: Annotations,
  options: { readonly ignoreMachineTitles: boolean }
): string | undefined => {
  const title = annotations.title
  return typeof title === "string" &&
      (!options.ignoreMachineTitles || !MACHINE_TITLES.has(title))
    ? title
    : undefined
}

const adminFieldOf = (annotations: Annotations): AdminFieldAnnotation | undefined => {
  const value = annotations[AdminField]
  return typeof value === "object" && value !== null
    ? value as AdminFieldAnnotation
    : undefined
}

const isDateNode = (ast: AST.AST): boolean => {
  const typeConstructor = annotationsOf(ast).typeConstructor
  return typeof typeConstructor === "object" && typeConstructor !== null &&
    "_tag" in typeConstructor && typeConstructor._tag === "Date"
}

const isDate = (ast: AST.AST): boolean =>
  isDateNode(ast) || ast.encoding?.some((link) => isDate(link.to)) === true

const literalOptions = (
  literals: ReadonlyArray<AST.Literal>
): ReadonlyArray<string | number> | undefined => {
  const values = literals.map((literal) => literal.literal)
  return values.every((value): value is string | number =>
    typeof value === "string" || typeof value === "number"
  ) ? values : undefined
}

interface Kind {
  readonly kind: FieldKind
  readonly nullable: boolean
  readonly options?: ReadonlyArray<string | number>
}

const UNSUPPORTED: Kind = { kind: "unsupported", nullable: false }

const arrayElement = (ast: AST.AST): AST.AST | undefined =>
  AST.isArrays(ast) && ast.elements.length === 0 && ast.rest.length === 1
    ? ast.rest[0]
    : undefined

const kindOf = (ast: AST.AST): Kind => {
  if (isDate(ast)) return { kind: "date", nullable: false }
  switch (ast._tag) {
    case "String":
      return { kind: "text", nullable: false }
    case "Number":
      return { kind: "number", nullable: false }
    case "Boolean":
      return { kind: "checkbox", nullable: false }
    case "Literal": {
      const options = literalOptions([ast])
      return options ? { kind: "select", nullable: false, options } : UNSUPPORTED
    }
    case "Union": {
      const members = ast.types.filter((member) => !AST.isUndefined(member) && !AST.isNull(member))
      const nullable = ast.types.some(AST.isNull)
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
    case "Arrays": {
      const element = arrayElement(ast)
      return element ? kindOf(element) : UNSUPPORTED
    }
    default:
      return UNSUPPORTED
  }
}

export const resolveStruct = (ast: AST.AST): AST.Objects => {
  if (AST.isObjects(ast)) return ast
  throw new Error(
    `effect-admin: resource schemas must be a Schema.Struct (Objects), got "${ast._tag}". ` +
    "Wrap your fields in Schema.Struct({ ... })."
  )
}

export const introspect = (ast: AST.AST): ReadonlyArray<FieldMeta> =>
  resolveStruct(ast).propertySignatures.map((signature): FieldMeta => {
    const name = String(signature.name)
    const keyAnnotations = keyAnnotationsOf(signature.type)
    const valueAnnotations = annotationsOf(signature.type)
    const title = titleOf(keyAnnotations, { ignoreMachineTitles: false }) ??
      titleOf(valueAnnotations, { ignoreMachineTitles: true }) ??
      name
    const admin = adminFieldOf(keyAnnotations) ?? adminFieldOf(valueAnnotations) ?? {}
    const { kind, nullable, options } = kindOf(signature.type)
    return {
      name,
      title,
      kind,
      optional: AST.isOptional(signature.type),
      auto: admin.auto ?? false,
      nullable,
      ...(options ? { options } : {}),
      ...(admin.ref ? {
        relation: {
          resource: admin.ref,
          multiple: arrayElement(signature.type) !== undefined,
          ...(admin.displayField ? { displayField: admin.displayField } : {})
        }
      } : {}),
      hidden: admin.hidden ?? false,
      readOnly: admin.readOnly ?? false,
      sensitive: admin.sensitive ?? false
    }
  })
