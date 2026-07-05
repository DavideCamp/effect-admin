import { AdminField } from "@effect-admin/annotations"
import { Schema } from "effect"

export const User = Schema.Struct({
  id: Schema.Int.annotations({
    title: "ID",
    [AdminField]: { auto: true }
  }),
  email: Schema.String.pipe(Schema.minLength(3)).annotations({ title: "Email" }),
  fullName: Schema.propertySignature(
    Schema.String.annotations({ title: "Nome completo" })
  ).pipe(Schema.fromKey("full_name")),
  active: Schema.Boolean.annotations({ title: "Attivo" }),
  role: Schema.Literal("admin", "staff", "user").annotations({ title: "Ruolo" }),
  createdAt: Schema.propertySignature(
    Schema.Date.annotations({
      title: "Creato il",
      [AdminField]: { auto: true }
    })
  ).pipe(Schema.fromKey("created_at"))
})

export type User = typeof User.Type
