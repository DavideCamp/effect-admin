# @effect-admin/effect4

Effect 4 beta integration for effect-admin. It uses `effect/unstable/httpapi`
and keeps the React renderer behind the same resource/client interface used by
the Effect 3 packages.

```sh
pnpm add @effect-admin/effect4@alpha @effect-admin/react@alpha effect@beta react react-dom
```

```tsx
import { Schema } from "effect"
import { defineCrudResource, makeAdminApi, makeEffect4AdminClient } from "@effect-admin/effect4"
import { EffectAdmin } from "@effect-admin/react"

const User = Schema.Struct({ id: Schema.Number, email: Schema.String })
const users = defineCrudResource({ name: "users", model: User })
const AppApi = makeAdminApi("app", [users], { prefix: "/api" })

export const Admin = () => (
  <EffectAdmin
    api={AppApi}
    resources={[users]}
    makeClient={makeEffect4AdminClient}
  />
)
```

Effect 4 is still beta. This package pins its tested minimum beta and may need
minor releases as `effect/unstable/httpapi` evolves.
