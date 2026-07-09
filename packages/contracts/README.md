# @effect-admin/contracts

Shared Effect Schema contracts for conventional admin list parameters,
paginated results, capabilities, not-found errors, field validation errors, and
conventional CRUD `HttpApiGroup` generation.

The package exists so server and frontend packages in an Effect monorepo can
agree on the tiny admin contract without depending on React.

The conventional CRUD group exposes endpoint names that `@effect-admin/react`
understands by default: `list`, `get`, `create`, `update`, and `delete`.
Custom business operations should stay as explicit host-owned `HttpApi`
endpoints and can be surfaced by the admin as actions.

`AdminCapabilities` is exported as a Schema as well as a type so a host can
serve and validate the current session's UI permissions without inventing a
parallel contract.

Capabilities only describe what controls the UI should offer. They are not an
authorization layer.
