import {
  AdminListParams,
  AdminListResult,
  AdminNotFound,
  AdminValidationError
} from "@effect-admin/contracts"
import * as HttpApi from "@effect/platform/HttpApi"
import * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint"
import * as HttpApiGroup from "@effect/platform/HttpApiGroup"
import * as HttpApiSchema from "@effect/platform/HttpApiSchema"
import * as Schema from "effect/Schema"
import { Post } from "./domain/post.js"
import { Tag } from "./domain/tag.js"
import { User } from "./domain/user.js"

const IdPath = Schema.Struct({ id: Schema.NumberFromString })

export const UserCreate = Schema.Struct({
  email: Schema.String.pipe(Schema.minLength(3)),
  fullName: Schema.String,
  active: Schema.Boolean,
  role: Schema.Literal("admin", "staff", "user")
})
export const UserUpdate = Schema.partial(UserCreate)
export const SuspendUser = Schema.Struct({
  reason: Schema.String.pipe(Schema.minLength(3)).annotations({ title: "Reason" })
})

export const UsersApi = HttpApiGroup.make("users")
  .addError(AdminNotFound, { status: 404 })
  .addError(AdminValidationError, { status: 400 })
  .add(HttpApiEndpoint.get("list", "/users").setUrlParams(AdminListParams).addSuccess(AdminListResult(User)))
  .add(HttpApiEndpoint.get("get", "/users/:id").setPath(IdPath).addSuccess(User))
  .add(HttpApiEndpoint.post("create", "/users").setPayload(UserCreate).addSuccess(User, { status: 201 }))
  .add(HttpApiEndpoint.patch("update", "/users/:id").setPath(IdPath).setPayload(UserUpdate).addSuccess(User))
  .add(HttpApiEndpoint.del("delete", "/users/:id").setPath(IdPath).addSuccess(HttpApiSchema.NoContent))
  .add(HttpApiEndpoint.post("suspend", "/users/:id/suspend").setPath(IdPath).setPayload(SuspendUser).addSuccess(User))

export const TagCreate = Schema.Struct({ name: Schema.String.pipe(Schema.minLength(1)) })
export const TagUpdate = Schema.partial(TagCreate)
export const TagsApi = HttpApiGroup.make("tags")
  .addError(AdminNotFound, { status: 404 })
  .addError(AdminValidationError, { status: 400 })
  .add(HttpApiEndpoint.get("list", "/tags").setUrlParams(AdminListParams).addSuccess(AdminListResult(Tag)))
  .add(HttpApiEndpoint.get("get", "/tags/:id").setPath(IdPath).addSuccess(Tag))
  .add(HttpApiEndpoint.post("create", "/tags").setPayload(TagCreate).addSuccess(Tag, { status: 201 }))
  .add(HttpApiEndpoint.patch("update", "/tags/:id").setPath(IdPath).setPayload(TagUpdate).addSuccess(Tag))
  .add(HttpApiEndpoint.del("delete", "/tags/:id").setPath(IdPath).addSuccess(HttpApiSchema.NoContent))

export const PostCreate = Schema.Struct({
  authorId: Schema.Int,
  title: Schema.String.pipe(Schema.minLength(1)),
  slug: Schema.String.pipe(Schema.pattern(/^[a-z0-9-]+$/)),
  body: Schema.String,
  status: Schema.Literal("draft", "published", "archived"),
  tagIds: Schema.Array(Schema.Int),
  publishedAt: Schema.NullOr(Schema.Date)
})
export const PostUpdate = Schema.partial(PostCreate)
export const PublishPost = Schema.Struct({
  note: Schema.String.annotations({ title: "Publication note" })
})
export const PostsApi = HttpApiGroup.make("posts")
  .addError(AdminNotFound, { status: 404 })
  .addError(AdminValidationError, { status: 400 })
  .add(HttpApiEndpoint.get("list", "/posts").setUrlParams(AdminListParams).addSuccess(AdminListResult(Post)))
  .add(HttpApiEndpoint.get("get", "/posts/:id").setPath(IdPath).addSuccess(Post))
  .add(HttpApiEndpoint.post("create", "/posts").setPayload(PostCreate).addSuccess(Post, { status: 201 }))
  .add(HttpApiEndpoint.patch("update", "/posts/:id").setPath(IdPath).setPayload(PostUpdate).addSuccess(Post))
  .add(HttpApiEndpoint.del("delete", "/posts/:id").setPath(IdPath).addSuccess(HttpApiSchema.NoContent))
  .add(HttpApiEndpoint.post("publish", "/posts/:id/publish").setPath(IdPath).setPayload(PublishPost).addSuccess(Post))

export const AppApi = HttpApi.make("example")
  .add(UsersApi)
  .add(TagsApi)
  .add(PostsApi)
  .prefix("/api")
