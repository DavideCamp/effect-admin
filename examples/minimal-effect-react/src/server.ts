import { AdminForbidden, AdminNotFound } from "@effect-admin/contracts"
import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { createServer } from "node:http"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { AppApi } from "./admin.js"

type User = {
  readonly id: number
  readonly email: string
  readonly fullName: string
  readonly active: boolean
}

type AdminRequest = {
  readonly request: {
    readonly headers: unknown
  }
}

const users = new Map<number, User>([
  [1, { id: 1, email: "ada@example.com", fullName: "Ada Lovelace", active: true }]
])

const authorize = <A, E>(
  request: AdminRequest,
  operation: "read" | "write",
  effect: Effect.Effect<A, E, never>
): Effect.Effect<A, E | AdminForbidden, never> => {
  const headers = typeof request.request.headers === "object" && request.request.headers !== null
    ? request.request.headers as Record<string, unknown>
    : {}
  const hasToken = typeof headers.authorization === "string" && headers.authorization.startsWith("Bearer ")
  if (!hasToken && operation === "write") {
    return Effect.fail(new AdminForbidden({ message: "Admin write access required." }))
  }
  return effect
}

const UsersLive = HttpApiBuilder.group(AppApi, "users", (handlers) =>
  handlers
    .handle("list", (request) =>
      authorize(request, "read", Effect.succeed({ rows: Array.from(users.values()), total: users.size }))
    )
    .handle("get", (request) => {
      const id = (request.path as { readonly id: number }).id
      const user = users.get(id)
      return user
        ? Effect.succeed(user)
        : Effect.fail(new AdminNotFound({ message: "User not found." }))
    })
    .handle("create", (request) =>
      authorize(
        request,
        "write",
        Effect.sync(() => {
          const payload = request.payload as Omit<User, "id">
          const id = users.size + 1
          const user = { id, ...payload }
          users.set(id, user)
          return user
        })
      )
    )
    .handle("update", (request) =>
      authorize(
        request,
        "write",
        Effect.flatMap(Effect.void, () => {
          const id = (request.path as { readonly id: number }).id
          const previous = users.get(id)
          if (!previous) {
            return Effect.fail(new AdminNotFound({ message: "User not found." }))
          }
          const user = { ...previous, ...(request.payload as Partial<User>) }
          users.set(id, user)
          return Effect.succeed(user)
        })
      )
    )
    .handle("delete", (request) =>
      authorize(
        request,
        "write",
        Effect.sync(() => {
          users.delete((request.path as { readonly id: number }).id)
        })
      )
    )
)

const AdminLive = HttpApiBuilder.group(AppApi, "admin", (handlers) =>
  handlers.handle("capabilities", () =>
    Effect.succeed({
      users: {
        list: true,
        get: true,
        create: true,
        update: true,
        delete: false
      }
    })
  )
)

const ApiLive = HttpApiBuilder.api(AppApi).pipe(
  Layer.provide(Layer.mergeAll(UsersLive, AdminLive))
)

const port = Number(process.env.PORT ?? 3001)
const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(NodeHttpServer.layer(createServer, { port }))
)

console.log(`[minimal-effect-admin-react] HttpApi listening on http://localhost:${port}`)
NodeRuntime.runMain(Layer.launch(ServerLive) as Effect.Effect<never, never, never>)
