# Signup Form Redesign

**Date:** 2026-06-09
**Status:** Approved

## Overview

Remove email from the signup flow. Replace it with first name and last name fields. Move the legal/privacy disclaimer from the always-visible login card footer to the signup screen only.

## Scope

This covers the signup form, the auth call chain (frontend to worker), and the DB schema. It does not include displaying first/last name anywhere in the current UI - that is deferred to a future profile screen.

## Changes

### src/components/LoginGate.jsx

- Add `firstName` and `lastName` state variables.
- Remove `email` state variable.
- Signup form: replace the single `Email` field with two `Field` components: `First name` and `Last name`.
- `submitDisabled`: signup condition changes from `(!username || !email || !password)` to `(!username || !firstName || !lastName || !password)`.
- Legal/privacy block: currently renders unconditionally at the bottom of the card. Wrap it in `{mode === "signup" && (...)}` so it only appears on the signup screen.
- Pass `firstName` and `lastName` (instead of `email`) to the `signup` call.

### src/lib/auth.jsx

- `signup` callback: signature changes from `(username, email, password)` to `(username, firstName, lastName, password)`.
- Forward all four args to `api.signup`.

### src/lib/api.js

- `signup`: send `{ username, firstName, lastName, password }` instead of `{ username, email, password }`.

### worker/auth.js

- Remove `email` read from request body.
- Remove `EMAIL_RE` constant and the email validation check (`if (!email || !EMAIL_RE.test(email))`).
- Read `firstName` and `lastName` from body. Trim both.
- Add basic presence validation: if either is empty after trim, return `error(400, "first and last name required")`. Cap both at 50 characters to prevent abuse.
- DB insert: drop the `email` column, add `first_name` and `last_name` columns.

### schema.sql

- Add `first_name TEXT` and `last_name TEXT` columns to the `users` table definition.
- Keep `email TEXT` as nullable (existing users have values there).

### migrations/002_first_last_name.sql (new file)

```sql
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
```

This migration must be applied to the remote D1 database before the updated worker is deployed.

## Out of Scope

- Displaying first/last name in the admin panel, auth footer, or any other current screen.
- Removing the `email` column from the DB (kept for existing users).
- Password reset flow (unchanged - admin still generates links manually).
