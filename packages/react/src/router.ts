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

export const normalizeBasePath = (basePath: string): string => {
  const normalized = `/${basePath}`.replace(/\/+/g, "/").replace(/\/+$/g, "")
  return normalized === "" ? "/" : normalized
}

const joinPath = (basePath: string, segments: ReadonlyArray<string | number>) => {
  const base = normalizeBasePath(basePath)
  const suffix = segments.map((segment) => encodeURIComponent(String(segment))).join("/")
  return suffix ? `${base === "/" ? "" : base}/${suffix}` : base
}

export const resourcePath = (basePath: string, resource: string) =>
  joinPath(basePath, [resource])

export const createPath = (basePath: string, resource: string) =>
  joinPath(basePath, [resource, "new"])

export const recordPath = (basePath: string, resource: string, id: string | number) =>
  joinPath(basePath, [resource, id])

export const editPath = (basePath: string, resource: string, id: string | number) =>
  joinPath(basePath, [resource, id, "edit"])

export const useAdminLocation = (basePath: string) =>
  useSyncExternalStore(subscribe, browserLocation, () => normalizeBasePath(basePath))

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
  const base = normalizeBasePath(basePath)
  const pathname = location.split("?", 1)[0] ?? ""
  if (pathname !== base && !pathname.startsWith(`${base === "/" ? "" : base}/`)) {
    return { screen: "not-found" }
  }
  const relative = pathname.slice(base.length).replace(/^\/+|\/+$/g, "")
  if (relative === "") return { screen: "home" }
  let parts: ReadonlyArray<string>
  try {
    parts = relative.split("/").map(decodeURIComponent)
  } catch {
    return { screen: "not-found" }
  }
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
