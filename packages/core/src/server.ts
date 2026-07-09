import type { AdminListParams } from "@effect-admin/contracts"
import type * as Effect from "effect/Effect"

export interface AdminListResultValue<A> {
  readonly rows: ReadonlyArray<A>
  readonly total: number
}

export interface AdminCrudRepository<
  Model,
  Create = Partial<Model>,
  Update = Partial<Model>,
  Id = string | number
> {
  readonly list: (
    params: AdminListParams
  ) => Effect.Effect<AdminListResultValue<Model>, any, never>
  readonly get: (id: Id) => Effect.Effect<Model, any, never>
  readonly create: (payload: Create) => Effect.Effect<Model, any, never>
  readonly update: (id: Id, payload: Update) => Effect.Effect<Model, any, never>
  readonly delete: (id: Id) => Effect.Effect<void, any, never>
}

export interface AdminCrudHandlerMap<
  Model,
  Create = Partial<Model>,
  Update = Partial<Model>,
  Id = string | number
> {
  readonly list: (request: any) => Effect.Effect<AdminListResultValue<Model>, any, never>
  readonly get: (request: any) => Effect.Effect<Model, any, never>
  readonly create: (request: any) => Effect.Effect<Model, any, never>
  readonly update: (request: any) => Effect.Effect<Model, any, never>
  readonly delete: (request: any) => Effect.Effect<void, any, never>
}

/**
 * Convert host-owned persistence functions into conventional admin CRUD
 * handlers. This is deliberately repository-shaped, not database-shaped:
 * effect-admin wires the HttpApi convention, while the host keeps persistence,
 * authorization, transactions, tenancy, and business rules.
 */
export const makeCrudHandlers = <
  Model,
  Create = Partial<Model>,
  Update = Partial<Model>,
  Id = string | number
>(
  repository: AdminCrudRepository<Model, Create, Update, Id>
): AdminCrudHandlerMap<Model, Create, Update, Id> => ({
  list: ({ urlParams }) => repository.list(urlParams),
  get: ({ path }) => repository.get(path.id),
  create: ({ payload }) => repository.create(payload),
  update: ({ path, payload }) => repository.update(path.id, payload),
  delete: ({ path }) => repository.delete(path.id)
})

export const bindCrudHandlers = <
  Handlers,
  Model,
  Create = Partial<Model>,
  Update = Partial<Model>,
  Id = string | number
>(
  handlers: Handlers,
  repository: AdminCrudRepository<Model, Create, Update, Id>
): any => {
  const crud = makeCrudHandlers(repository)
  const builder = handlers as {
    handle: (name: string, handler: unknown) => any
  }
  return builder
    .handle("list", crud.list)
    .handle("get", crud.get)
    .handle("create", crud.create)
    .handle("update", crud.update)
    .handle("delete", crud.delete) as Handlers
}
