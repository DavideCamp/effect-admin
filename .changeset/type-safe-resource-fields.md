---
"@effect-admin/core": patch
"@effect-admin/react": patch
---

Type resource field configuration against decoded model keys so list columns,
primary keys, and field overrides catch simple typos at compile time. Resource
operation overrides now fail fast when they reference missing endpoints, and
resource validation catches duplicate `HttpApiGroup` identifiers.

Add generated-client `fetchOptions` for cookie-backed sessions and other fetch
runtime options such as `{ credentials: "include" }`, and expose a configurable
`pageSize` prop for list requests. Admin routing now normalizes `basePath`,
encodes generated links, and rejects malformed encoded paths. List rows missing
the configured primary key now show a clear error instead of navigating to an
invalid detail URL. The default UI has been polished with clearer loading,
empty, error, focus, table, toolbar, and responsive states while keeping the
same component override surface.
