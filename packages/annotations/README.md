# @effect-admin/annotations

Zero-dependency semantic field annotations for effect-admin. Host models only
need this package to describe admin visibility and relation display metadata.

```bash
pnpm add @effect-admin/annotations@0.1.0
```

The annotations are intentionally small. They do not create a second domain
model; they only add the bits an admin UI cannot infer from a field type alone,
such as:

- generated/read-only/hidden/sensitive fields;
- which resource a foreign-key-like field should search;
- which target field should be shown as the option label.
