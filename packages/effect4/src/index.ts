export { AdminField, type AdminFieldAnnotation } from "@effect-admin/annotations"
export {
  validateAdminResources,
  type AdminActionConfig,
  type AdminActionDef,
  type AdminApiGroup,
  type AdminCapabilitiesValue,
  type AdminClient,
  type AdminFieldConfig,
  type AdminFilter as AdminFilterValue,
  type AdminResourceDef,
  type ConventionalOperation,
  type FieldKind,
  type FieldMeta,
  type ResourceCapabilitiesValue
} from "@effect-admin/shared"
export {
  AdminCapabilities,
  AdminFilter,
  AdminForbidden,
  AdminListParams,
  AdminListResult,
  AdminNotFound,
  AdminValidationError,
  ResourceCapabilities,
  makeCrudApiGroup,
  type AdminCrudApiConfig
} from "./contracts.js"
export {
  makeEffect4AdminClient,
  type Effect4AdminClientOptions
} from "./client.js"
export { introspect, resolveStruct } from "./introspect.js"
export {
  defineAdminResource,
  defineCrudResource,
  deriveAdminCreateSchema,
  deriveAdminUpdateSchema,
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
