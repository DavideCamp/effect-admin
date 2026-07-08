import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { AdminListParams, AdminValidationError } from "../src/index.js"

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
})
