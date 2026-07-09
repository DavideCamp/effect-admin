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
- First npm feedback release: `@effect-admin/*@0.1.0`

## Release checks for every 0.1.x alpha

- Run typecheck, unit/DOM tests, Vite build, and Next build before publishing
- Inspect npm tarball contents with `pnpm release:check`
- Perform a browser keyboard and core workflow smoke pass
- Publish with the `alpha` dist-tag until the public types have survived real
  app usage
- Ensure git tags point at the commit that produced the npm artifacts

## Next production-hardening work

- Effect 4 beta / `effect/unstable/httpapi` adapter or compatibility story
- A documented auth/session example for custom headers and cookies
- One real host-app integration smoke test, separate from the package examples
- Accessibility smoke checklist for keyboard navigation in the default UI

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
