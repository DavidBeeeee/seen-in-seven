# Momentum Hub test member

The dedicated test identity is `momentum-hub-test@ancientcosmic.com`. It is a non-admin account with only the `eee` Studio entitlement. Its password is stored in the macOS Keychain under service `workerbee-momentum-hub-test-password`; it is never committed or printed.

`scripts/ensure-momentum-hub-test-account.mjs` is the repeatable server-side provisioning path. It requires a Supabase secret or service-role key, the public key, and the test email and password. It creates or updates the Auth identity through the Auth Admin API, upserts the non-admin profile through the service role, writes the `eee` access grant with source `test:momentum-hub`, refreshes the entitlement, then signs in as the member and reads back `has_studio_app_access('eee')`.

This is deliberately not a client-side `is_paid` or `is_admin` write. Both stay false. Re-running the script after a database or environment reset recreates the same identity and entitlement without borrowing a customer account.

Example, with secrets supplied by the owning environment rather than pasted into the command:

```sh
MOMENTUM_HUB_TEST_EMAIL='momentum-hub-test@ancientcosmic.com' \
MOMENTUM_HUB_TEST_PASSWORD="$(security find-generic-password -a 'momentum-hub-test@ancientcosmic.com' -s 'workerbee-momentum-hub-test-password' -w)" \
SUPABASE_SECRET_KEY="$SUPABASE_SECRET_KEY" \
SUPABASE_PUBLISHABLE_KEY="$SUPABASE_PUBLISHABLE_KEY" \
node scripts/ensure-momentum-hub-test-account.mjs
```

Verified on 2026-09-20 against the live SeenInSeven Supabase project: password sign-in returned a session, the access RPC returned true, and a fresh headless Chrome session opened `/storysculpt` with the access gate hidden and the StorySculpt workspace visible for this email.
