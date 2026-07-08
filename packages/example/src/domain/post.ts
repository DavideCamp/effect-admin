import { AdminField } from "@effect-admin/annotations"
import * as Schema from "effect/Schema"

export const Post = Schema.Struct({
  id: Schema.Int.annotations({
    title: "ID",
    [AdminField]: { auto: true }
  }),
  authorId: Schema.propertySignature(
    Schema.Int.annotations({
      title: "Autore",
      [AdminField]: { ref: "users", displayField: "email" }
    })
  ).pipe(Schema.fromKey("author_id")),
  title: Schema.String.pipe(Schema.minLength(1)).annotations({ title: "Titolo" }),
  slug: Schema.String.pipe(Schema.pattern(/^[a-z0-9-]+$/)).annotations({ title: "Slug" }),
  body: Schema.String.annotations({ title: "Testo" }),
  status: Schema.Literal("draft", "published", "archived").annotations({
    title: "Stato"
  }),
  tagIds: Schema.Array(Schema.Int).annotations({
    title: "Tag",
    [AdminField]: { ref: "tags", displayField: "name" }
  }),
  publishedAt: Schema.propertySignature(
    Schema.NullOr(Schema.Date).annotations({ title: "Pubblicato il" })
  ).pipe(Schema.fromKey("published_at")),
  createdAt: Schema.propertySignature(
    Schema.Date.annotations({
      title: "Creato il",
      [AdminField]: { auto: true }
    })
  ).pipe(Schema.fromKey("created_at"))
})

export type Post = typeof Post.Type
