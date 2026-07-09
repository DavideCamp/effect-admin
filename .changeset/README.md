# Changesets

Use changesets for every public package change:

```bash
pnpm changeset
pnpm version-packages
pnpm release:alpha
```

Examples are ignored because they are private fixtures. The publishable
packages are linked for V1 so they version together while the public interface
is still settling.

Use the npm `alpha` dist-tag until the API is ready to become the default
install target.

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
