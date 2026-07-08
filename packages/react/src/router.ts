import { useSyncExternalStore } from "react"

const navigationEvent = "effect-admin:navigate"

const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify)
  window.addEventListener(navigationEvent, notify)
  return () => {
    window.removeEventListener("popstate", notify)
    window.removeEventListener(navigationEvent, notify)
  }
}

const browserLocation = () => window.location.pathname + window.location.search

export const useAdminLocation = (basePath: string) =>
  useSyncExternalStore(subscribe, browserLocation, () => basePath)

export const navigate = (to: string, replace = false) => {
  if (replace) window.history.replaceState(null, "", to)
  else window.history.pushState(null, "", to)
  window.dispatchEvent(new Event(navigationEvent))
}

export interface AdminRoute {
  readonly screen: "home" | "list" | "create" | "detail" | "edit" | "not-found"
  readonly resource?: string
  readonly id?: string
}

export const matchAdminRoute = (location: string, basePath: string): AdminRoute => {
  const pathname = location.split("?", 1)[0] ?? ""
  if (!pathname.startsWith(basePath)) return { screen: "not-found" }
  const relative = pathname.slice(basePath.length).replace(/^\/+|\/+$/g, "")
  if (relative === "") return { screen: "home" }
  const parts = relative.split("/").map(decodeURIComponent)
  if (parts.length === 1) return { screen: "list", resource: parts[0]! }
  if (parts.length === 2 && parts[1] === "new") {
    return { screen: "create", resource: parts[0]! }
  }
  if (parts.length === 2) return { screen: "detail", resource: parts[0]!, id: parts[1]! }
  if (parts.length === 3 && parts[2] === "edit") {
    return { screen: "edit", resource: parts[0]!, id: parts[1]! }
  }
  return { screen: "not-found" }
}
