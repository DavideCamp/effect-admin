# Product and architecture

## Product definition

effect-admin is an embeddable React admin for applications whose public
contracts use Effect models/Schemas and `HttpApi`.

It is deliberately not an ORM, generic REST adapter, generated source tree,
database editor, authentication server, or analytics dashboard.

## Decisions

1. `HttpApi` only in V1. Strong conventions beat a universal data-provider
   abstraction.
2. Runtime React components, not generated files.
3. Embeddable first; a standalone app is just a React app with EffectAdmin at
   its root.
4. Decoded model keys drive frontend metadata.
5. Conventional CRUD endpoint names with explicit overrides.
6. Host code owns handlers, persistence, invariants, auth, and authorization.
7. Capability maps affect visibility only; the server remains authoritative.
8. Semantic annotations live on models; presentation overrides live on admin
   resources.
9. Minimal string relation annotations avoid circular imports.
10. Framework-neutral History API routing below a configurable base path.
11. Radix behavior primitives, library-owned CSS variables, replaceable slots.
12. Resource workflows only in V1; metrics and charts require explicit custom
    pages later.

## Dependency direction

```text
host contracts (models + HttpApi groups)
             │
             ▼
       effect-admin/core
             │
             ▼
      effect-admin/react ───► typed HttpApiClient ───► host handlers
```

No library package imports the host server implementation.

## Security boundary

Hiding a button is not authorization. Every host endpoint must authenticate,
authorize, validate, and audit according to the application's own policy.
effect-admin displays typed failures but never replaces those controls.
