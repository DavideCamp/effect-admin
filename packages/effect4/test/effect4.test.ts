import { AdminField } from "@effect-admin/annotations"
import { Effect, Schema } from "effect"
import { describe, expect, it, vi } from "vitest"
import {
  defineCrudResource,
  deriveAdminCreateSchema,
  deriveAdminUpdateSchema,
  introspect,
  makeAdminApi,
  makeEffect4AdminClient
} from "../src/index.js"

const UserFields = Schema.Struct({
  id: Schema.Number.annotate({ [AdminField]: { auto: true } }),
  fullName: Schema.String.annotate({ title: "Full name" }),
  email: Schema.String,
  password: Schema.String.annotate({ [AdminField]: { sensitive: true } }),
  createdAt: Schema.Date.annotate({ [AdminField]: { auto: true } })
})

const User = UserFields.pipe(
  Schema.encodeKeys({ fullName: "full_name", createdAt: "created_at" })
)

describe("Effect 4 resource adapter", () => {
  it("introspects Effect 4 AST metadata and decoded field names", () => {
    expect(introspect(User.ast)).toMatchObject([
      { name: "id", kind: "number", auto: true },
      { name: "fullName", title: "Full name", kind: "text" },
      { name: "email", kind: "text" },
      { name: "password", kind: "text", sensitive: true },
      { name: "createdAt", kind: "date", auto: true }
    ])
  })

  it("preserves sensitive and encoded fields in derived create/update schemas", async () => {
    const create = deriveAdminCreateSchema(User)
    const update = deriveAdminUpdateSchema(create)

    await expect(Schema.decodeUnknownPromise(create)({
      full_name: "Ada Lovelace",
      email: "ada@example.com",
      password: "first-password"
    })).resolves.toEqual({
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      password: "first-password"
    })
    await expect(Schema.decodeUnknownPromise(update)({ password: "second-password" }))
      .resolves.toEqual({ password: "second-password" })
  })

  it("builds conventional Effect 4 HttpApi groups", () => {
    const users = defineCrudResource({ name: "users", model: User })
    const api = makeAdminApi("app", [users], { prefix: "/api" })

    expect(Object.keys(users.apiGroup.endpoints)).toEqual([
      "list",
      "get",
      "create",
      "update",
      "delete"
    ])
    expect(Object.keys(api.groups)).toEqual(["users"])
    expect(users.operations).toEqual({
      list: "list",
      get: "get",
      create: "create",
      update: "update",
      delete: "delete"
    })
  })

  it("translates renderer request keys for the Effect 4 client", async () => {
    const TinyUser = Schema.Struct({ id: Schema.Number, email: Schema.String })
    const users = defineCrudResource({ name: "users", model: TinyUser })
    const api = makeAdminApi("app", [users], { prefix: "/api" })
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ rows: [], total: 0 }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    )

    try {
      const client = await makeEffect4AdminClient(api, { baseUrl: "https://example.test" })
      const list = client.users?.list as ((request: unknown) => Effect.Effect<unknown, unknown>) | undefined
      expect(list).toBeTypeOf("function")
      await Effect.runPromise(list!({
        urlParams: { page: 2, pageSize: 10, search: "ada" }
      }))

      const request = fetch.mock.calls[0]?.[0]
      expect(String(request)).toContain("/api/users")
      expect(String(request)).toContain("page=2")
      expect(String(request)).toContain("pageSize=10")
      expect(String(request)).toContain("search=ada")
    } finally {
      fetch.mockRestore()
    }
  })
})
