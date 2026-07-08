import * as FetchHttpClient from "@effect/platform/FetchHttpClient"
import type * as HttpApi from "@effect/platform/HttpApi"
import * as HttpApiClient from "@effect/platform/HttpApiClient"
import * as Effect from "effect/Effect"
import type { AdminClient } from "./client.js"

/** Loaded lazily so applications that inject a client do not bundle it. */
export const makeDefaultAdminClient = (
  api: HttpApi.HttpApi.Any,
  baseUrl: string
): Promise<AdminClient> =>
  Effect.runPromise(
    HttpApiClient.make(api as HttpApi.HttpApi.AnyWithProps, { baseUrl }).pipe(
      Effect.provide(FetchHttpClient.layer)
    ) as Effect.Effect<AdminClient, never, never>
  )
