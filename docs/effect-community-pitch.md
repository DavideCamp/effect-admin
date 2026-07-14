# effect-admin pitch for the Effect community

## One-line pitch

effect-admin is a model-first React admin generated from Effect Schema and
`HttpApi`: a few-lines backoffice for Effect monorepos without owning
persistence, authorization, routing, or business logic.

## Why it fits Effect

Effect applications already describe their domain and transport contracts with
Schema and `HttpApi`. In a monorepo with a React or Next.js frontend, those
contracts are often already shareable. effect-admin uses that as the seam:

- models describe field shape and validation;
- `HttpApi` describes the operations the admin may call;
- the host application keeps repositories, transactions, auth, tenancy, audit
  logging, and business rules.

The library turns that existing contract into a usable admin UI instead of
asking each application to rebuild list screens, form rendering, validation
mapping, relation lookups, and capability-aware controls.

The intended positioning is **minimal by default, custom where the host
differs**. The default path should feel like:

```tsx
<EffectAdmin api={AppApi} resources={resources} makeClient={adapter} />
```

## Current V1 scope

- CRUD resources from `defineCrudResource({ name, model })`;
- lower-level `defineAdminResource` for hand-written or non-conventional
  `HttpApiGroup`s;
- React admin app with a framework-neutral `basePath` router;
- default components plus slot overrides;
- custom record actions from endpoint payload Schemas;
- relation controls through target resource `list` search;
- `AdminCapabilities` as an Effect Schema for session-derived UI permissions;
- server-side `makeCrudHandlers` to reduce conventional handler boilerplate
  without introducing a database adapter.

The first public package line is `@effect-admin/*@0.1.0`. It targets Effect 3
`HttpApi`; Effect 4 beta support should be treated as an explicit follow-up
adapter instead of an implicit promise.

## Explicit non-goals

effect-admin should not become:

- a database adapter or ORM layer;
- an authentication or authorization framework;
- a framework-specific router wrapper;
- a design system;
- a replacement for domain-specific workflows.

The point is a deep module behind a small interface, not a shallow wrapper over
every possible admin concern.

## V1 design stance

effect-admin should be a convention library first, not a generic admin
component catalogue. The value is strongest when an Effect application can
derive boring admin CRUD from its existing model/API contracts and still keep
escape hatches for the parts that are truly product-specific:

- custom components for the host shell;
- custom `HttpApi` groups when the convention does not fit;
- custom actions for domain workflows;
- custom clients for auth/session/middleware wiring.

Capabilities are intentionally UI metadata, not security. The backend must
enforce authentication, authorization, tenancy, audit logging, and business
invariants.

## What feedback would be useful

1. Is `Model + HttpApi + React` the right seam for the Effect ecosystem?
2. Is the `AdminCapabilities` Schema enough for V1, or should there also be a
   tiny helper for a conventional capabilities endpoint?
3. Is the current relation model — annotated foreign-key IDs plus target
   resource lookup — enough for V1?
4. Which Schema refinements should the form renderer support first?
5. Would the community prefer this as an independent package first, then
   potential ecosystem adoption, or an Effect org experiment from the start?

## Production stance

The V1 target is internal backoffice/admin surfaces. Production use is
reasonable when the host enforces auth in every handler, serves session-derived
capabilities, implements paginated/searchable list endpoints, and keeps audit
logging/business invariants outside the generated UI.

For public communication, position it as a small community package looking for
real monorepo feedback first, not as an official Effect package.
