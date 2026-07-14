import * as FetchHttpClient from "@effect/platform/FetchHttpClient"
import * as HttpClient from "@effect/platform/HttpClient"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import type * as HttpApi from "@effect/platform/HttpApi"
import * as HttpApiClient from "@effect/platform/HttpApiClient"
import type * as Headers from "@effect/platform/Headers"
import * as Effect from "effect/Effect"
import type { AdminClient } from "./client.js"

export interface EffectAdminClientOptions {
  readonly headers?: Headers.Input | (() => Headers.Input) | undefined
  /**
   * Extra options for the underlying fetch implementation. Use this for
   * production cases such as cookie-backed sessions:
   * `{ credentials: "include" }`.
   */
  readonly fetchOptions?: RequestInit | undefined
  readonly transformClient?: ((client: HttpClient.HttpClient) => HttpClient.HttpClient) | undefined
  readonly transformResponse?:
    | ((effect: Effect.Effect<unknown, unknown>) => Effect.Effect<unknown, unknown>)
    | undefined
}

export interface DefaultAdminClientOptions extends EffectAdminClientOptions {
  readonly baseUrl?: URL | string | undefined
}

const withClientOptions = (options: EffectAdminClientOptions | undefined) =>
  (client: HttpClient.HttpClient): HttpClient.HttpClient => {
    const transformed = options?.transformClient ? options.transformClient(client) : client
    const headers = options?.headers
    if (!headers) return transformed
    return typeof headers === "function"
      ? HttpClient.mapRequestEffect(transformed, (request) =>
        Effect.sync(() => HttpClientRequest.setHeaders(request, headers()))
      )
      : HttpClient.mapRequest(transformed, HttpClientRequest.setHeaders(headers))
  }

/** Loaded lazily so applications that inject a client do not bundle it. */
export const makeDefaultAdminClient = (
  api: unknown,
  options: DefaultAdminClientOptions = {}
): Promise<AdminClient> =>
  Effect.runPromise(
    HttpApiClient.make(api as HttpApi.HttpApi.AnyWithProps, {
      baseUrl: options.baseUrl,
      transformClient: withClientOptions(options),
      transformResponse: options.transformResponse
    }).pipe(
      Effect.provide(FetchHttpClient.layer),
      options.fetchOptions
        ? Effect.provideService(FetchHttpClient.RequestInit, options.fetchOptions)
        : (effect) => effect
    ) as Effect.Effect<AdminClient, never, never>
  )
