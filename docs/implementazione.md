# Implementation snapshot

The current code is a V1 vertical slice of the React + `HttpApi` architecture.

- `annotations`: stable `AdminField` symbol and semantic metadata.
- `contracts`: shared list/filter/result and typed error schemas.
- `core`: decoded AST introspection and resource/operation validation.
- `react`: typed client creation, internal routing, screens, default slots,
  Radix delete dialog, and library CSS.
- `example`: users/posts/tags contracts, host-owned handlers, and a Vite client.
- `next-example`: an App Router build fixture that consumes the built packages.

The previous SQL adapter, repository abstraction, generated server routes, and
vanilla-JS interface were intentionally removed. Git history contains that
prototype; keeping compatibility would obscure the new product boundary.

Custom action payload forms and relation controls are derived from the same
decoded endpoint/model schemas. The default fetch client is lazy-loaded to keep
the initial React entry smaller. Remaining post-V1 limits are tracked in
`roadmap.md`.
