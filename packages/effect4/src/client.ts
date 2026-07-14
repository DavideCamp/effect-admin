import type { AdminClient } from "@effect-admin/shared"
import { Effect } from "effect"
import {
  FetchHttpClient,
  Headers,
  HttpClient,
  HttpClientRequest
} from "effect/unstable/http"
import { HttpApi, HttpApiClient, HttpApiGroup } from "effect/unstable/httpapi"

export interface Effect4AdminClientOptions {
  readonly baseUrl?: URL | string | undefined
  readonly headers?: Headers.Input | (() => Headers.Input) | undefined
  readonly fetchOptions?: RequestInit | undefined
  readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined
  readonly transformResponse?:
    | ((effect: Effect.Effect<unknown, unknown, unknown>) => Effect.Effect<unknown, unknown, unknown>)
    | undefined
}

const withClientOptions = (options: Effect4AdminClientOptions) =>
  (client: HttpClient.HttpClient): HttpClient.HttpClient => {
    const transformed = options.transformClient ? options.transformClient(client) : client
    const headers = options.headers
    if (!headers) return transformed
    return typeof headers === "function"
      ? HttpClient.mapRequestEffect(transformed, (request) =>
        Effect.sync(() => HttpClientRequest.setHeaders(request, headers()))
      )
      : HttpClient.mapRequest(transformed, HttpClientRequest.setHeaders(headers))
  }

const adaptRequest = (request: unknown): unknown => {
  if (typeof request !== "object" || request === null) return request
  const input = request as Readonly<Record<string, unknown>>
  const { path, urlParams, ...rest } = input
  return {
    ...rest,
    ...(path !== undefined ? { params: path } : {}),
    ...(urlParams !== undefined ? { query: urlParams } : {})
  }
}

const adaptClient = (client: unknown): AdminClient => {
  const output: Record<string, Record<string, (...args: ReadonlyArray<never>) => unknown>> = {}
  for (const [groupName, group] of Object.entries(client as Record<string, unknown>)) {
    if (typeof group !== "object" || group === null) continue
    const endpoints: Record<string, (...args: ReadonlyArray<never>) => unknown> = {}
    for (const [endpointName, endpoint] of Object.entries(group)) {
      if (typeof endpoint !== "function") continue
      endpoints[endpointName] = ((request?: unknown) =>
        endpoint(adaptRequest(request))) as (...args: ReadonlyArray<never>) => unknown
    }
    output[groupName] = endpoints
  }
  return output
}

/**
 * Effect 4 client adapter for the version-neutral React renderer.
 * It also translates Effect 3 request keys (`path`, `urlParams`) used by the
 * renderer to Effect 4 keys (`params`, `query`).
 */
export const makeEffect4AdminClient = <
  ApiId extends string,
  Groups extends HttpApiGroup.Constraint
>(
  api: HttpApi.HttpApi<ApiId, Groups>,
  options: Effect4AdminClientOptions = {}
): Promise<AdminClient> =>
  Effect.runPromise((() => {
    let program = HttpApiClient.make(api, {
      baseUrl: options.baseUrl,
      transformClient: withClientOptions(options),
      transformResponse: options.transformResponse
    }).pipe(Effect.provide(FetchHttpClient.layer))
    if (options.fetchOptions) {
      program = Effect.provideService(program, FetchHttpClient.RequestInit, options.fetchOptions)
    }
    return Effect.map(program, adaptClient) as Effect.Effect<AdminClient, never, never>
  })())
