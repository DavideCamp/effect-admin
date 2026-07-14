export type ConventionalOperation = "list" | "get" | "create" | "update" | "delete"

export type FieldKind =
  | "text"
  | "number"
  | "checkbox"
  | "select"
  | "date"
  | "unsupported"

export interface FieldMeta {
  readonly name: string
  readonly title: string
  readonly kind: FieldKind
  readonly optional: boolean
  readonly auto: boolean
  readonly nullable: boolean
  readonly options?: ReadonlyArray<string | number>
  readonly relation?: {
    readonly resource: string
    readonly displayField?: string
    readonly multiple: boolean
  }
  readonly hidden: boolean
  readonly readOnly: boolean
  readonly sensitive: boolean
}

export interface AdminApiGroup<
  Endpoints extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> {
  readonly identifier: string
  readonly endpoints: Endpoints
}

export interface AdminFieldConfig {
  readonly hidden?: boolean
  readonly readOnly?: boolean
  readonly widget?: "text" | "textarea" | "number" | "checkbox" | "select" | "date"
  readonly width?: number | string
}

export interface AdminActionConfig<Endpoint extends string = string> {
  readonly endpoint: Endpoint
  readonly label?: string
  readonly confirm?: string
}

export interface AdminActionDef extends AdminActionConfig {
  readonly fields: ReadonlyArray<FieldMeta>
}

export interface AdminResourceDef<
  Model = unknown,
  Group extends AdminApiGroup = AdminApiGroup
> {
  readonly name: string
  readonly label: string
  readonly model: Model
  readonly apiGroup: Group
  readonly groupName: string
  readonly primaryKey: string
  readonly fields: ReadonlyArray<FieldMeta>
  readonly fieldConfig: Readonly<Partial<Record<string, AdminFieldConfig>>>
  readonly listColumns: ReadonlyArray<string>
  readonly operations: Readonly<Partial<Record<ConventionalOperation, string>>>
  readonly actions: Readonly<Record<string, AdminActionDef>>
}

export interface AdminFilter {
  readonly field: string
  readonly operator: "eq" | "contains" | "gte" | "lte"
  readonly value: string | number | boolean
}

export interface ResourceCapabilitiesValue {
  readonly list?: boolean | undefined
  readonly get?: boolean | undefined
  readonly create?: boolean | undefined
  readonly update?: boolean | undefined
  readonly delete?: boolean | undefined
  readonly actions?: Readonly<Record<string, boolean>> | undefined
}

export type AdminCapabilitiesValue = Readonly<Record<string, ResourceCapabilitiesValue>>

export type AdminRecord = Record<string, unknown>

export interface AdminListResultValue {
  readonly rows: ReadonlyArray<AdminRecord>
  readonly total: number
}

declare const AdminTaskSuccess: unique symbol
declare const AdminTaskError: unique symbol

/** A Promise or Effect program produced by either supported Effect major. */
export interface AdminTask<Success = unknown, Error = unknown> {
  readonly [AdminTaskSuccess]?: Success
  readonly [AdminTaskError]?: Error
}

export type AdminEndpoint<
  Request = unknown,
  Success = unknown,
  Error = unknown
> = (request: Request) => AdminTask<Success, Error>

type AnyAdminEndpoint = (...args: ReadonlyArray<never>) => unknown

export type AdminClient = Readonly<
  Record<string, Readonly<Record<string, AnyAdminEndpoint>>>
>

export const validateAdminResources = (
  resources: ReadonlyArray<AdminResourceDef>
): void => {
  const resourcesByName = new Map<string, AdminResourceDef>()
  const resourcesByGroupName = new Map<string, AdminResourceDef>()
  for (const resource of resources) {
    if (resourcesByName.has(resource.name)) {
      throw new Error(`effect-admin: duplicate resource name "${resource.name}"`)
    }
    if (resourcesByGroupName.has(resource.groupName)) {
      throw new Error(`effect-admin: duplicate resource api group "${resource.groupName}"`)
    }
    resourcesByName.set(resource.name, resource)
    resourcesByGroupName.set(resource.groupName, resource)
  }

  for (const resource of resources) {
    for (const field of resource.fields) {
      const relation = field.relation
      if (!relation) continue
      const target = resourcesByName.get(relation.resource)
      if (!target) {
        throw new Error(
          `effect-admin: resource "${resource.name}" field "${field.name}" ` +
          `references missing relation resource "${relation.resource}"`
        )
      }
      const displayField = relation.displayField
      if (displayField && !target.fields.some((field) => field.name === displayField)) {
        throw new Error(
          `effect-admin: resource "${resource.name}" field "${field.name}" ` +
          `references missing display field "${displayField}" on "${relation.resource}"`
        )
      }
    }
  }
}
