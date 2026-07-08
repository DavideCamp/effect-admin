import { defineAdminResource } from "@effect-admin/core"
import { PostsApi, TagsApi, UsersApi } from "./contracts.js"
import { Post } from "./domain/post.js"
import { Tag } from "./domain/tag.js"
import { User } from "./domain/user.js"

export const users = defineAdminResource({
  model: User,
  apiGroup: UsersApi,
  label: "Users",
  list: { columns: ["id", "email", "fullName", "active", "role", "createdAt"] },
  actions: {
    suspend: { endpoint: "suspend", label: "Suspend", confirm: "Suspend this user?" }
  }
})

export const tags = defineAdminResource({ model: Tag, apiGroup: TagsApi })

export const posts = defineAdminResource({
  model: Post,
  apiGroup: PostsApi,
  list: { columns: ["id", "title", "authorId", "status", "publishedAt"] },
  fields: { body: { widget: "textarea" } },
  actions: {
    publish: { endpoint: "publish", label: "Publish", confirm: "Publish this post now?" }
  }
})

export const resources = [users, posts, tags]
