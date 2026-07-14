import type { AdminFilter } from "@effect-admin/contracts"
import type { AdminResourceDef, FieldMeta } from "@effect-admin/core"

export const listFilterFields = (resource: AdminResourceDef): ReadonlyArray<FieldMeta> =>
  resource.fields.filter((field) =>
    !field.hidden &&
    !resource.fieldConfig[field.name]?.hidden &&
    ["text", "select", "checkbox"].includes(field.kind)
  )

const filterValue = (field: FieldMeta, raw: string): AdminFilter["value"] => {
  if (field.kind === "checkbox") return raw === "true"
  if (field.kind === "select") {
    const option = field.options?.find((item) => String(item) === raw)
    if (typeof option === "string" || typeof option === "number") return option
  }
  return raw
}

export const listFiltersFromQuery = (
  fields: ReadonlyArray<FieldMeta>,
  query: URLSearchParams
): ReadonlyArray<AdminFilter> =>
  fields.flatMap((field) => {
    const raw = query.get(`f_${field.name}`)
    if (raw === null || raw === "") return []
    return [{
      field: field.name,
      operator: field.kind === "text" ? "contains" : "eq",
      value: filterValue(field, raw)
    }]
  })

