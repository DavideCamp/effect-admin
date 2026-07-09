// @vitest-environment jsdom
import { AdminField, defineAdminResource } from "@effect-admin/core"
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Effect, Schema } from "effect"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { userEvent } from "@testing-library/user-event"
import { afterEach, describe, expect, it } from "vitest"
import { EffectAdmin } from "../src/index.js"

afterEach(cleanup)

describe("relations", () => {
  it("submits multiple related ids selected from another resource", async () => {
    window.history.replaceState(null, "", "/admin/posts/new")
    const Tag = Schema.Struct({ id: Schema.Int, name: Schema.String })
    const Post = Schema.Struct({
      id: Schema.Int.annotations({ [AdminField]: { auto: true } }),
      title: Schema.String,
      tagIds: Schema.Array(Schema.Int).annotations({
        title: "Tags",
        [AdminField]: { ref: "tags", displayField: "name" }
      })
    })
    const TagsApi = HttpApiGroup.make("tags").add(HttpApiEndpoint.get("list", "/tags"))
    const PostsApi = HttpApiGroup.make("posts").add(HttpApiEndpoint.post("create", "/posts"))
    const tags = defineAdminResource({ model: Tag, apiGroup: TagsApi })
    const posts = defineAdminResource({ model: Post, apiGroup: PostsApi })
    let received: unknown
    const client = {
      tags: { list: () => Effect.succeed({ rows: [{ id: 1, name: "Effect" }, { id: 2, name: "React" }], total: 2 }) },
      posts: { create: (request?: unknown) => { received = request; return Effect.succeed({ id: 1, title: "Hello", tagIds: [1, 2] }) } }
    }

    render(<EffectAdmin resources={[posts, tags]} client={client} />)
    const user = userEvent.setup()
    await user.type(screen.getByRole("textbox", { name: "title" }), "Hello")
    await user.selectOptions(await screen.findByRole("listbox", { name: "Tags" }), ["1", "2"])
    await user.click(screen.getByRole("button", { name: "Save" }))

    expect(received).toEqual({ payload: { title: "Hello", tagIds: [1, 2] } })
  })

  it("searches relation options through the related list endpoint", async () => {
    window.history.replaceState(null, "", "/admin/posts/new")
    const User = Schema.Struct({ id: Schema.Int, email: Schema.String })
    const Post = Schema.Struct({
      id: Schema.Int.annotations({ [AdminField]: { auto: true } }),
      title: Schema.String,
      authorId: Schema.Int.annotations({
        title: "Author",
        [AdminField]: { ref: "users", displayField: "email" }
      })
    })
    const UsersApi = HttpApiGroup.make("users").add(HttpApiEndpoint.get("list", "/users"))
    const PostsApi = HttpApiGroup.make("posts").add(HttpApiEndpoint.post("create", "/posts"))
    const users = defineAdminResource({ model: User, apiGroup: UsersApi })
    const posts = defineAdminResource({ model: Post, apiGroup: PostsApi })
    const requests: Array<unknown> = []

    render(
      <EffectAdmin
        resources={[posts, users]}
        client={{
          users: {
            list: (request?: unknown) => {
              requests.push(request)
              return Effect.succeed({
                rows: [{ id: 2, email: "grace@example.com" }],
                total: 1
              })
            }
          },
          posts: {
            create: () => Effect.succeed({ id: 1, title: "Hello", authorId: 2 })
          }
        }}
      />
    )

    const user = userEvent.setup()
    await user.type(await screen.findByRole("textbox", { name: "Search Author" }), "grace")

    await waitFor(() => {
      expect(requests.at(-1)).toEqual({
        urlParams: { page: 1, pageSize: 25, search: "grace" }
      })
    })
  })
})
