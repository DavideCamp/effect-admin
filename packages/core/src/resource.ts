import {
  makeAdminApi as makeHttpAdminApi,
  makeCrudApiGroup,
  type AdminCrudApiConfig
} from "@effect-admin/contracts"
import type * as HttpApi from "@effect/platform/HttpApi"
import type * as HttpApiGroup from "@effect/platform/HttpApiGroup"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { introspect } from "./introspect.js"
import type { FieldMeta } from "./types.js"

export type ConventionalOperation = "list" | "get" | "create" | "update" | "delete"

/** The small runtime surface effect-admin needs from an HttpApiGroup. */
export interface AdminApiGroup {
  readonly identifier: string
  readonly endpoints: Readonly<Record<string, unknown>>
}

export interface AdminFieldConfig {
  readonly hidden?: boolean
  readonly readOnly?: boolean
  readonly widget?: "text" | "textarea" | "number" | "checkbox" | "select" | "date"
  readonly width?: number | string
}

export interface AdminActionConfig {
  readonly endpoint: string
  readonly label?: string
  readonly confirm?: string
}

export interface AdminActionDef extends AdminActionConfig {
  /** Derived from the action endpoint body payload; empty for payload-free actions. */
  readonly fields: ReadonlyArray<FieldMeta>
}

export interface AdminResourceConfig<
  S extends Schema.Schema.AnyNoContext,
  Group extends AdminApiGroup = AdminApiGroup
> {
  readonly model: S
  readonly apiGroup: Group
  readonly name?: string
  readonly label?: string
  readonly primaryKey?: string
  readonly list?: { readonly columns?: ReadonlyArray<string> }
  readonly fields?: Readonly<Record<string, AdminFieldConfig>>
  readonly operations?: Partial<Record<ConventionalOperation, string | false>>
  readonly actions?: Readonly<Record<string, AdminActionConfig>>
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
  readonly fieldConfig: Readonly<Record<string, AdminFieldConfig>>
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
> = Omit<AdminResourceConfig<S>, "apiGroup" | "name"> &
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

export const deriveAdminCreateSchema = <S extends Schema.Schema.AnyNoContext>(
  model: S
): Schema.Schema.AnyNoContext => {
  const omittedFields = introspect(model.ast)
    .filter((field) => field.auto || field.readOnly || field.hidden || field.sensitive)
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
  const names = new Set(fields.map((field) => field.name))
  const primaryKey = config.primaryKey ?? "id"
  if (!names.has(primaryKey)) {
    throw new Error(`effect-admin: resource "${name}" has no primary key field "${primaryKey}"`)
  }

  const listColumns = config.list?.columns ?? fields
    .filter((field) => !field.hidden && !config.fields?.[field.name]?.hidden)
    .slice(0, 6)
    .map((field) => field.name)
  for (const field of listColumns) {
    if (!names.has(field)) {
      throw new Error(`effect-admin: resource "${name}" has no list field "${field}"`)
    }
  }

  const operations: Partial<Record<ConventionalOperation, string>> = {}
  for (const operation of ["list", "get", "create", "update", "delete"] as const) {
    const endpoint = config.operations?.[operation]
    if (endpoint === false) continue
    const endpointName = endpoint ?? operation
    if (endpointName in config.apiGroup.endpoints) operations[operation] = endpointName
  }

  for (const action of Object.values(config.actions ?? {})) {
    if (!(action.endpoint in config.apiGroup.endpoints)) {
      throw new Error(
        `effect-admin: resource "${name}" action references missing endpoint "${action.endpoint}"`
      )
    }
  }

  const actions = Object.fromEntries(
    Object.entries(config.actions ?? {}).map(([name, action]) => {
      const endpoint = config.apiGroup.endpoints[action.endpoint] as {
        readonly payloadSchema?: Option.Option<Schema.Schema.Any>
      }
      const payload = endpoint.payloadSchema
        ? Option.getOrUndefined(endpoint.payloadSchema)
        : undefined
      return [name, {
        ...action,
        fields: payload ? introspect(payload.ast) : []
      } satisfies AdminActionDef]
    })
  )

  return {
    name,
    label: config.label ?? humanize(name),
    model: config.model,
    apiGroup: config.apiGroup,
    groupName: config.apiGroup.identifier,
    primaryKey,
    fields,
    fieldConfig: config.fields ?? {},
    listColumns,
    operations,
    actions
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
    create,
    update,
    extendApiGroup,
    ...resourceConfig
  } = config
  const crudConfig: Record<string, unknown> = { model, name }
  if (path !== undefined) crudConfig.path = path
  if (idParam !== undefined) crudConfig.idParam = idParam
  if (idPath !== undefined) crudConfig.idPath = idPath
  const createSchema = create ?? deriveAdminCreateSchema(model)
  crudConfig.create = createSchema
  crudConfig.update = update ?? deriveAdminUpdateSchema(createSchema)

  const apiGroup = makeCrudApiGroup(crudConfig as unknown as AdminCrudApiConfig<Name, S, Create, Update>)
  const finalApiGroup = extendApiGroup
    ? extendApiGroup(apiGroup)
    : apiGroup as unknown as Group
  return defineAdminResource({
    ...resourceConfig,
    model,
    name,
    apiGroup: finalApiGroup
  })
}

export const validateAdminResources = (
  resources: ReadonlyArray<AdminResourceDef>
): void => {
  const names = new Set<string>()
  for (const resource of resources) {
    if (names.has(resource.name)) {
      throw new Error(`effect-admin: duplicate resource name "${resource.name}"`)
    }
    names.add(resource.name)
  }

  for (const resource of resources) {
    for (const field of resource.fields) {
      const relation = field.relation
      if (relation && !names.has(relation.resource)) {
        throw new Error(
          `effect-admin: resource "${resource.name}" field "${field.name}" ` +
          `references missing relation resource "${relation.resource}"`
        )
      }
      if (relation) {
        const target = resources.find((item) => item.name === relation.resource)
        const displayField = relation.displayField
        if (target && displayField && !target.fields.some((field) => field.name === displayField)) {
          throw new Error(
            `effect-admin: resource "${resource.name}" field "${field.name}" ` +
            `references missing display field "${displayField}" on "${relation.resource}"`
          )
        }
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
): HttpApi.HttpApi<Id, Resources[number]["apiGroup"] & HttpApiGroup.HttpApiGroup.Any, any, never> =>
  makeHttpAdminApi(
    identifier,
    resources.map((resource) => resource.apiGroup as unknown as HttpApiGroup.HttpApiGroup.Any),
    options
  ) as unknown as HttpApi.HttpApi<Id, Resources[number]["apiGroup"] & HttpApiGroup.HttpApiGroup.Any, any, never>
