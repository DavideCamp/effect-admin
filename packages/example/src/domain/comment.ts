import { AdminField } from "@effect-admin/annotations"
import { Schema } from "effect"

export const Comment = Schema.Struct({
  id: Schema.Int.annotations({
    title: "ID",
    [AdminField]: { auto: true }
  }),
  postId: Schema.propertySignature(
    Schema.Int.annotations({
      title: "Post",
      [AdminField]: { ref: "posts", displayField: "title" }
    })
  ).pipe(Schema.fromKey("post_id")),
  authorId: Schema.propertySignature(
    Schema.Int.annotations({
      title: "Autore",
      [AdminField]: { ref: "users", displayField: "email" }
    })
  ).pipe(Schema.fromKey("author_id")),
  // Self-FK: a reply points at its parent comment; NULL = top-level.
  parentId: Schema.propertySignature(
    Schema.NullOr(Schema.Int).annotations({
      title: "In risposta a",
      [AdminField]: { ref: "comments" }
    })
  ).pipe(Schema.fromKey("parent_id")),
  body: Schema.String.pipe(Schema.minLength(1)).annotations({ title: "Testo" }),
  createdAt: Schema.propertySignature(
    Schema.Date.annotations({
      title: "Creato il",
      [AdminField]: { auto: true }
    })
  ).pipe(Schema.fromKey("created_at"))
})

export type Comment = typeof Comment.Type
