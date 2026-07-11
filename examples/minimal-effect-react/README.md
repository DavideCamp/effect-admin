# Minimal Effect + React admin

This is the smallest intended integration shape for an existing Effect
monorepo: define a model, generate the conventional admin `HttpApi`, implement
host-owned handlers, then mount one React component.

This directory is a copy-paste template, not a workspace package. The published
packages are installed from npm with the `alpha` dist-tag.

```bash
pnpm install
pnpm dev
```

Important boundaries:

- effect-admin creates the contract and React admin shell;
- your server still owns persistence, authentication, authorization, tenancy,
  validation, and audit logging;
- `clientOptions.headers` is the normal path for session, tenant, CSRF, or
  tracing headers;
- capabilities only hide UI controls. Backend handlers must enforce the same
  policy.

Core files:

- `src/admin.ts` defines the model, resource, typed headers, capabilities, and
  `AppApi`;
- `src/server.ts` shows the handler shape and server-side authorization point;
- `src/AdminApp.tsx` mounts `<EffectAdmin />` with generated client options.
