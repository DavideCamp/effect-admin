import {
  AdminForbidden,
  AdminNotFound,
  AdminValidationError,
  type AdminCapabilities,
  type AdminListParams
} from "@effect-admin/contracts"
import { makeCrudHandlers } from "@effect-admin/core"
import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { createServer } from "node:http"
import { AppApi } from "./admin.js"
import type { Post } from "./domain/post.js"
import type { Tag } from "./domain/tag.js"
import type { User } from "./domain/user.js"

type AdminRole = "admin" | "staff" | "viewer"
type AdminError = AdminForbidden | AdminNotFound | AdminValidationError
type AdminRequest = {
  readonly request: {
    readonly headers: unknown
  }
}

const missing = (resource: string, id: number) =>
  new AdminNotFound({ message: `${resource} ${id} was not found.` })

const forbidden = (operation: string) =>
  new AdminForbidden({ message: `The current admin role cannot ${operation}.` })

const roleOf = (request: AdminRequest): AdminRole => {
  if (typeof request.request.headers !== "object" || request.request.headers === null) return "staff"
  const role = (request.request.headers as Record<string, unknown>)["x-admin-role"]
  return role === "admin" || role === "staff" || role === "viewer" ? role : "staff"
}

const authorize = <A, E>(
  request: AdminRequest,
  allowed: ReadonlyArray<AdminRole>,
  operation: string,
  effect: Effect.Effect<A, E, never>
) =>
  allowed.some((role) => role === roleOf(request))
    ? effect
    : Effect.fail(forbidden(operation))

const adminEffect = <A>(
  effect: Effect.Effect<A, unknown, never>
): Effect.Effect<A, AdminError, never> =>
  effect as Effect.Effect<A, AdminError, never>

const listRows = <A extends object>(
  source: ReadonlyArray<A>,
  params: AdminListParams,
  searchable: ReadonlyArray<keyof A>
) => {
  let rows = [...source]
  if (params.search) {
    const needle = params.search.toLowerCase()
    rows = rows.filter((row) => searchable.some((key) =>
      String(row[key]).toLowerCase().includes(needle)
    ))
  }
  for (const filter of params.filters ?? []) {
    rows = rows.filter((row) => {
      const value = (row as Record<string, unknown>)[filter.field]
      if (filter.operator === "contains") {
        return String(value).toLowerCase().includes(String(filter.value).toLowerCase())
      }
      if (filter.operator === "gte") return Number(value) >= Number(filter.value)
      if (filter.operator === "lte") return Number(value) <= Number(filter.value)
      return String(value) === String(filter.value)
    })
  }
  if (params.orderBy) {
    const key = params.orderBy
    rows.sort((left, right) => String(
      (left as Record<string, unknown>)[key]
    ).localeCompare(String((right as Record<string, unknown>)[key])))
    if (params.orderDir === "desc") rows.reverse()
  }
  const start = (params.page - 1) * params.pageSize
  return { rows: rows.slice(start, start + params.pageSize), total: rows.length }
}

let nextUserId = 4
let users: Array<User> = [
  { id: 1, email: "ada@example.com", fullName: "Ada Lovelace", active: true, role: "admin", createdAt: new Date("2026-01-04T09:00:00Z") },
  { id: 2, email: "grace@example.com", fullName: "Grace Hopper", active: true, role: "staff", createdAt: new Date("2026-02-12T10:30:00Z") },
  { id: 3, email: "alan@example.com", fullName: "Alan Turing", active: false, role: "user", createdAt: new Date("2026-03-18T14:15:00Z") }
]

let nextTagId = 4
let tags: Array<Tag> = [
  { id: 1, name: "Effect" },
  { id: 2, name: "React" },
  { id: 3, name: "TypeScript" }
]

let nextPostId = 3
let posts: Array<Post> = [
  {
    id: 1,
    authorId: 1,
    title: "Typed admin interfaces",
    slug: "typed-admin-interfaces",
    body: "A small interface over a deep implementation.",
    status: "published",
    tagIds: [1, 2],
    publishedAt: new Date("2026-06-10T08:00:00Z"),
    createdAt: new Date("2026-06-09T10:00:00Z")
  },
  {
    id: 2,
    authorId: 2,
    title: "HttpApi as a contract",
    slug: "httpapi-as-a-contract",
    body: "The host keeps its business logic.",
    status: "draft",
    tagIds: [1, 3],
    publishedAt: null,
    createdAt: new Date("2026-07-01T12:00:00Z")
  }
]

const UsersRepository = {
  list: (params: AdminListParams) =>
    Effect.sync(() => listRows(users, params, ["email", "fullName"])),
  get: (id: number) => {
    const user = users.find((item) => item.id === id)
    return user ? Effect.succeed(user) : Effect.fail(missing("User", id))
  },
  create: (payload: Omit<User, "id" | "createdAt">) => {
    if (users.some((user) => user.email === payload.email)) {
      return Effect.fail(new AdminValidationError({
        message: "Please correct the highlighted field.",
        fields: { email: ["This email is already registered."] }
      }))
    }
    const user: User = { ...payload, id: nextUserId++, createdAt: new Date() }
    users.push(user)
    return Effect.succeed(user)
  },
  update: (id: number, payload: Partial<Omit<User, "id" | "createdAt">>) => {
    const index = users.findIndex((item) => item.id === id)
    if (index < 0) return Effect.fail(missing("User", id))
    if (payload.email && users.some((user) => user.id !== id && user.email === payload.email)) {
      return Effect.fail(new AdminValidationError({
        message: "Please correct the highlighted field.",
        fields: { email: ["This email is already registered."] }
      }))
    }
    const current = users[index]!
    const user: User = {
      ...current,
      ...(payload.email !== undefined ? { email: payload.email } : {}),
      ...(payload.fullName !== undefined ? { fullName: payload.fullName } : {}),
      ...(payload.active !== undefined ? { active: payload.active } : {}),
      ...(payload.role !== undefined ? { role: payload.role } : {})
    }
    users[index] = user
    return Effect.succeed(user)
  },
  delete: (id: number) => {
    const index = users.findIndex((item) => item.id === id)
    if (index < 0) return Effect.fail(missing("User", id))
    users.splice(index, 1)
    return Effect.void
  }
}

const UsersCrud = makeCrudHandlers(UsersRepository)
const UsersLive = HttpApiBuilder.group(AppApi, "users", (handlers) => handlers
  .handle("list", (request) => adminEffect(authorize(request, ["admin", "staff", "viewer"], "list users", UsersCrud.list(request))))
  .handle("get", (request) => adminEffect(authorize(request, ["admin", "staff", "viewer"], "view users", UsersCrud.get(request))))
  .handle("create", (request) => adminEffect(authorize(request, ["admin", "staff"], "create users", UsersCrud.create(request))))
  .handle("update", (request) => adminEffect(authorize(request, ["admin", "staff"], "update users", UsersCrud.update(request))))
  .handle("delete", (request) => adminEffect(authorize(request, ["admin"], "delete users", UsersCrud.delete(request))))
  .handle("suspend", (request) => {
    const { path } = request
    const allowed = ["admin"] as const
    if (!allowed.some((role) => role === roleOf(request))) return Effect.fail(forbidden("suspend users"))
    const index = users.findIndex((item) => item.id === path.id)
    if (index < 0) return Effect.fail(missing("User", path.id))
    const user: User = { ...users[index]!, active: false }
    users[index] = user
    return Effect.succeed(user)
  })
)

const TagsRepository = {
  list: (params: AdminListParams) =>
    Effect.sync(() => listRows(tags, params, ["name"])),
  get: (id: number) => {
    const tag = tags.find((item) => item.id === id)
    return tag ? Effect.succeed(tag) : Effect.fail(missing("Tag", id))
  },
  create: (payload: Omit<Tag, "id">) => {
    if (tags.some((tag) => tag.name.toLowerCase() === payload.name.toLowerCase())) {
      return Effect.fail(new AdminValidationError({
        message: "Tag names must be unique.",
        fields: { name: ["This tag already exists."] }
      }))
    }
    const tag: Tag = { id: nextTagId++, ...payload }
    tags.push(tag)
    return Effect.succeed(tag)
  },
  update: (id: number, payload: Partial<Omit<Tag, "id">>) => {
    const index = tags.findIndex((item) => item.id === id)
    if (index < 0) return Effect.fail(missing("Tag", id))
    const tag: Tag = { ...tags[index]!, ...(payload.name !== undefined ? { name: payload.name } : {}) }
    tags[index] = tag
    return Effect.succeed(tag)
  },
  delete: (id: number) => {
    const index = tags.findIndex((item) => item.id === id)
    if (index < 0) return Effect.fail(missing("Tag", id))
    tags.splice(index, 1)
    posts = posts.map((post) => ({ ...post, tagIds: post.tagIds.filter((tagId) => tagId !== id) }))
    return Effect.void
  }
}

const TagsCrud = makeCrudHandlers(TagsRepository)
const TagsLive = HttpApiBuilder.group(AppApi, "tags", (handlers) => handlers
  .handle("list", (request) => adminEffect(authorize(request, ["admin", "staff", "viewer"], "list tags", TagsCrud.list(request))))
  .handle("get", (request) => adminEffect(authorize(request, ["admin", "staff", "viewer"], "view tags", TagsCrud.get(request))))
  .handle("create", (request) => adminEffect(authorize(request, ["admin", "staff"], "create tags", TagsCrud.create(request))))
  .handle("update", (request) => adminEffect(authorize(request, ["admin", "staff"], "update tags", TagsCrud.update(request))))
  .handle("delete", (request) => adminEffect(authorize(request, ["admin"], "delete tags", TagsCrud.delete(request))))
)

const validatePostRelations = (authorId: number, tagIds: ReadonlyArray<number>) => {
  const fields: Record<string, Array<string>> = {}
  if (!users.some((user) => user.id === authorId)) fields.authorId = ["Select an existing user."]
  if (tagIds.some((id) => !tags.some((tag) => tag.id === id))) fields.tagIds = ["One or more tags no longer exist."]
  return Object.keys(fields).length > 0
    ? new AdminValidationError({ message: "Please correct the highlighted fields.", fields })
    : undefined
}

const PostsRepository = {
  list: (params: AdminListParams) =>
    Effect.sync(() => listRows(posts, params, ["title", "slug", "body"])),
  get: (id: number) => {
    const post = posts.find((item) => item.id === id)
    return post ? Effect.succeed(post) : Effect.fail(missing("Post", id))
  },
  create: (payload: Omit<Post, "id" | "createdAt">) => {
    const invalid = validatePostRelations(payload.authorId, payload.tagIds)
    if (invalid) return Effect.fail(invalid)
    const post: Post = { ...payload, id: nextPostId++, createdAt: new Date() }
    posts.push(post)
    return Effect.succeed(post)
  },
  update: (id: number, payload: Partial<Omit<Post, "id" | "createdAt">>) => {
    const index = posts.findIndex((item) => item.id === id)
    if (index < 0) return Effect.fail(missing("Post", id))
    const current = posts[index]!
    const authorId = payload.authorId ?? current.authorId
    const tagIds = payload.tagIds ?? current.tagIds
    const invalid = validatePostRelations(authorId, tagIds)
    if (invalid) return Effect.fail(invalid)
    const post: Post = {
      ...current,
      ...(payload.authorId !== undefined ? { authorId: payload.authorId } : {}),
      ...(payload.title !== undefined ? { title: payload.title } : {}),
      ...(payload.slug !== undefined ? { slug: payload.slug } : {}),
      ...(payload.body !== undefined ? { body: payload.body } : {}),
      ...(payload.status !== undefined ? { status: payload.status } : {}),
      ...(payload.tagIds !== undefined ? { tagIds: payload.tagIds } : {}),
      ...(payload.publishedAt !== undefined ? { publishedAt: payload.publishedAt } : {})
    }
    posts[index] = post
    return Effect.succeed(post)
  },
  delete: (id: number) => {
    const index = posts.findIndex((item) => item.id === id)
    if (index < 0) return Effect.fail(missing("Post", id))
    posts.splice(index, 1)
    return Effect.void
  }
}

const PostsCrud = makeCrudHandlers(PostsRepository)
const PostsLive = HttpApiBuilder.group(AppApi, "posts", (handlers) => handlers
  .handle("list", (request) => adminEffect(authorize(request, ["admin", "staff", "viewer"], "list posts", PostsCrud.list(request))))
  .handle("get", (request) => adminEffect(authorize(request, ["admin", "staff", "viewer"], "view posts", PostsCrud.get(request))))
  .handle("create", (request) => adminEffect(authorize(request, ["admin", "staff"], "create posts", PostsCrud.create(request))))
  .handle("update", (request) => adminEffect(authorize(request, ["admin", "staff"], "update posts", PostsCrud.update(request))))
  .handle("delete", (request) => adminEffect(authorize(request, ["admin"], "delete posts", PostsCrud.delete(request))))
  .handle("publish", (request) => {
    const { path } = request
    const allowed = ["admin", "staff"] as const
    if (!allowed.some((role) => role === roleOf(request))) return Effect.fail(forbidden("publish posts"))
    const index = posts.findIndex((item) => item.id === path.id)
    if (index < 0) return Effect.fail(missing("Post", path.id))
    const post: Post = { ...posts[index]!, status: "published", publishedAt: new Date() }
    posts[index] = post
    return Effect.succeed(post)
  })
)

const capabilitiesForRole = (role: AdminRole = "staff"): AdminCapabilities => {
  if (role === "admin") return {}
  if (role === "viewer") {
    return {
      users: { create: false, update: false, delete: false, actions: { suspend: false } },
      posts: { create: false, update: false, delete: false, actions: { publish: false } },
      tags: { create: false, update: false, delete: false }
    }
  }
  return {
    users: { delete: false, actions: { suspend: false } },
    posts: { delete: false },
    tags: { delete: false }
  }
}

const AdminLive = HttpApiBuilder.group(AppApi, "admin", (handlers) => handlers
  .handle("capabilities", (request) =>
    Effect.succeed(capabilitiesForRole(roleOf(request)))
  )
)

const ApiLive = HttpApiBuilder.api(AppApi).pipe(
  Layer.provide(Layer.mergeAll(UsersLive, TagsLive, PostsLive, AdminLive))
)
const port = Number(process.env.PORT ?? 3001)
const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(NodeHttpServer.layer(createServer, { port }))
)

console.log(`[example] HttpApi listening on http://localhost:${port}`)
NodeRuntime.runMain(Layer.launch(ServerLive))
