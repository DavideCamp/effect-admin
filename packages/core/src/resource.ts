import * as Option from "effect/Option"
import type * as Schema from "effect/Schema"
import { introspect } from "./introspect.js"
import type { FieldMeta } from "./types.js"

export type ConventionalOperation = "list" | "get" | "create" | "update" | "delete"

/** The small runtime surface effect-admin needs from an HttpApiGroup. */
export interface AdminApiGroup {
  readonly identifier: string
  readonly endpoints: Readonly<Record<string, unknown>>
}

export interface AdminFieldConfig {
  readonly hidden?: boolean
  readonly readOnly?: boolean
  readonly widget?: "text" | "textarea" | "number" | "checkbox" | "select" | "date"
  readonly width?: number | string
}

export interface AdminActionConfig {
  readonly endpoint: string
  readonly label?: string
  readonly confirm?: string
}

export interface AdminActionDef extends AdminActionConfig {
  /** Derived from the action endpoint body payload; empty for payload-free actions. */
  readonly fields: ReadonlyArray<FieldMeta>
}

export interface AdminResourceConfig<S extends Schema.Schema.AnyNoContext> {
  readonly model: S
  readonly apiGroup: AdminApiGroup
  readonly name?: string
  readonly label?: string
  readonly primaryKey?: string
  readonly list?: { readonly columns?: ReadonlyArray<string> }
  readonly fields?: Readonly<Record<string, AdminFieldConfig>>
  readonly operations?: Partial<Record<ConventionalOperation, string | false>>
  readonly actions?: Readonly<Record<string, AdminActionConfig>>
}

export interface AdminResourceDef<S extends Schema.Schema.AnyNoContext = Schema.Schema.AnyNoContext> {
  readonly name: string
  readonly label: string
  readonly model: S
  readonly apiGroup: AdminApiGroup
  readonly groupName: string
  readonly primaryKey: string
  readonly fields: ReadonlyArray<FieldMeta>
  readonly fieldConfig: Readonly<Record<string, AdminFieldConfig>>
  readonly listColumns: ReadonlyArray<string>
  readonly operations: Readonly<Partial<Record<ConventionalOperation, string>>>
  readonly actions: Readonly<Record<string, AdminActionDef>>
}

const humanize = (value: string) =>
  value.replace(/[-_]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())

export const defineAdminResource = <S extends Schema.Schema.AnyNoContext>(
  config: AdminResourceConfig<S>
): AdminResourceDef<S> => {
  const name = config.name ?? config.apiGroup.identifier
  const fields = introspect(config.model.ast)
  const names = new Set(fields.map((field) => field.name))
  const primaryKey = config.primaryKey ?? "id"
  if (!names.has(primaryKey)) {
    throw new Error(`effect-admin: resource "${name}" has no primary key field "${primaryKey}"`)
  }

  const listColumns = config.list?.columns ?? fields
    .filter((field) => !field.hidden && !config.fields?.[field.name]?.hidden)
    .slice(0, 6)
    .map((field) => field.name)
  for (const field of listColumns) {
    if (!names.has(field)) {
      throw new Error(`effect-admin: resource "${name}" has no list field "${field}"`)
    }
  }

  const operations: Partial<Record<ConventionalOperation, string>> = {}
  for (const operation of ["list", "get", "create", "update", "delete"] as const) {
    const endpoint = config.operations?.[operation]
    if (endpoint === false) continue
    const endpointName = endpoint ?? operation
    if (endpointName in config.apiGroup.endpoints) operations[operation] = endpointName
  }

  for (const action of Object.values(config.actions ?? {})) {
    if (!(action.endpoint in config.apiGroup.endpoints)) {
      throw new Error(
        `effect-admin: resource "${name}" action references missing endpoint "${action.endpoint}"`
      )
    }
  }

  const actions = Object.fromEntries(
    Object.entries(config.actions ?? {}).map(([name, action]) => {
      const endpoint = config.apiGroup.endpoints[action.endpoint] as {
        readonly payloadSchema?: Option.Option<Schema.Schema.Any>
      }
      const payload = endpoint.payloadSchema
        ? Option.getOrUndefined(endpoint.payloadSchema)
        : undefined
      return [name, {
        ...action,
        fields: payload ? introspect(payload.ast) : []
      } satisfies AdminActionDef]
    })
  )

  return {
    name,
    label: config.label ?? humanize(name),
    model: config.model,
    apiGroup: config.apiGroup,
    groupName: config.apiGroup.identifier,
    primaryKey,
    fields,
    fieldConfig: config.fields ?? {},
    listColumns,
    operations,
    actions
  }
}
