# @effect-admin/react

The plug-and-play React UI for effect-admin.

```bash
pnpm add @effect-admin/react@0.1.4 effect@^3.21.4 @effect/platform@^0.96.2 react react-dom
```

It is designed for Effect monorepos where the server and frontend can share the
same `HttpApi` contract and resource definitions. Mount one component and let
the default admin shell handle the boring CRUD screens:

```tsx
import { EffectAdmin } from "@effect-admin/react"
import { makeEffect3AdminClient } from "@effect-admin/react/effect3"
import "@effect-admin/react/styles.css"

<EffectAdmin
  api={AppApi}
  resources={resources}
  basePath="/admin"
  makeClient={makeEffect3AdminClient}
/>
```

The internal router is `basePath`-based and framework-neutral, so the same
component can be mounted in Vite, Next.js App Router, or another React host.
Generated links are encoded and `basePath` is normalized.

Pass `components` to replace only the pieces your application owns:

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

Pass `loadCapabilities` when the visible controls depend on the signed-in
user/session. Capabilities are a UI convenience only; the backend must still
enforce authorization in every handler.

Use `clientOptions` for simple generated-client customization such as session,
tenant, or role headers:

```tsx
const clientOptions = useMemo(() => ({
  headers: () => ({ "x-admin-role": currentRole }),
  fetchOptions: { credentials: "include" }
}), [currentRole])

<EffectAdmin
  api={AppApi}
  resources={resources}
  clientOptions={clientOptions}
  makeClient={makeEffect3AdminClient}
/>
```

If your host app needs custom middleware, runtime wiring, or a different
transport adapter, pass a `client` and type it with the exported `AdminClient`.
The package also exports `AdminEndpoint`, `AdminRecord`, and `AdminListResult`
for lightweight custom adapters.

The stable 0.1.x integration surface is intentionally small:

- `api` for generated Effect `HttpApiClient` usage;
- `resources` for the admin metadata produced by `@effect-admin/core`;
- `basePath` for framework-neutral routing;
- `pageSize` for generated list requests;
- `clientOptions` for headers and generated-client transforms;
- `clientOptions.fetchOptions` for cookie-backed sessions, e.g.
  `{ credentials: "include" }`;
- `makeClient` for a version-specific HttpApi client adapter;
- `client` for a complete custom transport;
- `components` for replacing the default layout, text input, or data table.

For Effect 3, import `makeEffect3AdminClient` from the isolated
`@effect-admin/react/effect3` entrypoint. For Effect 4 beta, install
`@effect-admin/effect4` and pass `makeClient={makeEffect4AdminClient}`. Keeping
the adapters in separate entrypoints prevents one Effect major from being
bundled into applications using the other.
