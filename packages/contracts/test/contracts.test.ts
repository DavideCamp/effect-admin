import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import {
  AdminCapabilities,
  AdminListParams,
  AdminValidationError,
  makeAdminApi,
  makeCrudApiGroup
} from "../src/index.js"

describe("admin HttpApi contracts", () => {
  it("decodes query strings into the standard list request", async () => {
    const decoded = await Schema.decodeUnknownPromise(AdminListParams)({
      page: "2",
      pageSize: "50",
      filters: JSON.stringify([{ field: "role", operator: "eq", value: "staff" }])
    })
    expect(decoded).toEqual({
      page: 2,
      pageSize: 50,
      filters: [{ field: "role", operator: "eq", value: "staff" }]
    })
  })

  it("keeps field-level validation data typed", () => {
    const error = new AdminValidationError({
      message: "Invalid record",
      fields: { email: ["Already registered"] }
    })
    expect(error._tag).toBe("AdminValidationError")
    expect(error.fields?.email).toEqual(["Already registered"])
  })

  it("decodes the standard capability map", async () => {
    await expect(Schema.decodeUnknownPromise(AdminCapabilities)({
      users: {
        create: false,
        delete: false,
        actions: { suspend: true }
      }
    })).resolves.toEqual({
      users: {
        create: false,
        delete: false,
        actions: { suspend: true }
      }
    })
  })

  it("generates conventional CRUD endpoint groups from a model", () => {
    const User = Schema.Struct({ id: Schema.Int, email: Schema.String })
    const UserCreate = Schema.Struct({ email: Schema.String })
    const UsersApi = makeCrudApiGroup({
      name: "users",
      model: User,
      create: UserCreate
    })

    expect(UsersApi.identifier).toBe("users")
    expect(Object.keys(UsersApi.endpoints)).toEqual(["list", "get", "create", "update", "delete"])
  })

  it("combines generated groups into an HttpApi", () => {
    const User = Schema.Struct({ id: Schema.Int, email: Schema.String })
    const UsersApi = makeCrudApiGroup({ name: "users", model: User })
    const AppApi = makeAdminApi("app", [UsersApi], { prefix: "/api" })

    expect(Object.keys(AppApi.groups)).toEqual(["users"])
  })
})
