# @effect-admin/core

Turns decoded Effect Schema models and `HttpApiGroup` contracts into validated
admin resource metadata.

```bash
pnpm add @effect-admin/core@0.1.2 @effect-admin/contracts@0.1.2 @effect-admin/annotations@0.1.1 effect@^3.21.4 @effect/platform@^0.96.2
```

This package is the convention layer for the happy path:

```ts
const users = defineCrudResource({
  name: "users",
  model: User
})
```

`defineCrudResource({ name, model })` creates the conventional CRUD
`HttpApiGroup`, derives admin create/update payloads from model annotations,
and returns the resource metadata consumed by `@effect-admin/react`.

Resource configuration is typed against decoded model keys. For a field
declared with `Schema.fromKey("full_name")`, use `fullName` in `primaryKey`,
`list.columns`, and `fields`.

Explicit operation mappings fail fast when they point at a missing endpoint.
Conventional operations are still optional: if a group simply has no `delete`
endpoint, the delete control is omitted.

For existing or non-conventional APIs, use `defineAdminResource` and map the
operations explicitly.

`validateAdminResources(resources)` checks the cross-resource invariants that
matter before production boot: duplicate resource names, relation targets, and
relation display fields.

`makeCrudHandlers(repository)` reduces conventional backend CRUD handler
boilerplate while keeping persistence, transactions, auth, and business rules
in the host application.

The package contains no React and no persistence code. effect-admin should
describe the admin seam; the host application should still own the domain.

The `0.1.x` line targets Effect 3 `HttpApi`. Effect 4 beta support should be a
separate adapter/release.
