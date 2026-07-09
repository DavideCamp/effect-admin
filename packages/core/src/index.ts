export { AdminField, type AdminFieldAnnotation } from "@effect-admin/annotations"
export { introspect, resolveStruct } from "./introspect.js"
export {
  deriveAdminCreateSchema,
  deriveAdminUpdateSchema,
  defineAdminResource,
  defineCrudResource,
  makeAdminApi,
  validateAdminResources,
  type AdminApiGroup,
  type AdminActionConfig,
  type AdminActionDef,
  type AdminCrudResourceConfig,
  type AdminFieldConfig,
  type AdminResourceConfig,
  type AdminResourceDef,
  type ConventionalOperation
} from "./resource.js"
export {
  bindCrudHandlers,
  makeCrudHandlers,
  type AdminCrudHandlerMap,
  type AdminCrudRepository,
  type AdminListResultValue
} from "./server.js"
export { type FieldKind, type FieldMeta } from "./types.js"
