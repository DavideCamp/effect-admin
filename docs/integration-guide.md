# Integration guide

This guide is the intended 0.1.x path for adding effect-admin to an existing
Effect monorepo.

The library works best when your application already has:

- shared Effect Schema models;
- Effect Platform `HttpApi` contracts;
- a React or Next.js frontend that can import those contracts;
- backend handlers that already own authentication, authorization, validation,
  persistence, tenancy, and audit logging.

effect-admin generates an admin surface from that seam. It does not become your
database layer, auth framework, or permission system.

## Install

Install contract/core packages where your shared models and `HttpApi` contracts
live:

```bash
pnpm --filter @your-org/app-contract add \
  @effect-admin/core@0.1.5 \
  @effect-admin/contracts@0.1.4 \
  @effect-admin/annotations@0.1.1 \
  effect@^3.21.4 \
  @effect/platform@^0.96.2
```

Install the React package in the frontend application:

```bash
pnpm --filter @your-org/web add \
  @effect-admin/react@0.1.6 \
  effect@^3.21.4 \
  @effect/platform@^0.96.2 \
  react \
  react-dom
```

Use exact package versions while the API is alpha. The `alpha` dist-tag is fine
for experiments, but exact versions make real app upgrades easier to review.

Current alpha packages can also be installed with:

```bash
pnpm add @effect-admin/react@alpha @effect-admin/core@alpha @effect-admin/contracts@alpha
```

## Recommended monorepo shape

```txt
packages/app-contract/
  src/admin.ts          # models, resources, AppApi

apps/api/
  src/server.ts         # HttpApiBuilder handlers, auth, repositories

apps/web/
  src/AdminApp.tsx      # EffectAdmin mount
```

The contract package is the important seam: both server and frontend can import
it without importing server implementation code.

## Define resources from models

```ts
// packages/app-contract/src/admin.ts
import { AdminField } from "@effect-admin/annotations"
import { defineCrudResource, makeAdminApi } from "@effect-admin/core"
import * as Schema from "effect/Schema"

export const User = Schema.Struct({
  id: Schema.Int.annotations({
    title: "ID",
    [AdminField]: { auto: true, readOnly: true }
  }),
  email: Schema.String.annotations({ title: "Email" }),
  fullName: Schema.String.annotations({ title: "Full name" }),
  active: Schema.Boolean.annotations({ title: "Active" })
})

export const users = defineCrudResource({
  name: "users",
  model: User,
  list: { columns: ["id", "email", "fullName", "active"] }
})

export const resources = [users] as const
export const AppApi = makeAdminApi("app", resources, { prefix: "/api" })
```

`defineCrudResource` creates the conventional `HttpApiGroup` and derives create
/ update payloads from the model. Fields marked `auto`, `readOnly`, `hidden`,
or `sensitive` are omitted from the generated create payload.

Resource config uses decoded model keys. If the wire field is
`full_name` via `Schema.fromKey("full_name")`, the admin config key is
`fullName`. TypeScript checks `primaryKey`, `list.columns`, and `fields`
against those decoded keys.

If you explicitly map an operation to a non-conventional endpoint name, the
endpoint must exist. effect-admin fails at resource definition time instead of
silently hiding a misconfigured operation.

## Implement handlers in the host server

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

The repository is still yours. Put auth checks, tenant scoping, validation,
transactions, audit logging, and business invariants there or in surrounding
middleware/layers.

## Mount in Vite or another React app

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

The internal router owns URLs below `basePath`, so the host app only needs to
route `/admin/*` to the React component.

## Mount in Next.js App Router

Use a Client Component catch-all route:

```tsx
// app/admin/[[...path]]/page.tsx
"use client"

import { EffectAdmin } from "@effect-admin/react"
import { makeEffect3AdminClient } from "@effect-admin/react/effect3"
import "@effect-admin/react/styles.css"
import { AppApi, resources } from "@your-org/app-contract/admin"

export default function AdminPage() {
  return <EffectAdmin api={AppApi} resources={resources} basePath="/admin" makeClient={makeEffect3AdminClient} />
}
```

If your Next.js app proxies API requests or injects session headers, pass a
custom `client` instead of `api`.

## Capabilities

Capabilities are UI metadata only. They hide controls the current user should
not see, but every backend handler must still enforce authorization.

Serve capabilities from the current session:

```ts
import { AdminCapabilities } from "@effect-admin/contracts"
import * as HttpApiEndpoint from "@effect/platform/HttpApiEndpoint"
import * as HttpApiGroup from "@effect/platform/HttpApiGroup"

export const AdminMetaApi = HttpApiGroup.make("admin")
  .add(
    HttpApiEndpoint.get("capabilities", "/admin/capabilities")
      .addSuccess(AdminCapabilities)
  )
```

Load and validate them in the frontend:

```tsx
import { AdminCapabilities } from "@effect-admin/contracts"
import { EffectAdmin } from "@effect-admin/react"
import { makeEffect3AdminClient } from "@effect-admin/react/effect3"
import * as Schema from "effect/Schema"

const loadCapabilities = async () => {
  const response = await fetch("/api/admin/capabilities")
  if (!response.ok) throw new Error("Unable to load admin capabilities.")
  return Schema.decodeUnknownPromise(AdminCapabilities)(await response.json())
}

<EffectAdmin
  api={AppApi}
  resources={resources}
  basePath="/admin"
  loadCapabilities={loadCapabilities}
  makeClient={makeEffect3AdminClient}
/>
```

## Generated client options for auth, cookies, tenant headers, or tracing

The Effect 3 adapter creates a fetch-based `HttpApiClient` when you pass `api`
and `makeClient={makeEffect3AdminClient}`. For simple production needs such as
session, tenant, role, CSRF, or tracing headers, pass `clientOptions`.

```tsx
const clientOptions = useMemo(() => ({
  headers: () => ({
    "x-admin-role": currentRole,
    "x-tenant-id": currentTenantId
  }),
  fetchOptions: { credentials: "include" }
}), [currentRole, currentTenantId])

<EffectAdmin
  api={AppApi}
  resources={resources}
  basePath="/admin"
  pageSize={50}
  clientOptions={clientOptions}
  makeClient={makeEffect3AdminClient}
/>
```

Header functions are evaluated when requests are sent, so they can read current
session state as long as the closure is kept up to date by the host app.
Memoize the `clientOptions` object when its values depend on React state, so
the generated client is recreated only when those values actually change.
`fetchOptions` is passed to the underlying fetch client; use it for
cookie-backed sessions, for example `{ credentials: "include" }`.

If the backend expects typed headers in handlers, declare them on the resource
contract:

```ts
const AdminHeaders = Schema.Struct({
  "x-admin-role": Schema.Literal("admin", "staff", "viewer")
})

export const users = defineCrudResource({
  name: "users",
  model: User,
  headers: AdminHeaders
})
```

The host server must still authorize every handler. Headers and capabilities
are inputs to your policy, not a replacement for it.

Recommended production policy:

- derive capabilities from the authenticated server-side session;
- send the same auth/session/tenant headers through `clientOptions.headers`;
- use capabilities only to hide UI controls;
- enforce the same policy again inside every `HttpApiBuilder` handler.

## Custom client escape hatch

For custom middleware, runtime wiring, or a different transport adapter, pass a
custom `client`.

The client is intentionally small: a resource map containing endpoint
functions. Each endpoint returns an `Effect`.

```tsx
import type { AdminClient, AdminListResult, AdminRecord } from "@effect-admin/react"
import * as Effect from "effect/Effect"

type ListRequest = {
  readonly urlParams: Readonly<Record<string, unknown>>
}

type PathRequest = {
  readonly path: { readonly id: string | number }
}

type PayloadRequest = {
  readonly payload: AdminRecord
}

type PathPayloadRequest = PathRequest & PayloadRequest

const encodeQuery = (params: Readonly<Record<string, unknown>>) => {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    query.set(key, typeof value === "string" ? value : JSON.stringify(value))
  }
  return query
}

const requestJson = <A,>(url: string, init?: RequestInit) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, {
        ...init,
        credentials: "include",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": "current-tenant",
          ...init?.headers
        }
      })
      if (!response.ok) throw response
      return await response.json() as A
    },
    catch: (error) => error
  })

export const adminClient = {
  users: {
    list: ({ urlParams }: ListRequest) => {
      const query = encodeQuery(urlParams)
      return requestJson<AdminListResult>(`/api/users?${query}`)
    },
    get: ({ path }: PathRequest) =>
      requestJson<AdminRecord>(`/api/users/${path.id}`),
    create: ({ payload }: PayloadRequest) =>
      requestJson<AdminRecord>("/api/users", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    update: ({ path, payload }: PathPayloadRequest) =>
      requestJson<AdminRecord>(`/api/users/${path.id}`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      }),
    delete: ({ path }: PathRequest) =>
      requestJson<void>(`/api/users/${path.id}`, { method: "DELETE" })
  }
} satisfies AdminClient

<EffectAdmin resources={resources} client={adminClient} basePath="/admin" />
```

In an Effect-native app you can also build this client from
`HttpApiClient.make` and provide your own `FetchHttpClient` layer or middleware.
The important part is that the UI depends only on `AdminClient`.

## Production checklist

Before exposing the admin in production:

- authenticate every admin request;
- authorize every handler server-side;
- scope list/get/update/delete by tenant/account when relevant;
- return `AdminValidationError` for field-level validation;
- serve capabilities from the session, not from hard-coded frontend state;
- protect admin endpoints with the same CSRF/CORS/session policy as the rest of
  the app;
- mark generated, read-only, hidden, and sensitive fields with `AdminField`;
- keep audit logging and business invariants in host code.
- smoke test the published npm package in one external app before promoting the
  npm `latest` dist-tag.

## Effect 4 beta

The Effect 3 packages target `effect@^3.21.4` and `@effect/platform` HttpApi.
For Effect 4 beta, use `@effect-admin/effect4` and pass
`makeClient={makeEffect4AdminClient}` to `EffectAdmin`. The adapter targets
`effect@>=4.0.0-beta.98 <5` and owns the unstable HttpApi compatibility layer.
