import type { ResourceDef } from "./resource.js"
import type { FieldMeta, ListFilter, ListOpts } from "./types.js"

/**
 * Normalized, trustworthy list options: every repo implementation runs
 * raw ListOpts through here BEFORE touching storage. Guarantees:
 *
 * - page ≥ 1, 1 ≤ pageSize ≤ 200
 * - orderBy is a sortable field of the resource (else dropped)
 * - every filter targets an existing, non-`unsupported` field whose kind
 *   admits that filter shape (else dropped)
 *
 * This is the column whitelist of the roadmap: SQL identifiers only ever
 * come from FieldMeta names, never from caller input.
 */
export interface NormalizedListOpts {
  readonly page: number
  readonly pageSize: number
  readonly offset: number
  readonly orderBy: string | undefined
  readonly orderDir: "asc" | "desc"
  readonly search: string | undefined
  readonly filters: ReadonlyArray<ListFilter>
  /** The text fields `search` runs against. */
  readonly searchFields: ReadonlyArray<string>
}

export const MAX_PAGE_SIZE = 200
export const DEFAULT_PAGE_SIZE = 25

const filterAdmitted = (f: FieldMeta, filter: ListFilter): boolean => {
  switch (filter._tag) {
    case "eq":
      return f.kind === "select" || f.kind === "checkbox" || f.kind === "number" || f.kind === "text"
    case "contains":
      return f.kind === "text"
    case "range":
      return f.kind === "number" || f.kind === "date"
  }
}

export const normalizeListOpts = (r: ResourceDef, opts: ListOpts): NormalizedListOpts => {
  const byName = new Map(r.fields.map((f) => [f.name, f]))

  const page = Math.max(1, Math.floor(opts.page ?? 1))
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(opts.pageSize ?? DEFAULT_PAGE_SIZE)))

  const orderField = opts.orderBy === undefined ? undefined : byName.get(opts.orderBy)
  const orderBy =
    orderField !== undefined && orderField.kind !== "unsupported" ? orderField.name : undefined

  const filters = (opts.filters ?? []).filter((filter) => {
    const f = byName.get(filter.field)
    return f !== undefined && f.kind !== "unsupported" && filterAdmitted(f, filter)
  })

  const search = opts.search?.trim() || undefined
  const searchFields = r.fields.filter((f) => f.kind === "text").map((f) => f.name)

  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    orderBy,
    orderDir: opts.orderDir === "desc" ? "desc" : "asc",
    search: searchFields.length > 0 ? search : undefined,
    filters,
    searchFields
  }
}
