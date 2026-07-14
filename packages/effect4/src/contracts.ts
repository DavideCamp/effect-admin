import { Effect, Schema } from "effect"
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema
} from "effect/unstable/httpapi"

export const AdminFilter = Schema.Struct({
  field: Schema.String,
  operator: Schema.Literals(["eq", "contains", "gte", "lte"]),
  value: Schema.Union([Schema.String, Schema.Number, Schema.Boolean])
})
export type AdminFilter = typeof AdminFilter.Type

export const AdminListParams = Schema.Struct({
  page: Schema.NumberFromString.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("1"))
  ),
  pageSize: Schema.NumberFromString.pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("25"))
  ),
  orderBy: Schema.optionalKey(Schema.String),
  orderDir: Schema.optionalKey(Schema.Literals(["asc", "desc"])),
  search: Schema.optionalKey(Schema.String),
  filters: Schema.optionalKey(Schema.fromJsonString(Schema.Array(AdminFilter)))
})
export type AdminListParams = typeof AdminListParams.Type

export const AdminListResult = <Row extends Schema.Top>(row: Row) =>
  Schema.Struct({
    rows: Schema.Array(row),
    total: Schema.Number
  })

export class AdminValidationError extends Schema.TaggedErrorClass<AdminValidationError>()(
  "AdminValidationError",
  {
    message: Schema.String,
    fields: Schema.optionalKey(Schema.Record(Schema.String, Schema.Array(Schema.String)))
  }
) {}

export class AdminNotFound extends Schema.TaggedErrorClass<AdminNotFound>()(
  "AdminNotFound",
  { message: Schema.String }
) {}

export class AdminForbidden extends Schema.TaggedErrorClass<AdminForbidden>()(
  "AdminForbidden",
  { message: Schema.String }
) {}

export const ResourceCapabilities = Schema.Struct({
  list: Schema.optionalKey(Schema.Boolean),
  get: Schema.optionalKey(Schema.Boolean),
  create: Schema.optionalKey(Schema.Boolean),
  update: Schema.optionalKey(Schema.Boolean),
  delete: Schema.optionalKey(Schema.Boolean),
  actions: Schema.optionalKey(Schema.Record(Schema.String, Schema.Boolean))
})
export type ResourceCapabilities = typeof ResourceCapabilities.Type

export const AdminCapabilities = Schema.Record(Schema.String, ResourceCapabilities)
export type AdminCapabilities = typeof AdminCapabilities.Type

export interface AdminCrudApiConfig<
  Name extends string,
  Model extends Schema.Top,
  Create extends Schema.Top = Model,
  Update extends Schema.Top = Schema.Top
> {
  readonly name: Name
  readonly model: Model
  readonly path?: `/${string}`
  readonly idParam?: string
  readonly idParams?: Schema.Top
  readonly headers?: Schema.Top
  readonly create?: Create
  readonly update?: Update
}

const adminErrors = [
  AdminNotFound.pipe(HttpApiSchema.status(404)),
  AdminForbidden.pipe(HttpApiSchema.status(403)),
  AdminValidationError.pipe(HttpApiSchema.status(400))
] as const

export const makeCrudApiGroup = <
  const Name extends string,
  Model extends Schema.Top,
  Create extends Schema.Top = Model,
  Update extends Schema.Top = Schema.Top
>(config: AdminCrudApiConfig<Name, Model, Create, Update>) => {
  const path = config.path ?? `/${config.name}`
  const idParam = config.idParam ?? "id"
  const idParams = config.idParams ?? Schema.Struct({ [idParam]: Schema.NumberFromString })
  const create = config.create ?? (config.model as unknown as Create)
  const update = config.update ?? (create as unknown as Update)
  const common = {
    error: adminErrors,
    ...(config.headers ? { headers: config.headers } : {})
  }

  return HttpApiGroup.make(config.name).add(
    HttpApiEndpoint.get("list", path, {
      ...common,
      query: AdminListParams,
      success: AdminListResult(config.model)
    }),
    HttpApiEndpoint.get("get", `${path}/:${idParam}`, {
      ...common,
      params: idParams,
      success: config.model
    }),
    HttpApiEndpoint.post("create", path, {
      ...common,
      payload: create,
      success: config.model.pipe(HttpApiSchema.status(201))
    }),
    HttpApiEndpoint.patch("update", `${path}/:${idParam}`, {
      ...common,
      params: idParams,
      payload: update,
      success: config.model
    }),
    HttpApiEndpoint.delete("delete", `${path}/:${idParam}`, {
      ...common,
      params: idParams,
      success: HttpApiSchema.NoContent
    })
  )
}

export const makeAdminApi = <
  const Id extends string,
  const Groups extends ReadonlyArray<HttpApiGroup.Constraint>
>(
  identifier: Id,
  groups: Groups,
  options?: { readonly prefix?: `/${string}` }
): HttpApi.HttpApi<Id, Groups[number]> => {
  let api = HttpApi.make(identifier) as unknown as HttpApi.Top
  for (const group of groups) api = api.add(group as HttpApiGroup.Top)
  return (options?.prefix ? api.prefix(options.prefix) : api) as unknown as HttpApi.HttpApi<
    Id,
    Groups[number]
  >
}
