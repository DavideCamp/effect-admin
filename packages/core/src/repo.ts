import { Context, Effect } from "effect"
import type { ResourceDef } from "./resource.js"
import { type ListOpts, type ListResult, type NotFound, RepoError, ValidationError } from "./types.js"

/**
 * Storage abstraction. Core provides an in-memory Layer; `@effect-admin/sql`
 * implements the same Tag on Postgres — HTTP and UI never notice the swap.
 *
 * Contract: `create` ALWAYS returns the complete row including the
 * generated id — identical to SQL's `INSERT ... RETURNING`. `list` returns
 * rows AND the un-paginated total.
 */
export class AdminRepo extends Context.Tag("AdminRepo")<
  AdminRepo,
  {
    readonly list: (
      r: ResourceDef,
      opts: ListOpts
    ) => Effect.Effect<ListResult, RepoError>
    readonly get: (
      r: ResourceDef,
      id: number
    ) => Effect.Effect<unknown, NotFound | RepoError>
    readonly create: (
      r: ResourceDef,
      data: unknown
    ) => Effect.Effect<unknown, ValidationError | RepoError>
    readonly update: (
      r: ResourceDef,
      id: number,
      data: unknown
    ) => Effect.Effect<unknown, NotFound | ValidationError | RepoError>
    readonly del: (
      r: ResourceDef,
      id: number
    ) => Effect.Effect<void, NotFound | ValidationError | RepoError>
  }
>() {}

/**
 * Defense in depth for read-only resources (D5): the API does not even
 * register write endpoints for them, but a repo must not trust its
 * callers — every implementation guards writes with this.
 */
export const assertWritable = (r: ResourceDef): Effect.Effect<void, ValidationError> =>
  r.readOnly
    ? Effect.fail(
        new ValidationError({ message: `resource "${r.name}" is read-only` })
      )
    : Effect.void
