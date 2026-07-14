# External smoke test checklist

Use this before promoting an alpha to `latest`.

## 1. Install from npm alpha

In a real app outside this repository:

```bash
pnpm add @effect-admin/react@alpha @effect-admin/core@alpha @effect-admin/contracts@alpha
```

Pin exact versions after the first successful install if you want repeatable
debugging:

```bash
pnpm add @effect-admin/react@0.1.4 @effect-admin/core@0.1.4 @effect-admin/contracts@0.1.4
```

## 2. Minimal mount

Mount the admin with the generated client:

```tsx
<EffectAdmin
  api={AppApi}
  resources={resources}
  basePath="/admin"
/>
```

Expected:

- `/admin` renders the resource list;
- `/admin/<resource>` renders a list request;
- browser refresh on a deep admin URL still works through the host app route.

## 3. Auth/session headers

Add the production auth mechanism:

```tsx
<EffectAdmin
  api={AppApi}
  resources={resources}
  clientOptions={{
    headers: () => ({ authorization: `Bearer ${token}` }),
    fetchOptions: { credentials: "include" }
  }}
/>
```

Expected:

- backend handlers receive the headers declared in the `HttpApi` contract;
- unauthenticated requests return 401/403;
- the UI shows a dedicated auth/forbidden state;
- the backend still enforces authorization even if UI capabilities are changed.

## 4. CRUD workflow

For one resource with real persistence:

- list with pagination;
- search/filter if implemented by the host repository;
- open detail;
- create;
- update;
- delete or confirm delete is hidden by capabilities;
- reload the page after each operation.

## 5. Data-shape edge cases

Verify:

- decoded keys are used in config (`fullName`, not `full_name`);
- generated/read-only/sensitive fields are omitted from create/update forms;
- nullable fields round-trip correctly;
- primary key values are present in list rows;
- relation fields load through the target resource `list` endpoint.

## 6. Release gate

Only promote `latest` when:

- external install works without workspace aliases;
- the host app builds production assets;
- the smoke workflow above passes;
- no package requires unpublished local code.
