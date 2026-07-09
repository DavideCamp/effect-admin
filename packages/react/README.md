# @effect-admin/react

The plug-and-play React UI for effect-admin.

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
