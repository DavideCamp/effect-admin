import { AdminField } from "@effect-admin/annotations"
import { Schema } from "effect"

/**
 * Like Tag, F0-registerable by design: single-word column names, no
 * fromKey. Still carries refinements (sku pattern, positive price,
 * integer stock) — the PoC introspector unwraps refinements, so these
 * exercise that path from day one.
 */
export const Product = Schema.Struct({
  id: Schema.Int.annotations({
    title: "ID",
    [AdminField]: { auto: true }
  }),
  name: Schema.String.pipe(Schema.minLength(1)).annotations({ title: "Nome" }),
  sku: Schema.String.pipe(Schema.pattern(/^[A-Z0-9-]+$/)).annotations({ title: "SKU" }),
  price: Schema.Number.pipe(Schema.positive()).annotations({ title: "Prezzo" }),
  status: Schema.Literal("available", "out_of_stock", "discontinued").annotations({
    title: "Stato"
  }),
  stock: Schema.Int.annotations({ title: "Scorte" })
})

export type Product = typeof Product.Type
