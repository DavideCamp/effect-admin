import { AdminCapabilities } from "@effect-admin/contracts"
import { AdminField, defineCrudResource, makeAdminApi } from "@effect-admin/core"
import * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint"
import * as HttpApiGroup from "@effect/platform/HttpApiGroup"
import * as Schema from "effect/Schema"

export const AdminHeaders = Schema.Struct({
  authorization: Schema.optional(Schema.String),
  "x-tenant-id": Schema.optional(Schema.String)
})

export const User = Schema.Struct({
  id: Schema.Int.annotations({ [AdminField]: { auto: true, readOnly: true } }),
  email: Schema.String,
  fullName: Schema.propertySignature(Schema.String).pipe(Schema.fromKey("full_name")),
  active: Schema.Boolean
})

export const users = defineCrudResource({
  name: "users",
  model: User,
  headers: AdminHeaders,
  list: { columns: ["id", "email", "fullName", "active"] }
})

export const resources = [users] as const

export const AdminMetaApi = HttpApiGroup.make("admin").add(
  HttpApiEndpoint.get("capabilities", "/admin/capabilities")
    .setHeaders(AdminHeaders)
    .addSuccess(AdminCapabilities)
)

export const AppApi = makeAdminApi("app", resources)
  .add(AdminMetaApi)
  .prefix("/api")
