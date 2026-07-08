import * as Effect from "effect/Effect"

export type AdminClient = Readonly<
  Record<string, Readonly<Record<string, (request?: any) => Effect.Effect<any, any, any>>>>
>

export const runEndpoint = <A>(effect: Effect.Effect<A, unknown, any>): Promise<A> =>
  Effect.runPromise(
    Effect.either(effect as Effect.Effect<A, unknown, never>)
  ).then((result) => {
    if (result._tag === "Left") return Promise.reject(result.left)
    return result.right
  })
