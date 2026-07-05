import type { ResourceDef } from "@effect-admin/core"
import { HttpApiScalar, HttpLayerRouter, HttpServerResponse } from "@effect/platform"
import { Effect, Layer } from "effect"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { makeAdminApi, makeAdminApiHandlers } from "./api.js"

export interface AdminRouterConfig {
  readonly resources: ReadonlyArray<ResourceDef>
  /** Where the host app mounts the admin. Default: "/admin". */
  readonly basePath?: `/${string}`
}

/**
 * The primary attachment point of effect-admin (decision D2, Django's
 * `admin.site.urls` analogy): a set of routes the host app merges into its
 * own `HttpLayerRouter.serve(...)`. Everything lives under `basePath`:
 *
 *   GET  {base}, {base}/*        UI (list & detail pages, client-side routed)
 *   *    {base}/api/...          JSON CRUD + /_schema
 *   GET  {base}/api/openapi.json OpenAPI spec
 *   GET  {base}/docs             interactive API docs (Scalar)
 *
 * Requires the `AdminRepo` service: the host provides the storage Layer
 * (in-memory today, `@effect-admin/sql` from roadmap F1).
 */
export const makeAdminRouter = (config: AdminRouterConfig) => {
  const basePath = config.basePath ?? "/admin"
  const api = makeAdminApi(config.resources, basePath)

  const ApiRoutes = HttpLayerRouter.addHttpApi(api, {
    openapiPath: `${basePath}/api/openapi.json`
  }).pipe(Layer.provide(makeAdminApiHandlers(api, config.resources)))

  const DocsRoutes = HttpApiScalar.layerHttpLayerRouter({
    api,
    path: `${basePath}/docs`
  })

  // The UI is a single static page whose JS builds itself from /_schema.
  // The base path is injected at serve time so the page works wherever the
  // host mounts it. (Server-rendered pages replace this over F1–F4, D8.)
  const html = readFileSync(
    fileURLToPath(new URL("./ui/index.html", import.meta.url)),
    "utf8"
  ).replaceAll("%ADMIN_BASE%", basePath)

  // Deep links like {base}/products/4/edit get the same page: the client
  // routes on the URL. Static routes (api, docs) win over the wildcard.
  const page = Effect.succeed(HttpServerResponse.html(html))
  const UiRoutes = Layer.mergeAll(
    HttpLayerRouter.add("GET", basePath, page),
    HttpLayerRouter.add("GET", `${basePath}/*`, page)
  )

  return Layer.mergeAll(ApiRoutes, DocsRoutes, UiRoutes)
}
