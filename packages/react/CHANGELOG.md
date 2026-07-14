# @effect-admin/react

## 0.1.6

### Patch Changes

- Keep the React renderer Effect-version-neutral and expose the Effect 3 client
  adapter from `@effect-admin/react/effect3`. This prevents Effect 4 applications
  from resolving and bundling the incompatible Effect 3 platform package.

## 0.1.5

### Patch Changes

- Add the version-neutral shared resource and client contract, publish the Effect 4 adapter, and let the React package consume clients from either supported Effect generation.

## 0.1.4

### Patch Changes

- Harden admin resource writes, typed CRUD seams, list filtering, and React state handling.
- Updated dependencies
  - @effect-admin/contracts@0.1.4
  - @effect-admin/core@0.1.4

## 0.1.3

### Patch Changes

- 118cff2: Type resource field configuration against decoded model keys so list columns,
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

- Updated dependencies [118cff2]
  - @effect-admin/core@0.1.3

## 0.1.2

### Patch Changes

- 93eeca9: Add generated-client `clientOptions` for request headers and advanced client
  transforms, support optional headers on generated CRUD HttpApi groups, and make
  the example enforce role-based capabilities server-side.
- Updated dependencies [93eeca9]
  - @effect-admin/contracts@0.1.2
  - @effect-admin/core@0.1.2

## 0.1.1

### Patch Changes

- Prepare the 0.1.1 alpha with tighter React admin client types, safer runtime
  error parsing, cleaner resource-definition internals, and expanded integration
  documentation for npm installs, capabilities, custom clients, Vite, and Next.js.
- Updated dependencies
  - @effect-admin/contracts@0.1.1
  - @effect-admin/core@0.1.1

## 0.1.0

### Minor Changes

- First alpha version.

### Patch Changes

- Updated dependencies
  - @effect-admin/contracts@0.1.0
  - @effect-admin/core@0.1.0
