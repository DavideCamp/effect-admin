export { AdminField, type AdminFieldAnnotation } from "@effect-admin/annotations"
export { validateAdminResources } from "@effect-admin/shared"
export { introspect, resolveStruct } from "./introspect.js"
export {
  deriveAdminCreateSchema,
  deriveAdminUpdateSchema,
  defineAdminResource,
  defineCrudResource,
  makeAdminApi,
  type AdminCrudResourceConfig,
  type AdminFieldName,
  type AdminResourceConfig
} from "./resource.js"
export {
  makeCrudHandlers,
  type AdminCreateRequest,
  type AdminCrudHandlerMap,
  type AdminCrudRepository,
  type AdminDeleteRequest,
  type AdminGetRequest,
  type AdminListRequest,
  type AdminListResultValue,
  type AdminUpdateRequest
} from "./server.js"
export { type FieldKind, type FieldMeta } from "./types.js"
export type {
  AdminActionConfig,
  AdminActionDef,
  AdminApiGroup,
  AdminFieldConfig,
  AdminResourceDef,
  ConventionalOperation
} from "@effect-admin/shared"
