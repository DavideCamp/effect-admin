import * as HttpApi from "@effect/platform/HttpApi"
import * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint"
import * as HttpApiGroup from "@effect/platform/HttpApiGroup"
import * as HttpApiSchema from "@effect/platform/HttpApiSchema"
import * as Schema from "effect/Schema"

/** A filter format every v1 list endpoint understands. */
export const AdminFilter = Schema.Struct({
  field: Schema.String,
  operator: Schema.Literal("eq", "contains", "gte", "lte"),
  value: Schema.Union(Schema.String, Schema.Number, Schema.Boolean)
})
export type AdminFilter = typeof AdminFilter.Type

/**
 * Conventional query schema for an admin `list` endpoint. `filters` is
 * encoded as JSON in one query parameter, while its decoded value stays a
 * typed array in handlers and HttpApi clients.
 */
export const AdminListParams = Schema.Struct({
  page: Schema.optionalWith(Schema.NumberFromString, { default: () => 1 }),
  pageSize: Schema.optionalWith(Schema.NumberFromString, { default: () => 25 }),
  orderBy: Schema.optional(Schema.String),
  orderDir: Schema.optional(Schema.Literal("asc", "desc")),
  search: Schema.optional(Schema.String),
  filters: Schema.optional(Schema.parseJson(Schema.Array(AdminFilter)))
})
export type AdminListParams = typeof AdminListParams.Type

export const AdminListResult = <A, I, R>(row: Schema.Schema<A, I, R>) =>
  Schema.Struct({
    rows: Schema.Array(row),
    total: Schema.Number
  })

export class AdminValidationError extends Schema.TaggedError<AdminValidationError>()(
  "AdminValidationError",
  {
    message: Schema.String,
    fields: Schema.optional(
      Schema.Record({ key: Schema.String, value: Schema.Array(Schema.String) })
    )
  }
) {}

export class AdminNotFound extends Schema.TaggedError<AdminNotFound>()(
  "AdminNotFound",
  { message: Schema.String }
) {}

export interface ResourceCapabilities {
  readonly list?: boolean
  readonly get?: boolean
  readonly create?: boolean
  readonly update?: boolean
  readonly delete?: boolean
  readonly actions?: Readonly<Record<string, boolean>>
}

export type AdminCapabilities = Readonly<Record<string, ResourceCapabilities>>

export interface AdminCrudApiConfig<
  Name extends string,
  Model extends Schema.Schema.AnyNoContext,
  Create extends Schema.Schema.AnyNoContext = Model,
  Update extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext
> {
  readonly name: Name
  readonly model: Model
  readonly path?: `/${string}`
  readonly idParam?: string
  readonly idPath?: Schema.Schema.AnyNoContext
  /**
   * Payload used by the generated `create` endpoint.
   *
   * Defaults to the model schema.
   */
  readonly create?: Create
  /**
   * Payload used by the generated `update` endpoint.
   *
   * Defaults to `Schema.partial(create ?? model)`.
   */
  readonly update?: Update
}

const defaultIdPath = Schema.Struct({ id: Schema.NumberFromString })

/**
 * Build a conventional CRUD `HttpApiGroup` from an Effect model schema.
 *
 * The generated endpoints are:
 * - `list`: `GET /<name>`
 * - `get`: `GET /<name>/:id`
 * - `create`: `POST /<name>`
 * - `update`: `PATCH /<name>/:id`
 * - `delete`: `DELETE /<name>/:id`
 */
export const makeCrudApiGroup = <
  const Name extends string,
  Model extends Schema.Schema.AnyNoContext,
  Create extends Schema.Schema.AnyNoContext = Model,
  Update extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext
>(config: AdminCrudApiConfig<Name, Model, Create, Update>) => {
  const path = config.path ?? `/${config.name}`
  const idParam = config.idParam ?? "id"
  const idPath = config.idPath ?? defaultIdPath
  const create = config.create ?? (config.model as unknown as Create)
  const update = config.update ?? Schema.partial(create as Schema.Schema.AnyNoContext)

  return HttpApiGroup.make(config.name)
    .addError(AdminNotFound, { status: 404 })
    .addError(AdminValidationError, { status: 400 })
    .add(HttpApiEndpoint.get("list", path).setUrlParams(AdminListParams).addSuccess(AdminListResult(config.model)))
    .add(HttpApiEndpoint.get("get", `${path}/:${idParam}`).setPath(idPath).addSuccess(config.model))
    .add(HttpApiEndpoint.post("create", path).setPayload(create).addSuccess(config.model, { status: 201 }))
    .add(HttpApiEndpoint.patch("update", `${path}/:${idParam}`).setPath(idPath).setPayload(update).addSuccess(config.model))
    .add(HttpApiEndpoint.del("delete", `${path}/:${idParam}`).setPath(idPath).addSuccess(HttpApiSchema.NoContent))
}

export const makeAdminApi = <
  const Id extends string,
  const Groups extends ReadonlyArray<HttpApiGroup.HttpApiGroup.Any>
>(
  identifier: Id,
  groups: Groups,
  options?: { readonly prefix?: `/${string}` }
): HttpApi.HttpApi<Id, Groups[number], any, never> => {
  let api = HttpApi.make(identifier) as unknown as HttpApi.HttpApi.AnyWithProps
  for (const group of groups) {
    api = api.add(group) as unknown as HttpApi.HttpApi.AnyWithProps
  }
  return (options?.prefix ? api.prefix(options.prefix) : api) as unknown as HttpApi.HttpApi<Id, Groups[number], any, never>
}
