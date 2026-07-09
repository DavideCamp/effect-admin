# Changesets

Use changesets for every public package change:

```bash
pnpm changeset
pnpm version-packages
pnpm release:check
pnpm release:alpha
```

Examples are ignored because they are private fixtures. The publishable
packages are linked for V1 so they version together while the public interface
is still settling.

Use the npm `alpha` dist-tag until the API is ready to become the default
install target. The package `publishConfig` also sets `tag: "alpha"` as a
safety net, but keep the explicit `release:alpha` command in docs and muscle
memory.

Publish from the branch/commit you want the npm release tags to describe. After
publishing, verify both npm and git:

```bash
npm view @effect-admin/react dist-tags version
git log --oneline --decorate --max-count=5
```

If npm requires two-factor authentication during publish:

```bash
pnpm build
pnpm changeset publish --tag alpha --otp 123456
```

If the OTP still does not reach npm, use npm's config environment variable:

```bash
pnpm build
NPM_CONFIG_OTP=123456 pnpm changeset publish --tag alpha
```

For CI, use a granular npm token with publish permission and bypass 2FA enabled.
