import { AdminField } from "@effect-admin/annotations"
import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { introspect } from "../src/introspect.js"
import { defineAdminResource } from "../src/resource.js"

describe("introspect", () => {
  it("derives decoded frontend field names and widget metadata", () => {
    const User = Schema.Struct({
      id: Schema.Int.annotations({ title: "ID", [AdminField]: { auto: true } }),
      fullName: Schema.propertySignature(
        Schema.String.annotations({ title: "Full name" })
      ).pipe(Schema.fromKey("full_name")),
      active: Schema.Boolean,
      role: Schema.Literal("admin", "user"),
      createdAt: Schema.propertySignature(Schema.Date).pipe(Schema.fromKey("created_at"))
    })

    expect(introspect(User.ast)).toMatchObject([
      { name: "id", title: "ID", kind: "number", auto: true },
      { name: "fullName", title: "Full name", kind: "text" },
      { name: "active", kind: "checkbox" },
      { name: "role", kind: "select", options: ["admin", "user"] },
      { name: "createdAt", kind: "date" }
    ])
  })

  it("preserves minimal relation and visibility annotations", () => {
    const Post = Schema.Struct({
      id: Schema.Int,
      authorId: Schema.Int.annotations({
        [AdminField]: { ref: "users", displayField: "email", readOnly: true }
      }),
      secret: Schema.String.annotations({ [AdminField]: { hidden: true, sensitive: true } })
    })

    expect(introspect(Post.ast)).toMatchObject([
      { name: "id" },
      {
        name: "authorId",
        relation: { resource: "users", displayField: "email" },
        readOnly: true
      },
      { name: "secret", hidden: true, sensitive: true }
    ])
  })

  it("recognizes an array relation as a multi-value lookup", () => {
    const Post = Schema.Struct({
      id: Schema.Int,
      tagIds: Schema.Array(Schema.Int).annotations({
        title: "Tags",
        [AdminField]: { ref: "tags", displayField: "name" }
      })
    })

    expect(introspect(Post.ast)[1]).toMatchObject({
      name: "tagIds",
      kind: "number",
      relation: { resource: "tags", displayField: "name", multiple: true }
    })
  })

  it("unwraps optional, nullable, refined, branded and date schemas", () => {
    const Model = Schema.Struct({
      optional: Schema.optional(Schema.String),
      nullable: Schema.NullOr(Schema.String),
      refined: Schema.Number.pipe(Schema.between(0, 10)),
      branded: Schema.Int.pipe(Schema.brand("Count")),
      when: Schema.NullOr(Schema.Date),
      metadata: Schema.Unknown
    })
    const fields = introspect(Model.ast)
    expect(fields.map(({ name, kind, optional, nullable }) => ({ name, kind, optional, nullable }))).toEqual([
      { name: "optional", kind: "text", optional: true, nullable: false },
      { name: "nullable", kind: "text", optional: false, nullable: true },
      { name: "refined", kind: "number", optional: false, nullable: false },
      { name: "branded", kind: "number", optional: false, nullable: false },
      { name: "when", kind: "date", optional: false, nullable: true },
      { name: "metadata", kind: "unsupported", optional: false, nullable: false }
    ])
  })

  it("rejects non-Struct schemas explicitly", () => {
    expect(() => introspect(Schema.String.ast)).toThrow(/Schema\.Struct/)
  })
})

describe("defineAdminResource", () => {
  const Model = Schema.Struct({ id: Schema.Int, name: Schema.String })
  const Api = HttpApiGroup.make("people")
    .add(HttpApiEndpoint.get("list", "/people"))
    .add(HttpApiEndpoint.get("get", "/people/:id"))
    .add(HttpApiEndpoint.post("store", "/people"))

  it("discovers conventional operations and accepts explicit mappings", () => {
    const resource = defineAdminResource({
      model: Model,
      apiGroup: Api,
      operations: { create: "store" }
    })
    expect(resource.name).toBe("people")
    expect(resource.operations).toEqual({ list: "list", get: "get", create: "store" })
  })

  it("fails early for invalid fields and action endpoints", () => {
    expect(() => defineAdminResource({
      model: Model,
      apiGroup: Api,
      list: { columns: ["missing"] }
    })).toThrow(/no list field/)
    expect(() => defineAdminResource({
      model: Model,
      apiGroup: Api,
      actions: { suspend: { endpoint: "missing" } }
    })).toThrow(/missing endpoint/)
  })

  it("derives custom-action form fields from the endpoint payload", () => {
    const ActionApi = HttpApiGroup.make("people")
      .add(HttpApiEndpoint.get("list", "/people"))
      .add(
        HttpApiEndpoint.post("suspend", "/people/:id/suspend").setPayload(
          Schema.Struct({ reason: Schema.String.annotations({ title: "Reason" }) })
        )
      )
    const resource = defineAdminResource({
      model: Model,
      apiGroup: ActionApi,
      actions: { suspend: { endpoint: "suspend", label: "Suspend" } }
    })

    expect(resource.actions.suspend?.fields).toMatchObject([
      { name: "reason", title: "Reason", kind: "text" }
    ])
  })
})
