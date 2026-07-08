# effect-admin

**A plug-and-play React admin derived from Effect models and `HttpApi`.**

Register a model with an `HttpApiGroup`, mount `<EffectAdmin />`, and get a
clean resource UI: list, search, filters, sorting, pagination, detail, create,
update, delete, relations, typed errors, custom actions, and capability-aware
controls.

The host application owns persistence, business rules, authentication, and
authorization. effect-admin calls the same typed API as any other client; it
does not write directly to your database or create an identity system.

## Status

V1 vertical slice. The API is not published or semver-stable yet.

## Packages

| Package | Purpose |
| --- | --- |
| `@effect-admin/annotations` | Minimal schema annotation symbol |
| `@effect-admin/contracts` | Standard list and typed error contracts |
| `@effect-admin/core` | Decoded Schema AST → field metadata and resources |
| `@effect-admin/react` | React application, default components and CSS |
| `@effect-admin/example` | Runnable Vite frontend + host-owned `HttpApi` server |
| `@effect-admin/next-example` | Build fixture for Next.js App Router consumption |

## The V1 contract

Each registered `HttpApiGroup` may expose conventional endpoints named:

- `list` — accepts `AdminListParams`, returns `{ rows, total }`
- `get` — accepts `{ path: { id } }`, returns one model
- `create` — accepts `{ payload }`, returns the created model
- `update` — accepts `{ path: { id }, payload }`, returns the model
- `delete` — accepts `{ path: { id } }`

Missing endpoints remove that operation from the UI. Nonstandard endpoint
names can be mapped explicitly.

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
that is what the decoded `HttpApiClient` returns.

## React setup

```tsx
import { EffectAdmin } from "@effect-admin/react"
import "@effect-admin/react/styles.css"
import { AppApi } from "./contracts"
import { resources } from "./admin"

export function AdminApp() {
  return (
    <EffectAdmin
      api={AppApi}
      resources={resources}
      basePath="/admin"
    />
  )
}
```

`EffectAdmin` creates a fetch-based typed client. Applications with custom
headers, middleware requirements, or runtime wiring can pass `client` instead.

### Next.js

Mount it in a catch-all Client Component so deep links survive refreshes:

```tsx
// app/admin/[[...path]]/page.tsx
"use client"

import { EffectAdmin } from "@effect-admin/react"
import "@effect-admin/react/styles.css"

export default function AdminPage() {
  return <EffectAdmin api={AppApi} resources={resources} basePath="/admin" />
}
```

The small internal router owns URLs below `basePath`; it has no dependency on
Next Router, React Router, or TanStack Router.

## Component overrides

Every slot has a default. Override only the pieces your application owns:

```tsx
<EffectAdmin
  api={AppApi}
  resources={resources}
  components={{
    Layout: MyLayout,
    TextInput: MyTextInput,
    DataTable: MyDataTable
  }}
/>
```

The default theme uses Radix primitives where behavior matters and plain CSS
variables for visual customization. React and React DOM are peer dependencies.

## Model annotations

Effect Schema and `@effect/sql` `Model.Class` provide field shapes but do not
encode foreign-key lookup semantics. Keep relationship metadata minimal:

```ts
authorId: Schema.Int.annotations({
  title: "Author",
  [AdminField]: { ref: "users", displayField: "email" }
})
```

Supported annotation flags are `auto`, `ref`, `displayField`, `hidden`,
`readOnly`, and `sensitive`. Presentation-only choices belong in the resource:

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

## Capabilities

The backend must enforce authorization. A capability map only keeps the UI
from offering controls the current user cannot use:

```tsx
<EffectAdmin
  api={AppApi}
  resources={resources}
  capabilities={{
    users: {
      create: false,
      delete: false,
      actions: { suspend: true }
    }
  }}
/>
```

## Typed validation

Endpoints may return `AdminValidationError`. The default form places its
`fields` messages beside the matching controls. Other failures receive a safe
generic state.

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

The example registers users, posts, and tags. It exercises typed action
payloads and both single and multiple relation fields. The production Vite
build currently emits about 147 kB gzip for the initial JS entry; creation of
the default `HttpApiClient` is a separate lazy chunk of about 18 kB gzip.
