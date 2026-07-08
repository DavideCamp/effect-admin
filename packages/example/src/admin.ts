import { defineCrudResource, makeAdminApi } from "@effect-admin/core"
import * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint"
import * as Schema from "effect/Schema"
import { PublishPost, SuspendUser } from "./contracts.js"
import { Post } from "./domain/post.js"
import { Tag } from "./domain/tag.js"
import { User } from "./domain/user.js"

const IdPath = Schema.Struct({ id: Schema.NumberFromString })

export const users = defineCrudResource({
  name: "users",
  model: User,
  label: "Users",
  list: { columns: ["id", "email", "fullName", "active", "role", "createdAt"] },
  extendApiGroup: (apiGroup) => apiGroup.add(
    HttpApiEndpoint.post("suspend", "/users/:id/suspend")
      .setPath(IdPath)
      .setPayload(SuspendUser)
      .addSuccess(User)
  ),
  actions: {
    suspend: { endpoint: "suspend", label: "Suspend", confirm: "Suspend this user?" }
  }
})

export const tags = defineCrudResource({
  name: "tags",
  model: Tag
})

export const posts = defineCrudResource({
  name: "posts",
  model: Post,
  list: { columns: ["id", "title", "authorId", "status", "publishedAt"] },
  fields: { body: { widget: "textarea" } },
  extendApiGroup: (apiGroup) => apiGroup.add(
    HttpApiEndpoint.post("publish", "/posts/:id/publish")
      .setPath(IdPath)
      .setPayload(PublishPost)
      .addSuccess(Post)
  ),
  actions: {
    publish: { endpoint: "publish", label: "Publish", confirm: "Publish this post now?" }
  }
})

export const resources = [users, posts, tags] as const

export const AppApi = makeAdminApi("example", resources, { prefix: "/api" })
