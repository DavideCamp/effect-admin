import {
  makeAdminApi as makeHttpAdminApi,
  makeCrudApiGroup,
  type AdminCrudApiConfig
} from "@effect-admin/contracts"
import type * as HttpApi from "@effect/platform/HttpApi"
import type * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint"
import type * as HttpApiGroup from "@effect/platform/HttpApiGroup"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { introspect } from "./introspect.js"
import type { FieldMeta } from "./types.js"

export type ConventionalOperation = "list" | "get" | "create" | "update" | "delete"

const conventionalOperations = ["list", "get", "create", "update", "delete"] as const

/** The small runtime surface effect-admin needs from an HttpApiGroup. */
export interface AdminApiGroup<
  Endpoints extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> {
  readonly identifier: string
  readonly endpoints: Endpoints
}

export interface AdminFieldConfig {
  readonly hidden?: boolean
  readonly readOnly?: boolean
  readonly widget?: "text" | "textarea" | "number" | "checkbox" | "select" | "date"
  readonly width?: number | string
}

type EndpointNames<Group extends AdminApiGroup> =
  Group extends HttpApiGroup.HttpApiGroup.Any
    ? HttpApiEndpoint.HttpApiEndpoint.Name<HttpApiGroup.HttpApiGroup.Endpoints<Group>>
    : Extract<keyof Group["endpoints"], string>

type EndpointName<Group extends AdminApiGroup> =
  string extends EndpointNames<Group> ? string : EndpointNames<Group>

export interface AdminActionConfig<Endpoint extends string = string> {
  readonly endpoint: Endpoint
  readonly label?: string
  readonly confirm?: string
}

export interface AdminActionDef extends AdminActionConfig {
  /** Derived from the action endpoint body payload; empty for payload-free actions. */
  readonly fields: ReadonlyArray<FieldMeta>
}

/**
 * Decoded model field keys accepted by resource configuration.
 *
 * Runtime metadata remains string-based because it is derived from Schema AST,
 * but public config should catch simple typos such as `"full_name"` when the
 * decoded model key is `fullName`.
 */
export type AdminFieldName<S extends Schema.Schema.AnyNoContext> =
  Schema.Schema.Type<S> extends Readonly<Record<string, unknown>>
    ? Extract<keyof Schema.Schema.Type<S>, string>
    : string

export interface AdminResourceConfig<
  S extends Schema.Schema.AnyNoContext,
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

export interface AdminResourceDef<
  S extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
  Group extends AdminApiGroup = AdminApiGroup
> {
  readonly name: string
  readonly label: string
  readonly model: S
  readonly apiGroup: Group
  readonly groupName: string
  readonly primaryKey: string
  readonly fields: ReadonlyArray<FieldMeta>
  readonly fieldConfig: Readonly<Partial<Record<string, AdminFieldConfig>>>
  readonly listColumns: ReadonlyArray<string>
  readonly operations: Readonly<Partial<Record<ConventionalOperation, string>>>
  readonly actions: Readonly<Record<string, AdminActionDef>>
}

type GeneratedCrudApiGroup<
  Name extends string,
  S extends Schema.Schema.AnyNoContext,
  Create extends Schema.Schema.AnyNoContext,
  Update extends Schema.Schema.AnyNoContext
> = ReturnType<typeof makeCrudApiGroup<Name, S, Create, Update>>

export type AdminCrudResourceConfig<
  Name extends string,
  S extends Schema.Schema.AnyNoContext,
  Create extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
  Update extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
  Group extends AdminApiGroup = GeneratedCrudApiGroup<Name, S, Create, Update>
> = Omit<AdminResourceConfig<S, AdminApiGroup>, "apiGroup" | "name"> &
  Omit<AdminCrudApiConfig<Name, S, Create, Update>, "create" | "update"> & {
  /**
   * Override the generated create payload. By default effect-admin derives it
   * from the model, omitting admin-managed fields.
   */
  readonly create?: Create
  /**
   * Override the generated update payload. By default effect-admin uses
   * `Schema.partial(create)`.
   */
  readonly update?: Update
  readonly extendApiGroup?: (
    apiGroup: GeneratedCrudApiGroup<Name, S, Create, Update>
  ) => Group
}

const humanize = (value: string) =>
  value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

type EndpointWithPayload = {
  readonly payloadSchema?: Option.Option<Schema.Schema.Any>
}

const hasPayloadSchema = (value: unknown): value is EndpointWithPayload =>
  typeof value === "object" && value !== null && "payloadSchema" in value

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
    if (!endpoint) {
      throw new Error(
        `effect-admin: resource "${resourceName}" action references missing endpoint "${action.endpoint}"`
      )
    }
    const payload = hasPayloadSchema(endpoint) && endpoint.payloadSchema
      ? Option.getOrUndefined(endpoint.payloadSchema)
      : undefined
    entries.push([name, {
      ...action,
      fields: payload ? introspect(payload.ast) : []
    }])
  }
  return Object.fromEntries(entries)
}

export const deriveAdminCreateSchema = <S extends Schema.Schema.AnyNoContext>(
  model: S
): Schema.Schema.AnyNoContext => {
  const omittedFields = introspect(model.ast)
    .filter((field) => field.auto || field.readOnly || field.hidden)
    .map((field) => field.name)

  if (omittedFields.length === 0) return model
  const omitFields = Schema.omit as unknown as (
    ...keys: ReadonlyArray<string>
  ) => (schema: Schema.Schema.AnyNoContext) => Schema.Schema.AnyNoContext
  return omitFields(...omittedFields)(model)
}

export const deriveAdminUpdateSchema = <S extends Schema.Schema.AnyNoContext>(
  create: S
): Schema.Schema.AnyNoContext =>
  Schema.partial(create)

export const defineAdminResource = <
  S extends Schema.Schema.AnyNoContext,
  Group extends AdminApiGroup = AdminApiGroup
>(
  config: AdminResourceConfig<S, Group>
): AdminResourceDef<S, Group> => {
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
  S extends Schema.Schema.AnyNoContext,
  Create extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
  Update extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext,
  Group extends AdminApiGroup = GeneratedCrudApiGroup<Name, S, Create, Update>
>(
  config: AdminCrudResourceConfig<Name, S, Create, Update, Group>
): AdminResourceDef<S, Group> => {
  const {
    model,
    name,
    path,
    idParam,
    idPath,
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
    ...(idPath !== undefined ? { idPath } : {}),
    ...(headers !== undefined ? { headers } : {})
  })
  const finalApiGroup = extendApiGroup
    ? extendApiGroup(apiGroup)
    : apiGroup as unknown as Group
  return defineAdminResource({
    ...resourceConfig,
    model,
    name,
    apiGroup: finalApiGroup
  } as unknown as AdminResourceConfig<S, Group>)
}

export const validateAdminResources = (
  resources: ReadonlyArray<AdminResourceDef>
): void => {
  const resourcesByName = new Map<string, AdminResourceDef>()
  const resourcesByGroupName = new Map<string, AdminResourceDef>()
  for (const resource of resources) {
    if (resourcesByName.has(resource.name)) {
      throw new Error(`effect-admin: duplicate resource name "${resource.name}"`)
    }
    if (resourcesByGroupName.has(resource.groupName)) {
      throw new Error(`effect-admin: duplicate resource api group "${resource.groupName}"`)
    }
    resourcesByName.set(resource.name, resource)
    resourcesByGroupName.set(resource.groupName, resource)
  }

  for (const resource of resources) {
    for (const field of resource.fields) {
      const relation = field.relation
      if (!relation) continue
      const target = resourcesByName.get(relation.resource)
      if (!target) {
        throw new Error(
          `effect-admin: resource "${resource.name}" field "${field.name}" ` +
          `references missing relation resource "${relation.resource}"`
        )
      }
      const displayField = relation.displayField
      if (displayField && !target.fields.some((field) => field.name === displayField)) {
        throw new Error(
          `effect-admin: resource "${resource.name}" field "${field.name}" ` +
          `references missing display field "${displayField}" on "${relation.resource}"`
        )
      }
    }
  }
}

export const makeAdminApi = <
  const Id extends string,
  const Resources extends ReadonlyArray<AdminResourceDef<Schema.Schema.AnyNoContext, AdminApiGroup>>
>(
  identifier: Id,
  resources: Resources,
  options?: { readonly prefix?: `/${string}` }
): HttpApi.HttpApi<
  Id,
  Resources[number]["apiGroup"] & HttpApiGroup.HttpApiGroup.Any,
  HttpApiGroup.HttpApiGroup.Error<Resources[number]["apiGroup"] & HttpApiGroup.HttpApiGroup.Any>,
  never
> =>
  makeHttpAdminApi(
    identifier,
    resources.map((resource) => resource.apiGroup as unknown as HttpApiGroup.HttpApiGroup.Any),
    options
  ) as unknown as HttpApi.HttpApi<
    Id,
    Resources[number]["apiGroup"] & HttpApiGroup.HttpApiGroup.Any,
    HttpApiGroup.HttpApiGroup.Error<Resources[number]["apiGroup"] & HttpApiGroup.HttpApiGroup.Any>,
    never
  >
