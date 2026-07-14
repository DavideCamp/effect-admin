import type { AdminListParams } from "./contracts.js"
import type { Effect } from "effect"

export interface AdminListResultValue<A> {
  readonly rows: ReadonlyArray<A>
  readonly total: number
}

export interface AdminListRequest {
  readonly query: AdminListParams
}

export interface AdminGetRequest<Id = string | number> {
  readonly params: { readonly id: Id }
}

export interface AdminCreateRequest<Create> {
  readonly payload: Create
}

export interface AdminUpdateRequest<Update, Id = string | number> {
  readonly params: { readonly id: Id }
  readonly payload: Update
}

export interface AdminDeleteRequest<Id = string | number> {
  readonly params: { readonly id: Id }
}

export interface AdminCrudRepository<
  Model,
  Create = Partial<Model>,
  Update = Partial<Model>,
  Id = string | number,
  Error = never
> {
  readonly list: (params: AdminListParams) => Effect.Effect<AdminListResultValue<Model>, Error, never>
  readonly get: (id: Id) => Effect.Effect<Model, Error, never>
  readonly create: (payload: Create) => Effect.Effect<Model, Error, never>
  readonly update: (id: Id, payload: Update) => Effect.Effect<Model, Error, never>
  readonly delete: (id: Id) => Effect.Effect<void, Error, never>
}

export interface AdminCrudHandlerMap<
  Model,
  Create = Partial<Model>,
  Update = Partial<Model>,
  Id = string | number,
  Error = never
> {
  readonly list: (request: unknown) => Effect.Effect<AdminListResultValue<Model>, Error, never>
  readonly get: (request: unknown) => Effect.Effect<Model, Error, never>
  readonly create: (request: unknown) => Effect.Effect<Model, Error, never>
  readonly update: (request: unknown) => Effect.Effect<Model, Error, never>
  readonly delete: (request: unknown) => Effect.Effect<void, Error, never>
}

export const makeCrudHandlers = <Model, Create, Update, Id, Error>(
  repository: AdminCrudRepository<Model, Create, Update, Id, Error>
): AdminCrudHandlerMap<Model, Create, Update, Id, Error> => ({
  list: (request) => repository.list((request as AdminListRequest).query),
  get: (request) => repository.get((request as AdminGetRequest<Id>).params.id),
  create: (request) => repository.create((request as AdminCreateRequest<Create>).payload),
  update: (request) => {
    const { params, payload } = request as AdminUpdateRequest<Update, Id>
    return repository.update(params.id, payload)
  },
  delete: (request) => repository.delete(
    (request as AdminDeleteRequest<Id>).params.id
  )
})
