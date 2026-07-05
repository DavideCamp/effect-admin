import { Either, Schema } from "effect"
import { describe, expect, it } from "vitest"
import { User } from "./fixtures.js"
import { defineResource } from "../src/resource.js"

const users = defineResource({ name: "users", schema: User, primaryKey: "id" })

describe("deriveSchemas", () => {
  it("create rejects payloads carrying the pk or auto fields", () => {
    const decode = Schema.decodeUnknownEither(users.schemas.create, {
      onExcessProperty: "error"
    })
    const withId = decode({ id: 1, email: "a@b.it", active: true, role: "user" })
    expect(Either.isLeft(withId)).toBe(true)
    const withAuto = decode({
      email: "a@b.it",
      active: true,
      role: "user",
      createdAt: "2026-01-01T00:00:00.000Z"
    })
    expect(Either.isLeft(withAuto)).toBe(true)
  })

  it("create accepts the editable fields", () => {
    const decode = Schema.decodeUnknownEither(users.schemas.create, {
      onExcessProperty: "error"
    })
    const ok = decode({ email: "a@b.it", active: true, role: "user" })
    expect(Either.isRight(ok)).toBe(true)
  })

  it("update accepts partial payloads, including {}", () => {
    const decode = Schema.decodeUnknownEither(users.schemas.update)
    expect(Either.isRight(decode({}))).toBe(true)
    expect(Either.isRight(decode({ email: "x@y.z" }))).toBe(true)
    expect(Either.isLeft(decode({ email: 123 }))).toBe(true)
  })

  it("full decodes a complete row (Date from ISO string)", () => {
    const row = Schema.decodeUnknownSync(users.schemas.full)({
      id: 1,
      email: "a@b.it",
      active: true,
      role: "admin",
      createdAt: "2026-01-01T00:00:00.000Z"
    }) as { createdAt: Date }
    expect(row.createdAt).toBeInstanceOf(Date)
  })

  it("full encodes Date back to ISO string", () => {
    const json = Schema.encodeSync(users.schemas.full)({
      id: 1,
      email: "a@b.it",
      active: true,
      role: "admin",
      createdAt: new Date("2026-01-01T00:00:00.000Z")
    }) as { createdAt: string }
    expect(json.createdAt).toBe("2026-01-01T00:00:00.000Z")
  })
})

describe("defineResource validation", () => {
  it("crashes at startup on a primaryKey that is not a field", () => {
    expect(() =>
      defineResource({ name: "users", schema: User, primaryKey: "uuid" })
    ).toThrow(/primaryKey "uuid"/)
  })

  it("crashes at startup on unknown list columns", () => {
    expect(() =>
      defineResource({
        name: "users",
        schema: User,
        primaryKey: "id",
        list: { columns: ["nope"] }
      })
    ).toThrow(/list column "nope"/)
  })
})
