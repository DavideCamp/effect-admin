import type { AdminCapabilities } from "@effect-admin/contracts"
import type { AdminResourceDef } from "@effect-admin/core"
import type { AdminClient } from "./client.js"

export interface Failure {
  readonly title?: string
  readonly message: string
  readonly fields?: Readonly<Record<string, ReadonlyArray<string>>> | undefined
}

export const failureOf = (error: unknown): Failure => {
  if (typeof error === "object" && error !== null) {
    const value = error as Record<string, unknown>
    const response = typeof value.response === "object" && value.response !== null
      ? value.response as Record<string, unknown>
      : undefined
    if (response?.status === 401) {
      return { title: "Authentication required", message: "Sign in through the host application to continue." }
    }
    if (response?.status === 403) {
      return { title: "Forbidden", message: "You do not have permission to perform this operation." }
    }
    const message = typeof value.message === "string" ? value.message : "The request failed."
    const fields = value.fields
    if (typeof fields === "object" && fields !== null) {
      return { message, fields: fields as Record<string, ReadonlyArray<string>> }
    }
    if (value._tag === "AdminNotFound") return { title: "Not found", message: "This record no longer exists." }
    if (value._tag === "ResponseError") return { message: "The server rejected the request." }
    return { message }
  }
  return { message: "The request failed." }
}

export const can = (
  capabilities: AdminCapabilities | undefined,
  resource: string,
  operation: "list" | "get" | "create" | "update" | "delete"
) => capabilities?.[resource]?.[operation] !== false

export const fieldByName = (resource: AdminResourceDef, name: string) =>
  resource.fields.find((field) => field.name === name)

export const coerceId = (resource: AdminResourceDef, id: string): string | number =>
  fieldByName(resource, resource.primaryKey)?.kind === "number" ? Number(id) : id

export const initialRecord = (resource: Pick<AdminResourceDef, "fields" | "fieldConfig">): Record<string, unknown> => {
  const entries: Array<[string, unknown]> = []
  for (const field of resource.fields) {
    if (field.auto || field.readOnly || resource.fieldConfig[field.name]?.readOnly) continue
    if (field.kind === "checkbox") entries.push([field.name, false])
    else if (field.nullable) entries.push([field.name, null])
  }
  return Object.fromEntries(entries)
}

export const endpoint = (
  client: AdminClient,
  resource: AdminResourceDef,
  operation: "list" | "get" | "create" | "update" | "delete"
) => {
  const name = resource.operations[operation]
  return name === undefined ? undefined : client[resource.groupName]?.[name]
}

export const Loading = () => <div className="ea-state">Loading…</div>

export const ErrorState = ({ failure, retry }: { failure: Failure; retry?: () => void }) => (
  <div className="ea-state ea-error" role="alert">
    <strong>{failure.title ?? "Something went wrong"}</strong>
    <p>{failure.message}</p>
    {retry && <button className="ea-button secondary" onClick={retry}>Try again</button>}
  </div>
)
