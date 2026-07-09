# @effect-admin/core

Turns decoded Effect Schema models and `HttpApiGroup` contracts into validated
admin resource metadata.

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
