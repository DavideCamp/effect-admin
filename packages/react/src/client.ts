import type { AdminTask } from "@effect-admin/shared"

export type {
  AdminClient,
  AdminEndpoint,
  AdminListResultValue as AdminListResult,
  AdminRecord,
  AdminTask
} from "@effect-admin/shared"

const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  typeof value === "object" && value !== null && "then" in value &&
  typeof value.then === "function"

export const runEndpoint = async <A, E>(task: AdminTask<A, E>): Promise<A> => {
  if (isPromiseLike(task)) return task as PromiseLike<A>
  const Effect = await import("effect/Effect")
  const result = await Effect.runPromise(Effect.either(task as never)) as
    | { readonly _tag: "Left"; readonly left: E }
    | { readonly _tag: "Right"; readonly right: A }
  if (result._tag === "Left") throw result.left
  return result.right
}
