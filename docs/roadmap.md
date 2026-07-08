# Roadmap

## V1 foundation — implemented

- Decoded Schema AST introspection
- Conventional `HttpApiGroup` resource registration
- Standard paginated list and validation-error contracts
- Internal base-path router
- Default responsive React layout and CSS
- List/search/filter/sort/pagination
- Detail/create/update/delete screens
- Field-level server validation
- Capability-aware controls
- Single and multiple relation lookup
- Typed custom-action payload forms and confirmations
- Layout, text input, and data-table overrides
- Dedicated authentication/forbidden states
- Runnable Vite + HttpApi example with users, posts, and tags
- DOM integration tests and automated accessibility checks
- Next.js App Router build fixture
- Lazy default-client chunk and measured production bundle
- Publish-ready package exports and metadata

## Release checks for 0.1

- Run typecheck, unit/DOM tests, Vite build, and Next build in CI
- Inspect npm tarball contents before publishing
- Perform a browser keyboard and core workflow smoke pass
- Treat the 0.1 public types and exports as frozen after publication

## Later, only after external use

- Searchable relation widgets and dedicated lookup endpoints for large or sensitive datasets
- Bulk selection and bulk actions
- Custom pages and dashboard extension points
- Cursor-pagination strategy
- Additional component slots
- i18n

## Explicit non-goals

- Arbitrary REST/OpenAPI adapters
- Direct generic SQL writes
- Library-owned users/groups/permission tables
- Automatic analytics or chart inference
- React Server Component rendering
