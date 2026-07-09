import * as Effect from "effect/Effect"

export type AdminRecord = Record<string, unknown>

export interface AdminListResult {
  readonly rows: ReadonlyArray<AdminRecord>
  readonly total: number
}

export type AdminEndpoint<
  Request = unknown,
  Success = unknown,
  Error = unknown
> = (request: Request) => Effect.Effect<Success, Error, never>

export type AdminClient = Readonly<
  Record<string, Readonly<Record<string, AdminEndpoint<never>>>>
>

export const runEndpoint = <A, E>(effect: Effect.Effect<A, E, never>): Promise<A> =>
  Effect.runPromise(
    Effect.either(effect)
  ).then((result) => {
    if (result._tag === "Left") return Promise.reject(result.left)
    return result.right
  })
