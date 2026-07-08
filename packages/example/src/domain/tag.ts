import { AdminField } from "@effect-admin/annotations"
import * as Schema from "effect/Schema"

/** Kept deliberately flat; Post references tags through its typed `tagIds`. */
export const Tag = Schema.Struct({
  id: Schema.Int.annotations({
    title: "ID",
    [AdminField]: { auto: true }
  }),
  name: Schema.String.pipe(Schema.minLength(1)).annotations({ title: "Nome" })
})

export type Tag = typeof Tag.Type
