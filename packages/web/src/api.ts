import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema
} from "@effect/platform"
import { Effect, Layer, Schema } from "effect"
import { AdminRepo, type ListFilter, type ListOpts, type ResourceDef } from "@effect-admin/core"

// ---------------------------------------------------------------------------
// Wire-level error bodies (plan, correction #5). Discriminated by `error`,
// so the union encoder always picks the right schema.
// `RepoError` maps to the opaque 500: the cause never leaks to the client.
// ---------------------------------------------------------------------------

const NotFoundHttp = Schema.Struct({
  error: Schema.Literal("not_found")
}).annotations(HttpApiSchema.annotations({ status: 404 }))

const ValidationHttp = Schema.Struct({
  error: Schema.Literal("validation"),
  message: Schema.String
}).annotations(HttpApiSchema.annotations({ status: 400 }))

const InternalHttp = Schema.Struct({
  error: Schema.Literal("internal")
}).annotations(HttpApiSchema.annotations({ status: 500 }))

const notFound = { error: "not_found" } as const
const internal = { error: "internal" } as const

// ---------------------------------------------------------------------------
// GET /_schema response: what the UI needs to build itself.
// ---------------------------------------------------------------------------

const FieldMetaSchema = Schema.Struct({
  name: Schema.String,
  title: Schema.String,
  kind: Schema.String,
  optional: Schema.Boolean,
  auto: Schema.Boolean,
  nullable: Schema.Boolean,
  options: Schema.optional(Schema.Array(Schema.Union(Schema.String, Schema.Number)))
})

const SchemaResponse = Schema.Struct({
  resources: Schema.Array(
    Schema.Struct({
      name: Schema.String,
      primaryKey: Schema.String,
      readOnly: Schema.Boolean,
      fields: Schema.Array(FieldMetaSchema),
      listColumns: Schema.Array(Schema.String)
    })
  )
})

// ---------------------------------------------------------------------------
// List query params (roadmap F2). The schema is built per resource from its
// FieldMeta, so filterable/sortable columns are WHITELISTED at the HTTP
// boundary — an unknown `orderBy` or filter key fails decoding, it never
// reaches the repo. Values arrive as strings (query params) and are coerced
// by field kind in `toListOpts`.
//
//   page, pageSize, orderBy, orderDir, search
//   f_<name>        eq       (select: literal value, checkbox: true|false)
//   f_<name>_min/max range   (number, date)
// ---------------------------------------------------------------------------

const listParamsSchema = (r: ResourceDef) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const props: Record<string, any> = {
    page: Schema.optional(Schema.NumberFromString),
    pageSize: Schema.optional(Schema.NumberFromString),
    orderDir: Schema.optional(Schema.Literal("asc", "desc")),
    search: Schema.optional(Schema.String)
  }
  const sortable = r.fields.filter((f) => f.kind !== "unsupported").map((f) => f.name)
  if (sortable.length > 0) {
    props.orderBy = Schema.optional(Schema.Literal(...(sortable as [string, ...Array<string>])))
  }
  for (const f of r.fields) {
    switch (f.kind) {
      case "select":
        props[`f_${f.name}`] = Schema.optional(Schema.String)
        break
      case "checkbox":
        props[`f_${f.name}`] = Schema.optional(Schema.Literal("true", "false"))
        break
      case "number":
      case "date":
        props[`f_${f.name}_min`] = Schema.optional(Schema.String)
        props[`f_${f.name}_max`] = Schema.optional(Schema.String)
        break
    }
  }
  return Schema.Struct(props)
}

const toListOpts = (r: ResourceDef, p: Record<string, unknown>): ListOpts => {
  const filters: Array<ListFilter> = []
  for (const f of r.fields) {
    const raw = p[`f_${f.name}`]
    if (f.kind === "select" && typeof raw === "string" && raw !== "") {
      const numeric = f.options?.every((o) => typeof o === "number") ?? false
      const value = numeric ? Number(raw) : raw
      filters.push({ _tag: "eq", field: f.name, value })
    } else if (f.kind === "checkbox" && (raw === "true" || raw === "false")) {
      filters.push({ _tag: "eq", field: f.name, value: raw === "true" })
    } else if (f.kind === "number" || f.kind === "date") {
      const coerce = (v: unknown): number | Date | undefined => {
        if (typeof v !== "string" || v === "") return undefined
        const parsed = f.kind === "number" ? Number(v) : new Date(v)
        return Number.isNaN(parsed.valueOf()) ? undefined : parsed
      }
      const min = coerce(p[`f_${f.name}_min`])
      const max = coerce(p[`f_${f.name}_max`])
      if (min !== undefined || max !== undefined) {
        filters.push({
          _tag: "range",
          field: f.name,
          ...(min !== undefined ? { min } : {}),
          ...(max !== undefined ? { max } : {})
        })
      }
    }
  }
  return {
    ...(typeof p.page === "number" ? { page: p.page } : {}),
    ...(typeof p.pageSize === "number" ? { pageSize: p.pageSize } : {}),
    ...(typeof p.orderBy === "string" ? { orderBy: p.orderBy } : {}),
    ...(p.orderDir === "asc" || p.orderDir === "desc" ? { orderDir: p.orderDir } : {}),
    ...(typeof p.search === "string" && p.search !== "" ? { search: p.search } : {}),
    filters
  }
}

// ---------------------------------------------------------------------------
// API definition: one HttpApiGroup per resource + the meta group.
// Read-only resources (D5) get list/get ONLY: write endpoints are not
// registered at all, so the OpenAPI spec tells the truth and a write
// attempt is a plain 404.
//
// The api is assembled in a loop, so the endpoints' static types degrade to
// the runtime-checked level (`any` at the assembly seams). Schemas still
// validate every request and encode every response — only the *static*
// typing of handlers is loose. Full static typing end-to-end is roadmap F5.
// ---------------------------------------------------------------------------

// HTTP path params are strings: NumberFromString does the conversion
// (plan, correction #4).
const IdPath = Schema.Struct({ id: Schema.NumberFromString })

const resourceGroup = (r: ResourceDef) => {
  const full = r.schemas.full as Schema.Schema<unknown, unknown, never>
  const base = `/${r.name}` as const
  const byId = `/${r.name}/:id` as const
  const ListResponse = Schema.Struct({
    rows: Schema.Array(full),
    total: Schema.Number
  })
  const readGroup = HttpApiGroup.make(r.name)
    .add(
      HttpApiEndpoint.get("list", base)
        .setUrlParams(listParamsSchema(r) as Schema.Schema.Any)
        .addSuccess(ListResponse)
        .addError(InternalHttp)
    )
    .add(
      HttpApiEndpoint.get("get", byId)
        .setPath(IdPath)
        .addSuccess(full)
        .addError(NotFoundHttp)
        .addError(InternalHttp)
    )
  if (r.readOnly) return readGroup
  return readGroup
    .add(
      HttpApiEndpoint.post("create", base)
        .setPayload(r.schemas.create as Schema.Schema<unknown, unknown, never>)
        .addSuccess(full, { status: 201 })
        .addError(ValidationHttp)
        .addError(InternalHttp)
    )
    .add(
      HttpApiEndpoint.patch("update", byId)
        .setPath(IdPath)
        .setPayload(r.schemas.update as Schema.Schema<unknown, unknown, never>)
        .addSuccess(full)
        .addError(ValidationHttp)
        .addError(NotFoundHttp)
        .addError(InternalHttp)
    )
    .add(
      HttpApiEndpoint.del("delete", byId)
        .setPath(IdPath)
        .addSuccess(HttpApiSchema.NoContent)
        .addError(ValidationHttp)
        .addError(NotFoundHttp)
        .addError(InternalHttp)
    )
}

const metaGroup = HttpApiGroup.make("meta").add(
  HttpApiEndpoint.get("schema", "/_schema").addSuccess(SchemaResponse)
)

/**
 * The API is mounted under `${basePath}/api` — the base path comes from the
 * router config (decision D2: the host app chooses where the admin lives).
 */
export const makeAdminApi = (
  resources: ReadonlyArray<ResourceDef>,
  basePath: `/${string}`
) => {
  let api = HttpApi.make("admin") as HttpApi.HttpApi.Any
  for (const r of resources) {
    api = (api as HttpApi.HttpApi<"admin", never>).add(resourceGroup(r) as never)
  }
  api = (api as HttpApi.HttpApi<"admin", never>).add(metaGroup as never)
  return (api as HttpApi.HttpApi<"admin", never>).prefix(`${basePath}/api`)
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * The payload arrives already decoded by the endpoint schema; the repo
 * decodes its own input too (defense in depth, it must not trust callers).
 * Re-encode before handing it over so the round trip stays correct even for
 * transformed fields (e.g. a Date field: decoded Date → encoded ISO string).
 */
const reencode = (schema: Schema.Schema.AnyNoContext, value: unknown) =>
  Schema.encodeUnknown(schema)(value).pipe(Effect.orDie)

const failInternal = (e: unknown) =>
  Effect.logError("repo failure", e).pipe(Effect.zipRight(Effect.fail(internal)))

const failValidation = (e: { message: string }) =>
  Effect.fail({ error: "validation", message: e.message } as const)

const resourceHandlersLayer = (
  api: ReturnType<typeof makeAdminApi>,
  r: ResourceDef
): Layer.Layer<never, never, AdminRepo> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (HttpApiBuilder.group as any)(api, r.name, (handlers: any) => {
    let h = handlers
      .handle("list", ({ urlParams }: { urlParams: Record<string, unknown> }) =>
        AdminRepo.pipe(
          Effect.flatMap((repo) => repo.list(r, toListOpts(r, urlParams))),
          Effect.catchTag("RepoError", failInternal)
        )
      )
      .handle("get", ({ path }: { path: { id: number } }) =>
        AdminRepo.pipe(
          Effect.flatMap((repo) => repo.get(r, path.id)),
          Effect.catchTags({
            NotFound: () => Effect.fail(notFound),
            RepoError: failInternal
          })
        )
      )
    if (!r.readOnly) {
      h = h
        .handle("create", ({ payload }: { payload: unknown }) =>
          AdminRepo.pipe(
            Effect.flatMap((repo) =>
              reencode(r.schemas.create, payload).pipe(
                Effect.flatMap((data) => repo.create(r, data))
              )
            ),
            Effect.catchTags({
              ValidationError: failValidation,
              RepoError: failInternal
            })
          )
        )
        .handle(
          "update",
          ({ path, payload }: { path: { id: number }; payload: unknown }) =>
            AdminRepo.pipe(
              Effect.flatMap((repo) =>
                reencode(r.schemas.update, payload).pipe(
                  Effect.flatMap((data) => repo.update(r, path.id, data))
                )
              ),
              Effect.catchTags({
                NotFound: () => Effect.fail(notFound),
                ValidationError: failValidation,
                RepoError: failInternal
              })
            )
        )
        .handle("delete", ({ path }: { path: { id: number } }) =>
          AdminRepo.pipe(
            Effect.flatMap((repo) => repo.del(r, path.id)),
            Effect.catchTags({
              NotFound: () => Effect.fail(notFound),
              ValidationError: failValidation,
              RepoError: failInternal
            })
          )
        )
    }
    return h
  })

const metaHandlersLayer = (
  api: ReturnType<typeof makeAdminApi>,
  resources: ReadonlyArray<ResourceDef>
): Layer.Layer<never> => {
  const body = {
    resources: resources.map((r) => ({
      name: r.name,
      primaryKey: r.primaryKey,
      readOnly: r.readOnly,
      fields: r.fields,
      listColumns: r.list?.columns ?? r.fields.map((f) => f.name)
    }))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (HttpApiBuilder.group as any)(api, "meta", (handlers: any) =>
    handlers.handle("schema", () => Effect.succeed(body))
  )
}

/** Every group's handlers, merged: the only layer main.ts needs for the API. */
export const makeAdminApiHandlers = (
  api: ReturnType<typeof makeAdminApi>,
  resources: ReadonlyArray<ResourceDef>
): Layer.Layer<never, never, AdminRepo> =>
  Layer.mergeAll(
    metaHandlersLayer(api, resources),
    ...resources.map((r) => resourceHandlersLayer(api, r))
  )
