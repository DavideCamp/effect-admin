import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { User } from "./fixtures.js"
import { AdminField } from "@effect-admin/annotations"
import { introspect } from "../src/introspect.js"

describe("introspect", () => {
  it("derives the full FieldMeta list for User", () => {
    expect(introspect(User.ast)).toEqual([
      { name: "id", title: "ID", kind: "number", optional: false, auto: true, nullable: false },
      { name: "email", title: "Email", kind: "text", optional: false, auto: false, nullable: false },
      { name: "active", title: "Attivo", kind: "checkbox", optional: false, auto: false, nullable: false },
      {
        name: "role",
        title: "Ruolo",
        kind: "select",
        optional: false,
        auto: false,
        nullable: false,
        options: ["admin", "user"]
      },
      { name: "createdAt", title: "Creato il", kind: "date", optional: false, auto: true, nullable: false }
    ])
  })

  it("maps a mixed string/number literal union to select with the right options", () => {
    const S = Schema.Struct({
      size: Schema.Union(
        Schema.Literal("S"),
        Schema.Literal("M"),
        Schema.Literal(42)
      )
    })
    expect(introspect(S.ast)).toEqual([
      {
        name: "size",
        title: "size",
        kind: "select",
        optional: false,
        auto: false,
        nullable: false,
        options: ["S", "M", 42]
      }
    ])
  })

  it("marks Schema.optional fields as optional, keeping the inner kind", () => {
    const S = Schema.Struct({ nick: Schema.optional(Schema.String) })
    expect(introspect(S.ast)).toEqual([
      { name: "nick", title: "nick", kind: "text", optional: true, auto: false, nullable: false }
    ])
  })

  it("maps unknown transformations to unsupported without crashing", () => {
    const S = Schema.Struct({ weird: Schema.NumberFromString })
    expect(introspect(S.ast)).toEqual([
      { name: "weird", title: "weird", kind: "unsupported", optional: false, auto: false, nullable: false }
    ])
  })

  it("falls back to the field name when there is no user title", () => {
    const S = Schema.Struct({ email: Schema.String })
    expect(introspect(S.ast)[0]!.title).toBe("email")
  })

  it("sees through refinements, ignoring the constraint", () => {
    const S = Schema.Struct({ age: Schema.Number.pipe(Schema.between(0, 130)) })
    expect(introspect(S.ast)[0]!.kind).toBe("number")
  })

  it("rejects non-Struct schemas with an explicit error", () => {
    expect(() => introspect(Schema.String.ast)).toThrow(/Schema\.Struct/)
  })

  // --- F1 hardening: fromKey (mina #1) --------------------------------------

  it("fromKey: field identity is the ENCODED key (= column name), annotations survive", () => {
    const S = Schema.Struct({
      fullName: Schema.propertySignature(
        Schema.String.annotations({ title: "Nome completo" })
      ).pipe(Schema.fromKey("full_name")),
      plain: Schema.Number
    })
    expect(introspect(S.ast)).toEqual([
      {
        name: "full_name",
        title: "Nome completo",
        kind: "text",
        optional: false,
        auto: false,
        nullable: false
      },
      { name: "plain", title: "plain", kind: "number", optional: false, auto: false, nullable: false }
    ])
  })

  it("fromKey: per-field transformations (Schema.Date) keep their kind and AdminField", () => {
    const S = Schema.Struct({
      createdAt: Schema.propertySignature(
        Schema.Date.annotations({ title: "Creato il", [AdminField]: { auto: true } })
      ).pipe(Schema.fromKey("created_at"))
    })
    const [f] = introspect(S.ast)
    expect(f).toMatchObject({ name: "created_at", kind: "date", auto: true })
  })

  // --- F1 hardening: NullOr (mina #2) ----------------------------------------

  it("NullOr(String) is a nullable text, not unsupported", () => {
    const S = Schema.Struct({ note: Schema.NullOr(Schema.String) })
    expect(introspect(S.ast)[0]).toMatchObject({ kind: "text", nullable: true })
  })

  it("NullOr(Date) is a nullable date", () => {
    const S = Schema.Struct({ when: Schema.NullOr(Schema.Date) })
    expect(introspect(S.ast)[0]).toMatchObject({ kind: "date", nullable: true })
  })

  it("NullOr over literals stays a select, null never appears among the options", () => {
    const S = Schema.Struct({ level: Schema.NullOr(Schema.Literal("low", "high")) })
    expect(introspect(S.ast)[0]).toMatchObject({
      kind: "select",
      nullable: true,
      options: ["low", "high"]
    })
  })

  it("NullOr(Unknown) degrades to unsupported but keeps nullable (jsonb columns)", () => {
    const S = Schema.Struct({ metadata: Schema.NullOr(Schema.Unknown) })
    expect(introspect(S.ast)[0]).toMatchObject({ kind: "unsupported", nullable: true })
  })

  it("branded types unwrap to their base kind", () => {
    const Cents = Schema.Int.pipe(Schema.brand("Cents"))
    const S = Schema.Struct({ total: Cents })
    expect(introspect(S.ast)[0]!.kind).toBe("number")
  })
})
