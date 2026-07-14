# effect-admin

**A small, Effect-native admin for monorepos that already use Effect Schema and
`HttpApi`.**

Define your models once, expose the conventional `HttpApi` contract, mount one
React component, and get a clean internal admin: list, search, filters, sorting,
pagination, detail, create, update, delete, relations, typed errors, custom
actions, and capability-aware controls.

The core value proposition is deliberately narrow:

```tsx
<EffectAdmin api={AppApi} resources={resources} makeClient={adapter} />
```

If your application is an Effect monorepo with a React or Next.js frontend,
effect-admin should let you add a useful backoffice surface in a few lines,
then customize only the places where your product actually differs.

The host application owns persistence, business rules, authentication, and
authorization. effect-admin calls the same typed API as any other client; it
does not write directly to your database or create an identity system.

## Status

`0.1.6` is the current public package release. Effect 3 remains supported by the
existing packages, and Effect 4 beta is available through the dedicated
`@effect-admin/effect4` adapter:

```bash
pnpm add @effect-admin/react@0.1.6
```

The API is still alpha and not semver-stable. Use it for internal admin and
backoffice surfaces where the host application owns auth, persistence, and
business rules. Keep production usage behind normal application safeguards.

The intended V1 shape is **minimal by default, custom when needed**:

- conventions for the boring CRUD path;
- escape hatches for host-owned API groups, components, actions, and clients;
- no database adapter, no auth framework, no router lock-in, no design-system
  ambitions.

## Packages

| Package | Purpose |
| --- | --- |
| `@effect-admin/annotations` | Minimal schema annotation symbol |
| `@effect-admin/shared` | Effect-version-neutral resource and client interface |
| `@effect-admin/contracts` | Standard list, typed errors, and CRUD `HttpApi` helpers |
| `@effect-admin/core` | Decoded Schema AST → field metadata and resources |
| `@effect-admin/effect4` | Effect 4 Schema, `effect/unstable/httpapi`, and client adapter |
| `@effect-admin/react` | React application, default components and CSS |
| `@effect-admin/example` | Runnable Vite frontend + host-owned `HttpApi` server |
| `@effect-admin/next-example` | Build fixture for Next.js App Router consumption |

## Compatibility

The Effect 3 packages target:

- `effect@^3.21.4`
- `@effect/platform@^0.96.2`
- `react@^19.1.0`
- `react-dom@^19.1.0`

`@effect-admin/effect4` targets `effect@>=4.0.0-beta.98 <5` and imports HttpApi
from `effect/unstable/httpapi`. `@effect-admin/react` accepts both majors; pass
the Effect 4 client factory shown below. Because Effect 4 and HttpApi are still
beta/unstable, adapter updates may be released as Effect changes.

## Install in an existing monorepo

In a typical Effect monorepo, install the contract/core pieces where your
shared models and API contracts live, and install the React package in the
frontend app.

```bash
pnpm --filter @your-org/app-contract add \
  @effect-admin/core@alpha \
  @effect-admin/contracts@alpha \
  @effect-admin/annotations@alpha \
  effect@^3.21.4 \
  @effect/platform@^0.96.2

pnpm --filter @your-org/web add \
  @effect-admin/react@alpha \
  effect@^3.21.4 \
  @effect/platform@^0.96.2 \
  react \
  react-dom
```

If the app already has compatible peer dependencies, you only need the
`@effect-admin/*` packages in the relevant workspace.

For an Effect 4 workspace, install the dedicated adapter instead of the Effect
3 contract/core packages:

```bash
pnpm --filter @your-org/web add \
  @effect-admin/effect4@alpha \
  @effect-admin/react@alpha \
  effect@beta \
  react \
  react-dom
```

```tsx
import { Schema } from "effect"
import {
  defineCrudResource,
  makeAdminApi,
  makeEffect4AdminClient
} from "@effect-admin/effect4"
import { EffectAdmin } from "@effect-admin/react"

const User = Schema.Struct({ id: Schema.Number, email: Schema.String })
const users = defineCrudResource({ name: "users", model: User })
const AppApi = makeAdminApi("app", [users], { prefix: "/api" })

export const AdminApp = () => (
  <EffectAdmin
    api={AppApi}
    resources={[users]}
    makeClient={makeEffect4AdminClient}
  />
)
```

Suggested layout:

```txt
packages/app-contract/   # Effect Schema models, resources, AppApi
apps/api/                # HttpApiBuilder handlers, persistence, auth
apps/web/                # React/Next admin mount
```

For alpha-track installs you can use the dist-tag instead of pinning:

```bash
pnpm add @effect-admin/react@alpha @effect-admin/core@alpha @effect-admin/contracts@alpha
```

The safer option for a real app is pinning an exact version until the public
API settles:

```bash
pnpm add @effect-admin/react@0.1.6 @effect-admin/core@0.1.5 @effect-admin/contracts@0.1.4
```

For a fuller setup with capabilities, custom clients, Vite, and Next.js, see
[docs/integration-guide.md](docs/integration-guide.md).

For the smallest copy-paste template, see
[examples/minimal-effect-react](examples/minimal-effect-react).

Before promoting an alpha to `latest`, run the external checklist in
[docs/smoke-test.md](docs/smoke-test.md).

## Quick start: Effect model to admin

In a monorepo, keep the admin contract next to the models/API package that both
the server and frontend can import.

```ts
// packages/app-contract/src/admin.ts
import { defineCrudResource, makeAdminApi } from "@effect-admin/core"
import * as Schema from "effect/Schema"

export const User = Schema.Struct({
  id: Schema.Int,
  email: Schema.String,
  fullName: Schema.String,
  active: Schema.Boolean
})

export const users = defineCrudResource({
  name: "users",
  model: User,
  list: { columns: ["id", "email", "fullName", "active"] }
})

export const resources = [users] as const
export const AppApi = makeAdminApi("app", resources, { prefix: "/api" })
```

Implement the handlers in the host server. effect-admin wires the convention;
your app still owns persistence, authorization, validation, transactions, and
business rules.

```ts
// apps/api/src/server.ts
import { makeCrudHandlers } from "@effect-admin/core"
import * as HttpApiBuilder from "@effect/platform/HttpApiBuilder"
import { AppApi } from "@your-org/app-contract/admin"

const UsersCrud = makeCrudHandlers(UsersRepository)

export const UsersLive = HttpApiBuilder.group(AppApi, "users", (handlers) =>
  handlers
    .handle("list", UsersCrud.list)
    .handle("get", UsersCrud.get)
    .handle("create", UsersCrud.create)
    .handle("update", UsersCrud.update)
    .handle("delete", UsersCrud.delete)
)
```

Mount the admin in React, Vite, Next.js, or any React host.

```tsx
// apps/web/src/AdminApp.tsx
import { EffectAdmin } from "@effect-admin/react"
import { makeEffect3AdminClient } from "@effect-admin/react/effect3"
import "@effect-admin/react/styles.css"
import { AppApi, resources } from "@your-org/app-contract/admin"

export function AdminApp() {
  return <EffectAdmin api={AppApi} resources={resources} basePath="/admin" makeClient={makeEffect3AdminClient} />
}
```

That is the happy path. Everything else is an opt-in customization.

## The V1 contract

Each registered `HttpApiGroup` may expose conventional endpoints named:

- `list` — accepts `AdminListParams`, returns `{ rows, total }`
- `get` — accepts `{ path: { id } }`, returns one model
- `create` — accepts `{ payload }`, returns the created model
- `update` — accepts `{ path: { id }, payload }`, returns the model
- `delete` — accepts `{ path: { id } }`

Missing endpoints remove that operation from the UI. Nonstandard endpoint
names can be mapped explicitly.

For the common case, generate the CRUD group and resource from the model:

```ts
import { defineCrudResource, makeAdminApi } from "@effect-admin/core"

export const users = defineCrudResource({
  name: "users",
  model: User,
  list: { columns: ["id", "email", "fullName", "role"] }
})

export const resources = [users] as const
export const AppApi = makeAdminApi("app", resources, { prefix: "/api" })
```

`defineCrudResource` derives `create` from the model by omitting fields marked
`auto`, `readOnly`, `hidden`, or `sensitive`; `update` is `partial(create)`.
Pass explicit `create` / `update` schemas only when the write shape differs
from that convention or you want the backend handler payload to be statically
exact.

This is the main design choice: effect-admin is a **convention library first**,
not a component catalogue first. The convention is what makes the few-lines
setup possible; customization exists to preserve control when the convention is
not enough.

For resources that already have a hand-written `HttpApiGroup`, or whose
endpoint names do not match the convention, use the lower-level registration:

```ts
import { defineAdminResource } from "@effect-admin/core"

export const users = defineAdminResource({
  model: User,
  apiGroup: UsersApi,
  list: { columns: ["id", "email", "fullName", "role"] },
  operations: {
    // Optional escape hatch:
    // create: "store"
  }
})

export const resources = [users]
```

Field identity is the **decoded model key**. A field declared with
`Schema.fromKey("full_name")` is `fullName` in admin configuration because
that is what the decoded `HttpApiClient` returns. Resource configuration is
typed against those decoded keys, so obvious mistakes in `primaryKey`,
`list.columns`, and `fields` are caught by TypeScript.

The public React contract for the 0.1.x line is intentionally small:

```tsx
<EffectAdmin
  api={AppApi}
  resources={resources}
  basePath="/admin"
  pageSize={50}
  baseUrl=""
  makeClient={makeEffect3AdminClient}
  clientOptions={{
    headers: () => ({ authorization: `Bearer ${token}` }),
    fetchOptions: { credentials: "include" }
  }}
  components={{
    Layout: MyLayout,
    TextInput: MyTextInput,
    DataTable: MyDataTable
  }}
/>
```

Use `api` with the adapter for your Effect version. Import
`makeEffect3AdminClient` from `@effect-admin/react/effect3`; with Effect 4,
pass `makeEffect4AdminClient` from `@effect-admin/effect4`. Use `client` only when the host
application needs a completely custom transport/runtime. Use `components` to
replace default UI slots without forking the admin behavior.

## React setup

```tsx
import { EffectAdmin } from "@effect-admin/react"
import { makeEffect3AdminClient } from "@effect-admin/react/effect3"
import "@effect-admin/react/styles.css"
import { AppApi, resources } from "./admin"

export function AdminApp() {
  return (
    <EffectAdmin
      api={AppApi}
      resources={resources}
      basePath="/admin"
      makeClient={makeEffect3AdminClient}
    />
  )
}
```

`EffectAdmin` creates a fetch-based typed client from the `HttpApi`.
Applications that only need request headers can keep the generated client and
pass `clientOptions`:

```tsx
const clientOptions = useMemo(() => ({
  headers: () => ({ "x-admin-role": currentRole }),
  fetchOptions: { credentials: "include" }
}), [currentRole])

<EffectAdmin
  api={AppApi}
  resources={resources}
  basePath="/admin"
  clientOptions={clientOptions}
  makeClient={makeEffect3AdminClient}
/>
```

For custom middleware, runtime wiring, or a different transport adapter, pass
`client` instead.

Use `clientOptions.fetchOptions` for cookie-backed sessions or other fetch
runtime options. Use `clientOptions.transformClient` only when you need lower
level Effect `HttpClient` middleware.

### Next.js

Mount it in a catch-all Client Component so deep links survive refreshes:

```tsx
// app/admin/[[...path]]/page.tsx
"use client"

import { EffectAdmin } from "@effect-admin/react"
import { makeEffect3AdminClient } from "@effect-admin/react/effect3"
import "@effect-admin/react/styles.css"

export default function AdminPage() {
  return <EffectAdmin api={AppApi} resources={resources} basePath="/admin" makeClient={makeEffect3AdminClient} />
}
```

The small internal router owns URLs below `basePath`; it has no dependency on
Next Router, React Router, or TanStack Router. Generated links are encoded and
`basePath` is normalized, so `/admin/`, `/admin`, and encoded record ids behave
consistently.

## Minimal core, custom shell

Every slot has a default. Override only the pieces your application owns:

```tsx
<EffectAdmin
  api={AppApi}
  resources={resources}
  makeClient={makeEffect3AdminClient}
  components={{
    Layout: MyLayout,
    TextInput: MyTextInput,
    DataTable: MyDataTable
  }}
/>
```

The default theme uses Radix primitives where behavior matters and plain CSS
variables for visual customization. React and React DOM are peer dependencies.

This keeps the library useful in two modes:

- plug-and-play internal admin with the default shell;
- product-integrated admin where your app replaces layout, inputs, or table
  rendering while keeping the Effect/HttpApi wiring.

## Model annotations

Effect Schema and `@effect/sql` `Model.Class` provide field shapes but do not
encode how an admin should display a foreign key. Keep relationship metadata
minimal and presentation-oriented:

```ts
authorId: Schema.Int.annotations({
  title: "Author",
  [AdminField]: { ref: "users", displayField: "email" }
})
```

Supported annotation flags are `auto`, `ref`, `displayField`, `hidden`,
`readOnly`, and `sensitive`.

Think of `ref` / `displayField` as **relation display metadata**, not as a
second domain model. The model still owns the foreign-key field; effect-admin
only needs to know which target resource to search and which field to show.

Presentation-only choices belong in the resource:

```ts
defineAdminResource({
  model: Post,
  apiGroup: PostsApi,
  fields: {
    body: { widget: "textarea" },
    internalNote: { hidden: true }
  }
})
```

An array of annotated IDs becomes a minimal multiple-relation control:

```ts
tagIds: Schema.Array(Schema.Int).annotations({
  [AdminField]: { ref: "tags", displayField: "name" }
})
```

## Custom actions

Register a record endpoint and effect-admin derives its payload form from the
endpoint payload Schema. Payload-free actions can run directly; either kind can
request confirmation.

```ts
defineAdminResource({
  model: User,
  apiGroup: UsersApi,
  actions: {
    suspend: {
      endpoint: "suspend",
      label: "Suspend",
      confirm: "Suspend this user?"
    }
  }
})
```

With generated CRUD, extend the generated group for custom business operations:

```ts
defineCrudResource({
  name: "users",
  model: User,
  extendApiGroup: (apiGroup) => apiGroup.add(SuspendUserEndpoint),
  actions: {
    suspend: { endpoint: "suspend", label: "Suspend" }
  }
})
```

## Capabilities

The backend must enforce authorization. A capability map only keeps the UI
from offering controls the current user cannot use. It is not a security
boundary.

Pass a static map when it is already known, or load it from the host
application/session before controls are shown:

```tsx
import { AdminCapabilities } from "@effect-admin/contracts"
import * as Schema from "effect/Schema"

<EffectAdmin
  api={AppApi}
  resources={resources}
  makeClient={makeEffect3AdminClient}
  loadCapabilities={async () => {
    const response = await fetch("/api/admin/capabilities")
    return Schema.decodeUnknownPromise(AdminCapabilities)(await response.json())
  }}
/>
```

The shape is exported as both a TypeScript type and an Effect Schema:
`AdminCapabilities`.

## Typed validation

Endpoints may return `AdminValidationError`. The default form places its
`fields` messages beside the matching controls. Other failures receive a safe
generic state.

## Production readiness checklist

effect-admin is designed for internal admin and backoffice applications. Before
using it in production:

- enforce authentication and authorization in every backend handler; UI
  capabilities are only a convenience;
- serve `AdminCapabilities` from the current user/session, then pass it with
  `loadCapabilities` or `capabilities`;
- keep admin endpoints behind the same CSRF/CORS/session protections as the
  rest of the application;
- mark generated, read-only, hidden, and sensitive fields with `AdminField`
  annotations so derived create/update payloads do not accept them;
- implement list `search`, pagination, and sorting on relation targets, because
  relation controls search through the target resource's `list` endpoint;
- return `AdminValidationError` for field-level validation and 401/403 for
  authorization failures;
- run `validateAdminResources(resources)` in custom setups if you do not mount
  `<EffectAdmin />` directly; the React entrypoint already validates duplicate
  resource names and broken relation metadata.

## What is intentionally useless here

These are tempting, but they would make the library worse for V1:

- automatic database adapters: they hide business rules and authorization in
  the wrong place;
- a generic admin-design-system project: host apps should be able to bring
  their own shell and components;
- framework-specific routing wrappers: the same component should work in Vite,
  Next.js, and other React hosts through `basePath`;
- deep workflow builders: domain workflows should stay as explicit `HttpApi`
  endpoints and optional admin actions.

## Non-goals

The small interface is deliberate. effect-admin should not become:

- a database adapter or ORM layer;
- an authentication/authorization system;
- a framework-specific router wrapper;
- a design system;
- a replacement for domain-specific admin workflows.

Custom workflows belong as host-owned `HttpApi` endpoints and admin actions.
Persistence, auth, audit logging, tenancy, and business rules stay in the host
application.

## Run the example

```bash
pnpm install
pnpm dev
# http://localhost:3000/admin
```

Verification:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Release workflow:

```bash
pnpm changeset
pnpm version-packages
pnpm release
```

First public feedback release:

```bash
pnpm pack:all
pnpm release:alpha
```

`release:alpha` publishes with the npm `alpha` dist-tag. Keep using that tag
until the API has survived real usage in another Effect application. The
packages are independent community packages; they are not official Effect
packages unless the Effect maintainers explicitly adopt them.

`0.1.6` is published as both `latest` and `alpha`. The `alpha` tag remains
available for smoke-test installations while the pre-1 API is still evolving.

If npm returns `E403` with “Two-factor authentication ... is required”, publish
with a fresh one-time password from your authenticator app:

```bash
pnpm build
pnpm changeset publish --tag alpha --otp 123456
```

If your shell/package-manager wrapper still does not forward the OTP, pass it
through npm's config environment variable instead:

```bash
pnpm build
NPM_CONFIG_OTP=123456 pnpm changeset publish --tag alpha
```

For CI or automation, create a granular npm access token that can publish these
packages and has “bypass 2FA” enabled, then expose it as `NPM_TOKEN` in the
publishing environment.

CI runs install, typecheck, tests, and build on pushes to `main` and pull
requests.

The example registers users, posts, and tags. It exercises typed action
payloads and both single and multiple relation fields. The production Vite
build currently emits about 147 kB gzip for the initial JS entry; creation of
the default `HttpApiClient` is a separate lazy chunk of about 18 kB gzip.

## Community pitch

See [docs/effect-community-pitch.md](docs/effect-community-pitch.md) for the
short proposal intended for Effect community feedback.
