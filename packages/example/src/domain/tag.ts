import { AdminField } from "@effect-admin/annotations"
import { Schema } from "effect"

/**
 * Deliberately flat — single-word column names, no fromKey — so it is
 * registerable already in F0 with the PoC introspector. The M2M with Post
 * goes through the `post_tags` bridge table (DDL in F1, widget in F4).
 */
export const Tag = Schema.Struct({
  id: Schema.Int.annotations({
    title: "ID",
    [AdminField]: { auto: true }
  }),
  name: Schema.String.pipe(Schema.minLength(1)).annotations({ title: "Nome" })
})

export type Tag = typeof Tag.Type
