import { AdminCapabilities } from "@effect-admin/contracts"
import { EffectAdmin } from "@effect-admin/react"
import {
  makeEffect3AdminClient,
  type EffectAdminClientOptions
} from "@effect-admin/react/effect3"
import "@effect-admin/react/styles.css"
import * as Schema from "effect/Schema"
import { createRoot } from "react-dom/client"
import { AppApi, resources } from "./admin.js"

const token = () => window.localStorage.getItem("admin-token") ?? ""
const tenantId = () => window.localStorage.getItem("tenant-id") ?? "default"

const adminHeaders = () => ({
  authorization: token() ? `Bearer ${token()}` : "",
  "x-tenant-id": tenantId()
})

const clientOptions: EffectAdminClientOptions = {
  headers: adminHeaders
}

const loadCapabilities = async () => {
  const response = await fetch("/api/admin/capabilities", {
    headers: adminHeaders()
  })
  if (!response.ok) throw new Error("Unable to load admin capabilities.")
  return Schema.decodeUnknownPromise(AdminCapabilities)(await response.json())
}

function AdminApp() {
  return (
    <EffectAdmin
      api={AppApi}
      resources={resources}
      basePath="/admin"
      clientOptions={clientOptions}
      makeClient={makeEffect3AdminClient}
      loadCapabilities={loadCapabilities}
    />
  )
}

createRoot(document.getElementById("root")!).render(<AdminApp />)
