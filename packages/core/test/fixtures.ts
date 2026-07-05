import { AdminField } from "@effect-admin/annotations"
import { Schema } from "effect"

/**
 * Test fixture carried over from the PoC: a schema exercising every field
 * kind the introspector supported at PoC time. The realistic domain lives
 * in @effect-admin/example — this one stays minimal on purpose.
 */
export const User = Schema.Struct({
  id: Schema.Number.annotations({
    title: "ID",
    [AdminField]: { auto: true }
  }),
  email: Schema.String.annotations({ title: "Email" }),
  active: Schema.Boolean.annotations({ title: "Attivo" }),
  role: Schema.Literal("admin", "user").annotations({ title: "Ruolo" }),
  createdAt: Schema.Date.annotations({
    title: "Creato il",
    [AdminField]: { auto: true }
  })
})

export type User = typeof User.Type
