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
  Id = string | number,
  Error = never
> {
  readonly list: (
    params: AdminListParams
  ) => Effect.Effect<AdminListResultValue<Model>, Error, never>
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
  readonly list: (
    request: unknown
  ) => Effect.Effect<AdminListResultValue<Model>, Error, never>
  readonly get: (
    request: unknown
  ) => Effect.Effect<Model, Error, never>
  readonly create: (
    request: unknown
  ) => Effect.Effect<Model, Error, never>
  readonly update: (
    request: unknown
  ) => Effect.Effect<Model, Error, never>
  readonly delete: (
    request: unknown
  ) => Effect.Effect<void, Error, never>
}

type EffectError<Value> =
  Value extends Effect.Effect<unknown, infer Error, never> ? Error : never

type EffectSuccess<Value> =
  Value extends Effect.Effect<infer Success, unknown, never> ? Success : never

type FirstArgument<Value> =
  Value extends (arg: infer Argument, ...args: ReadonlyArray<unknown>) => unknown
    ? Argument
    : never

type SecondArgument<Value> =
  Value extends (first: unknown, second: infer Argument, ...args: ReadonlyArray<unknown>) => unknown
    ? Argument
    : never

type AnyCrudRepository = {
  readonly list: (params: AdminListParams) => Effect.Effect<AdminListResultValue<any>, any, never>
  readonly get: (id: any) => Effect.Effect<any, any, never>
  readonly create: (payload: any) => Effect.Effect<any, any, never>
  readonly update: (id: any, payload: any) => Effect.Effect<any, any, never>
  readonly delete: (id: any) => Effect.Effect<void, any, never>
}

type RepositoryError<Repository> =
  Repository extends {
    readonly list: (...args: ReadonlyArray<any>) => infer List
    readonly get: (...args: ReadonlyArray<any>) => infer Get
    readonly create: (...args: ReadonlyArray<any>) => infer Create
    readonly update: (...args: ReadonlyArray<any>) => infer Update
    readonly delete: (...args: ReadonlyArray<any>) => infer Delete
  }
    ? EffectError<List> | EffectError<Get> | EffectError<Create> | EffectError<Update> | EffectError<Delete>
    : never

type RepositoryModel<Repository extends AnyCrudRepository> =
  EffectSuccess<ReturnType<Repository["get"]>>

type RepositoryCreate<Repository extends AnyCrudRepository> =
  FirstArgument<Repository["create"]>

type RepositoryUpdate<Repository extends AnyCrudRepository> =
  SecondArgument<Repository["update"]>

type RepositoryId<Repository extends AnyCrudRepository> =
  FirstArgument<Repository["get"]>

/**
 * Convert host-owned persistence functions into conventional admin CRUD
 * handlers. This is deliberately repository-shaped, not database-shaped:
 * effect-admin wires the HttpApi convention, while the host keeps persistence,
 * authorization, transactions, tenancy, and business rules.
 */
export const makeCrudHandlers = <
  Repository extends AnyCrudRepository
>(
  repository: Repository
): AdminCrudHandlerMap<
  RepositoryModel<Repository>,
  RepositoryCreate<Repository>,
  RepositoryUpdate<Repository>,
  RepositoryId<Repository>,
  RepositoryError<Repository>
> => ({
  list: (request) => {
    const { urlParams } = request as AdminListRequest
    return repository.list(urlParams)
  },
  get: (request) => {
    const { path } = request as AdminGetRequest<RepositoryId<Repository>>
    return repository.get(path.id)
  },
  create: (request) => {
    const { payload } = request as AdminCreateRequest<RepositoryCreate<Repository>>
    return repository.create(payload)
  },
  update: (request) => {
    const { path, payload } = request as AdminUpdateRequest<RepositoryUpdate<Repository>, RepositoryId<Repository>>
    return repository.update(path.id, payload)
  },
  delete: (request) => {
    const { path } = request as AdminDeleteRequest<RepositoryId<Repository>>
    return repository.delete(path.id)
  }
})
