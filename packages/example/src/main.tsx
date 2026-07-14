import { AdminCapabilities } from "@effect-admin/contracts"
import { EffectAdmin } from "@effect-admin/react"
import { makeEffect3AdminClient } from "@effect-admin/react/effect3"
import "@effect-admin/react/styles.css"
import { StrictMode, useCallback, useMemo, useState } from "react"
import { createRoot } from "react-dom/client"
import * as Schema from "effect/Schema"
import { AppApi, resources } from "./admin.js"

type DemoRole = "admin" | "staff" | "viewer"

const ExampleApp = () => {
  const [role, setRole] = useState<DemoRole>("staff")
  const adminHeaders = useMemo(() => ({ "x-admin-role": role }), [role])
  const clientOptions = useMemo(() => ({ headers: adminHeaders }), [adminHeaders])
  const loadCapabilities = useCallback(async () => {
    const response = await fetch("/api/admin/capabilities", { headers: adminHeaders })
    if (!response.ok) throw new Error("Unable to load demo capabilities.")
    return Schema.decodeUnknownPromise(AdminCapabilities)(await response.json())
  }, [adminHeaders])

  return (
    <>
      <label
        style={{
          position: "fixed",
          top: 12,
          right: 12,
          zIndex: 20,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          border: "1px solid #e2e6eb",
          borderRadius: 10,
          background: "white",
          font: "13px system-ui"
        }}
      >
        <span>Demo role</span>
        <select value={role} onChange={(event) => setRole(event.target.value as DemoRole)}>
          <option value="admin">admin: all controls</option>
          <option value="staff">staff: no destructive user/tag actions</option>
          <option value="viewer">viewer: read-only</option>
        </select>
      </label>
      <EffectAdmin
        api={AppApi}
        resources={resources}
        basePath="/admin"
        clientOptions={clientOptions}
        makeClient={makeEffect3AdminClient}
        loadCapabilities={loadCapabilities}
      />
    </>
  )
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ExampleApp />
  </StrictMode>
)
