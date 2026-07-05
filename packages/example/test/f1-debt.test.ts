import { defineResource, introspect } from "@effect-admin/core"
import { Schema } from "effect"
import { describe, expect, it } from "vitest"
import { Comment } from "../src/domain/comment.js"
import { Order } from "../src/domain/order.js"
import { Post } from "../src/domain/post.js"
import { Product } from "../src/domain/product.js"
import { Tag } from "../src/domain/tag.js"
import { User } from "../src/domain/user.js"

/**
 * F0 shipped these as `it.fails` — executable documentation of the debt
 * between the PoC introspector and the real domain (plan.md, mine #1/#2).
 * F1 paid the debt, so they are now regular tests: the whole target domain
 * introspects without workarounds.
 *
 * Field identity note: names are the ENCODED keys (fromKey's column names)
 * — the admin lives in the wire/DB space, see FieldMeta in core.
 */
describe("F1 — the whole domain introspects", () => {
  it("mina #1 paid: fromKey schemas introspect, names are the column names", () => {
    const fields = introspect(User.ast)
    expect(fields.map((f) => f.name)).toEqual([
      "id",
      "email",
      "full_name",
      "active",
      "role",
      "created_at"
    ])
    const fullName = fields.find((f) => f.name === "full_name")
    expect(fullName).toMatchObject({ title: "Nome completo", kind: "text" })
  })

  it("mina #2 paid: NullOr(Date) is a nullable date", () => {
    const fields = introspect(Post.ast)
    const publishedAt = fields.find((f) => f.name === "published_at")
    expect(publishedAt).toMatchObject({ kind: "date", nullable: true })
  })

  it("mina #2 paid (isolated): NullOr(String) without fromKey noise", () => {
    const Note = Schema.Struct({ note: Schema.NullOr(Schema.String) })
    const fields = introspect(Note.ast)
    expect(fields[0]).toMatchObject({ kind: "text", nullable: true })
  })

  it("every resource of the domain is definable — the F1 exit criterion", () => {
    const defs = [
      defineResource({ name: "users", schema: User, primaryKey: "id" }),
      defineResource({ name: "posts", schema: Post, primaryKey: "id" }),
      defineResource({ name: "comments", schema: Comment, primaryKey: "id" }),
      defineResource({ name: "tags", schema: Tag, primaryKey: "id" }),
      defineResource({ name: "products", schema: Product, primaryKey: "id" }),
      defineResource({ name: "orders", schema: Order, primaryKey: "id", readOnly: true })
    ]
    for (const d of defs) {
      expect(d.fields.length).toBeGreaterThan(0)
    }
  })

  it("self-FK nullable (comments.parent_id) is a nullable number", () => {
    const fields = introspect(Comment.ast)
    expect(fields.find((f) => f.name === "parent_id")).toMatchObject({
      kind: "number",
      nullable: true
    })
  })

  it("jsonb (orders.metadata) degrades to unsupported — mina #3, never an error", () => {
    const fields = introspect(Order.ast)
    expect(fields.find((f) => f.name === "metadata")).toMatchObject({
      kind: "unsupported",
      nullable: true
    })
    // and unsupported fields never enter the write variants
    const orders = defineResource({ name: "orders", schema: Order, primaryKey: "id" })
    const updateKeys = Object.keys(
      (orders.schemas.update as unknown as { fields: Record<string, unknown> }).fields
    )
    expect(updateKeys).not.toContain("metadata")
  })
})

describe("F0 — what already worked", () => {
  it("Tag and Product introspect cleanly", () => {
    for (const schema of [Tag, Product]) {
      const fields = introspect(schema.ast)
      expect(fields.every((f) => f.kind !== "unsupported")).toBe(true)
    }
  })

  it("refinements unwrap: sku (pattern) is text, stock (Int) is number", () => {
    const fields = introspect(Product.ast)
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(byName.sku?.kind).toBe("text")
    expect(byName.stock?.kind).toBe("number")
    expect(byName.status?.kind).toBe("select")
    expect(byName.status?.options).toEqual(["available", "out_of_stock", "discontinued"])
  })
})
