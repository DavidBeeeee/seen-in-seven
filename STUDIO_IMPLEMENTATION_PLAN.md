# Colorado Mastermind Studio Implementation Plan

## First Release

Studio becomes the front door at `studio.coloradomastermind.com`. SeenInSeven remains the only app and continues to run from its existing code at `/seeninseven`.

This release does not connect Systeme, enforce paid access inside the SeenInSeven beta, rewrite SeenInSeven, or change its AI prompts.

## Access Model

Studio separates three ideas:

1. A person can have a Studio login.
2. A person can have access to a particular Studio app.
3. An app can continue to support a temporary beta or local-device path.

The first app key is `seeninseven`. Existing SeenInSeven profiles receive `beta` access. Future Systeme purchases can write `systeme` access without changing the dashboard.

## Routes

- `/` is the Colorado Mastermind Studio dashboard.
- `/seeninseven` is the existing SeenInSeven app.
- `/admin` is the Studio-wide customer and app access control room.
- `/admin/seeninseven` is the detailed SeenInSeven progress and support command center.
- `/admin.html` remains a working direct link to the Studio-wide admin for old bookmarks.
- `/api/generate` remains the SeenInSeven AI endpoint.

## Admin Model

The Studio admin owns the customer directory and app access. Each connected app keeps its own detailed admin area for app-specific progress, content, errors, and support context.

The current app registry contains:

- `seeninseven`: connected, grantable, and linked to `/admin/seeninseven`.
- `boardroom`: reserved as the next app, but not grantable until the Boardroom itself is connected.

This means a future Boardroom customer can have a Studio account and Boardroom access without receiving SeenInSeven access.

## Release Sequence

1. Build and test on the `feature/studio-hub` branch.
2. Apply the additive Studio entitlement migration.
3. Deploy a Vercel preview and add its redirect URL in Supabase if magic-link testing requires it.
4. Test anonymous, local beta, unlocked beta, locked account, password, magic link, logout, both themes, desktop, and mobile.
5. Merge only after the preview passes.
6. Verify the production root, SeenInSeven route, admin page, API, and existing saved account.

## Rollback

The code release can be rolled back in Vercel without removing any user data. The new database table is additive and does not alter existing users, scripts, onboarding, progress, points, or logs. If Studio is rolled back, SeenInSeven can immediately return to the root route while the entitlement records remain dormant.
