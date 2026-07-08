import { EffectAdmin } from "@effect-admin/react"
import "@effect-admin/react/styles.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { resources } from "./admin.js"
import { AppApi } from "./contracts.js"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <EffectAdmin api={AppApi} resources={resources} basePath="/admin" />
  </StrictMode>
)
