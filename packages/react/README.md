# @effect-admin/react

The plug-and-play React UI for effect-admin.

```bash
pnpm add @effect-admin/react@0.1.1 effect@^3.21.4 @effect/platform@^0.96.2 react react-dom
```

It is designed for Effect monorepos where the server and frontend can share the
same `HttpApi` contract and resource definitions. Mount one component and let
the default admin shell handle the boring CRUD screens:

```tsx
import { EffectAdmin } from "@effect-admin/react"
import "@effect-admin/react/styles.css"

<EffectAdmin api={AppApi} resources={resources} basePath="/admin" />
```

The internal router is `basePath`-based and framework-neutral, so the same
component can be mounted in Vite, Next.js App Router, or another React host.

Pass `components` to replace only the pieces your application owns:

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

Pass `loadCapabilities` when the visible controls depend on the signed-in
user/session. Capabilities are a UI convenience only; the backend must still
enforce authorization in every handler.

If your host app needs custom headers, cookies, tracing, or a non-default
Effect runtime, pass a `client` and type it with the exported `AdminClient`.
The package also exports `AdminEndpoint`, `AdminRecord`, and `AdminListResult`
for lightweight custom adapters.

The `0.1.x` line targets Effect 3 `HttpApi`. Effect 4 beta
`effect/unstable/httpapi` will need a dedicated adapter/release.
