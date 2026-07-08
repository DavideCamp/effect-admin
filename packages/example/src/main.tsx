import { EffectAdmin } from "@effect-admin/react"
import "@effect-admin/react/styles.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { AppApi, resources } from "./admin.js"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EffectAdmin api={AppApi} resources={resources} basePath="/admin" />
  </StrictMode>
)
