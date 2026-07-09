import type { AdminListParams } from "@effect-admin/contracts"
import type * as Effect from "effect/Effect"

export interface AdminListResultValue<A> {
  readonly rows: ReadonlyArray<A>
  readonly total: number
}

export interface AdminListRequest {
  readonly urlParams: AdminListParams
}

export interface AdminGetRequest<Id = string | number> {
  readonly path: {
    readonly id: Id
  }
}

export interface AdminCreateRequest<Create> {
  readonly payload: Create
}

export interface AdminUpdateRequest<Update, Id = string | number> {
  readonly path: {
    readonly id: Id
  }
  readonly payload: Update
}

export interface AdminDeleteRequest<Id = string | number> {
  readonly path: {
    readonly id: Id
  }
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
  readonly list: (
    request: unknown
  ) => Effect.Effect<AdminListResultValue<Model>, any, never>
  readonly get: (
    request: unknown
  ) => Effect.Effect<Model, any, never>
  readonly create: (
    request: unknown
  ) => Effect.Effect<Model, any, never>
  readonly update: (
    request: unknown
  ) => Effect.Effect<Model, any, never>
  readonly delete: (
    request: unknown
  ) => Effect.Effect<void, any, never>
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
  list: (request) => {
    const { urlParams } = request as AdminListRequest
    return repository.list(urlParams)
  },
  get: (request) => {
    const { path } = request as AdminGetRequest<Id>
    return repository.get(path.id)
  },
  create: (request) => {
    const { payload } = request as AdminCreateRequest<Create>
    return repository.create(payload)
  },
  update: (request) => {
    const { path, payload } = request as AdminUpdateRequest<Update, Id>
    return repository.update(path.id, payload)
  },
  delete: (request) => {
    const { path } = request as AdminDeleteRequest<Id>
    return repository.delete(path.id)
  }
})
