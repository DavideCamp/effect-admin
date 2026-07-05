import { AdminField } from "@effect-admin/annotations"
import { Schema } from "effect"

/**
 * The read-only resource of the domain (D5): order invariants (totals,
 * state machine) belong to the host app's services, so the admin must
 * never write it. The `readOnly` flag on `defineResource` arrives in F1.
 *
 * Also carries the shapes the other resources don't: a branded type
 * (totalCents) and a JSON column (metadata).
 */
export const Cents = Schema.Int.pipe(Schema.brand("Cents"))
export type Cents = typeof Cents.Type

export const Order = Schema.Struct({
  id: Schema.Int.annotations({
    title: "ID",
    [AdminField]: { auto: true }
  }),
  userId: Schema.propertySignature(
    Schema.Int.annotations({
      title: "Cliente",
      [AdminField]: { ref: "users", displayField: "email" }
    })
  ).pipe(Schema.fromKey("user_id")),
  status: Schema.Literal("pending", "paid", "shipped", "cancelled").annotations({
    title: "Stato"
  }),
  totalCents: Schema.propertySignature(
    Cents.annotations({ title: "Totale (cent)" })
  ).pipe(Schema.fromKey("total_cents")),
  // jsonb column: intentionally opaque to the admin (kind "unsupported",
  // graceful degradation — mina #3). A dedicated editor is F6 backlog.
  metadata: Schema.NullOr(Schema.Unknown).annotations({ title: "Metadata" }),
  placedAt: Schema.propertySignature(
    Schema.Date.annotations({
      title: "Effettuato il",
      [AdminField]: { auto: true }
    })
  ).pipe(Schema.fromKey("placed_at"))
})

export type Order = typeof Order.Type
