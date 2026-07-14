import type { AdminFieldAnnotation } from "@effect-admin/annotations"
import {
  type AdminActionConfig,
  type AdminActionDef,
  type AdminApiGroup,
  type AdminFieldConfig,
  type AdminResourceDef,
  type ConventionalOperation,
  type FieldMeta
} from "@effect-admin/shared"
import { Schema, SchemaAST as AST } from "effect"
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi"
import {
  makeAdminApi as makeHttpAdminApi,
  makeCrudApiGroup,
  type AdminCrudApiConfig
} from "./contracts.js"
import { introspect, resolveStruct } from "./introspect.js"

const conventionalOperations = ["list", "get", "create", "update", "delete"] as const

type AnyNoContext = Schema.Codec<unknown, unknown, never, never>

type EndpointNames<Group extends AdminApiGroup> =
  Group extends HttpApiGroup.Constraint
    ? HttpApiEndpoint.Identifier<HttpApiGroup.Endpoints<Group>>
    : Extract<keyof Group["endpoints"], string>

type EndpointName<Group extends AdminApiGroup> =
  string extends EndpointNames<Group> ? string : EndpointNames<Group>

export type AdminFieldName<S extends AnyNoContext> =
  S["Type"] extends Readonly<Record<string, unknown>>
    ? Extract<keyof S["Type"], string>
    : string

export interface AdminResourceConfig<
  S extends AnyNoContext,
  Group extends AdminApiGroup = AdminApiGroup
> {
  readonly model: S
  readonly apiGroup: Group
  readonly name?: string
  readonly label?: string
  readonly primaryKey?: AdminFieldName<S>
  readonly list?: { readonly columns?: ReadonlyArray<AdminFieldName<S>> }
  readonly fields?: Partial<Record<AdminFieldName<S>, AdminFieldConfig>>
  readonly operations?: Partial<Record<ConventionalOperation, EndpointName<Group> | false>>
  readonly actions?: Readonly<Record<string, AdminActionConfig<EndpointName<Group>>>>
}

type GeneratedCrudApiGroup<
  Name extends string,
  S extends AnyNoContext,
  Create extends AnyNoContext,
  Update extends AnyNoContext
> = ReturnType<typeof makeCrudApiGroup<Name, S, Create, Update>>

export type AdminCrudResourceConfig<
  Name extends string,
  S extends AnyNoContext,
  Create extends AnyNoContext = AnyNoContext,
  Update extends AnyNoContext = AnyNoContext,
  Group extends AdminApiGroup = GeneratedCrudApiGroup<Name, S, Create, Update>
> = Omit<AdminResourceConfig<S, AdminApiGroup>, "apiGroup" | "name"> &
  Omit<AdminCrudApiConfig<Name, S, Create, Update>, "create" | "update"> & {
    readonly create?: Create
    readonly update?: Update
    readonly extendApiGroup?: (
      apiGroup: GeneratedCrudApiGroup<Name, S, Create, Update>
    ) => Group
  }

const humanize = (value: string) =>
  value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

const resolveOperations = (
  resourceName: string,
  apiGroup: AdminApiGroup,
  overrides: Partial<Record<ConventionalOperation, string | false>> | undefined
): Readonly<Partial<Record<ConventionalOperation, string>>> => {
  const operations: Partial<Record<ConventionalOperation, string>> = {}
  for (const operation of conventionalOperations) {
    const endpoint = overrides?.[operation]
    if (endpoint === false) continue
    const endpointName = endpoint ?? operation
    if (endpoint !== undefined && !(endpointName in apiGroup.endpoints)) {
      throw new Error(
        `effect-admin: resource "${resourceName}" operation "${operation}" ` +
        `references missing endpoint "${endpointName}"`
      )
    }
    if (endpointName in apiGroup.endpoints) operations[operation] = endpointName
  }
  return operations
}

const defineActions = (
  resourceName: string,
  apiGroup: AdminApiGroup,
  actions: Readonly<Record<string, AdminActionConfig<string>>> = {}
): Readonly<Record<string, AdminActionDef>> => {
  const entries: Array<[string, AdminActionDef]> = []
  for (const [name, action] of Object.entries(actions)) {
    const endpoint = apiGroup.endpoints[action.endpoint]
    if (!HttpApiEndpoint.isHttpApiEndpoint(endpoint)) {
      throw new Error(
        `effect-admin: resource "${resourceName}" action references missing endpoint "${action.endpoint}"`
      )
    }
    const payload = Array.from(endpoint.payload.values())[0]?.schemas[0]
    entries.push([name, {
      ...action,
      fields: payload ? introspect(payload.ast) : []
    }])
  }
  return Object.fromEntries(entries)
}

const mapEncoding = (
  encoding: AST.Encoding | undefined,
  transform: (ast: AST.AST) => AST.AST
): AST.Encoding | undefined =>
  encoding?.map((link) => new AST.Link(transform(link.to), link.transformation)) as
    | AST.Encoding
    | undefined

const rebuildObjects = (
  ast: AST.Objects,
  propertySignatures: ReadonlyArray<AST.PropertySignature>,
  encoding: AST.Encoding | undefined
): AST.Objects =>
  new AST.Objects(
    propertySignatures,
    ast.indexSignatures,
    ast.annotations,
    ast.checks,
    encoding,
    ast.context,
    ast.encodingChecks
  )

const selectProperties = (
  ast: AST.AST,
  indexes: ReadonlyArray<number>
): AST.AST => {
  if (!AST.isObjects(ast)) return ast
  const properties = indexes.flatMap((index) => {
    const property = ast.propertySignatures[index]
    return property ? [property] : []
  })
  return rebuildObjects(
    ast,
    properties,
    mapEncoding(ast.encoding, (target) => selectProperties(target, indexes))
  )
}

const optionalizeProperties = (ast: AST.AST): AST.AST => {
  if (!AST.isObjects(ast)) return ast
  return rebuildObjects(
    ast,
    ast.propertySignatures.map((property) =>
      new AST.PropertySignature(property.name, AST.optionalKey(property.type))
    ),
    mapEncoding(ast.encoding, optionalizeProperties)
  )
}

export const deriveAdminCreateSchema = <S extends AnyNoContext>(model: S): AnyNoContext => {
  const struct = resolveStruct(model.ast)
  const omitted = new Set(
    introspect(model.ast)
      .filter((field) => field.auto || field.readOnly || field.hidden)
      .map((field) => field.name)
  )
  if (omitted.size === 0) return model
  const indexes = struct.propertySignatures.flatMap((property, index) =>
    omitted.has(String(property.name)) ? [] : [index]
  )
  return Schema.make(selectProperties(struct, indexes) as never) as AnyNoContext
}

export const deriveAdminUpdateSchema = <S extends AnyNoContext>(create: S): AnyNoContext =>
  Schema.make(optionalizeProperties(resolveStruct(create.ast)) as never) as AnyNoContext

export const defineAdminResource = <
  S extends AnyNoContext,
  Group extends AdminApiGroup = AdminApiGroup
>(config: AdminResourceConfig<S, Group>): AdminResourceDef<S, Group> => {
  const name = config.name ?? config.apiGroup.identifier
  const fields = introspect(config.model.ast)
  const fieldConfig: Readonly<Partial<Record<string, AdminFieldConfig>>> = config.fields ?? {}
  const names = new Set(fields.map((field) => field.name))
  const primaryKey = config.primaryKey ?? "id"
  if (!names.has(primaryKey)) {
    throw new Error(`effect-admin: resource "${name}" has no primary key field "${primaryKey}"`)
  }

  const listColumns = config.list?.columns ?? fields
    .filter((field) => !field.hidden && !fieldConfig[field.name]?.hidden)
    .slice(0, 6)
    .map((field) => field.name)
  for (const field of listColumns) {
    if (!names.has(field)) {
      throw new Error(`effect-admin: resource "${name}" has no list field "${field}"`)
    }
  }

  return {
    name,
    label: config.label ?? humanize(name),
    model: config.model,
    apiGroup: config.apiGroup,
    groupName: config.apiGroup.identifier,
    primaryKey,
    fields,
    fieldConfig,
    listColumns,
    operations: resolveOperations(name, config.apiGroup, config.operations),
    actions: defineActions(name, config.apiGroup, config.actions)
  }
}

export const defineCrudResource = <
  const Name extends string,
  S extends AnyNoContext,
  Create extends AnyNoContext = AnyNoContext,
  Update extends AnyNoContext = AnyNoContext,
  Group extends AdminApiGroup = GeneratedCrudApiGroup<Name, S, Create, Update>
>(config: AdminCrudResourceConfig<Name, S, Create, Update, Group>): AdminResourceDef<S, Group> => {
  const {
    model,
    name,
    path,
    idParam,
    idParams,
    headers,
    create,
    update,
    extendApiGroup,
    ...resourceConfig
  } = config
  const createSchema = (create ?? deriveAdminCreateSchema(model)) as Create
  const updateSchema = (update ?? deriveAdminUpdateSchema(createSchema)) as Update
  const apiGroup = makeCrudApiGroup({
    model,
    name,
    create: createSchema,
    update: updateSchema,
    ...(path !== undefined ? { path } : {}),
    ...(idParam !== undefined ? { idParam } : {}),
    ...(idParams !== undefined ? { idParams } : {}),
    ...(headers !== undefined ? { headers } : {})
  })
  const finalApiGroup = extendApiGroup ? extendApiGroup(apiGroup) : apiGroup as unknown as Group
  return defineAdminResource({
    ...resourceConfig,
    model,
    name,
    apiGroup: finalApiGroup
  } as unknown as AdminResourceConfig<S, Group>)
}

export const makeAdminApi = <
  const Id extends string,
  const Resources extends ReadonlyArray<AdminResourceDef<AnyNoContext, AdminApiGroup>>
>(
  identifier: Id,
  resources: Resources,
  options?: { readonly prefix?: `/${string}` }
): HttpApi.HttpApi<
  Id,
  Resources[number]["apiGroup"] & HttpApiGroup.Constraint
> =>
  makeHttpAdminApi(
    identifier,
    resources.map((resource) => resource.apiGroup as HttpApiGroup.Constraint),
    options
  ) as HttpApi.HttpApi<Id, Resources[number]["apiGroup"] & HttpApiGroup.Constraint>

export type { AdminFieldAnnotation, FieldMeta }
