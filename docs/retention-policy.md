# Data Retention Policy

This document describes how long Therabridge keeps different categories of
user data and how deletion works. It is a living document; update it whenever
retention behavior changes.

## Retention periods

| Data | Retention | Notes |
| --- | --- | --- |
| User profile + chat/exercise history | Until account deletion | Self-service or admin deletion removes the account and its data (see below). |
| Crisis alerts (`crises`) | 6 months after last activity | After 6 months the identity is nulled out and the record is kept as an anonymous trend/audit marker. |
| Crisis logs (`crisislogs`) | 6 months after detection | See above. |
| Audit logs (`auditlogs`) | 6 months after event | Kept as an accountable trail for privacy-sensitive access. |
| Notifications | Until account deletion | Deletable individually by the user at any time. |
| MongoDB Atlas snapshots | Per Atlas backup schedule | Cloud backups may retain older copies; restore timeframes follow the Atlas backup window. |
| Legal hold | Indefinite (only when required) | If an active legal/regulatory hold applies to a user or record, retention overrides the automatic deletion rules for that scope. |

Identity-nulling on expiration means the stored record loses the `user` /
`actor` / `target` references (set to `null`) while aggregate/analytics value
is preserved. Scheduled purge is **not** yet automated; run it as an ops task
(see the audit/crisis-log collections) or via the admin tooling once available.

## What account deletion removes

Deleting an account (self-service `DELETE /api/users/profile` or admin
`DELETE /api/users/admin/user/:id`, both via `services/deletion.service.js`)
permanently removes:

- The `User` record and uploaded avatar file
- Direct messages involving the user (either side) and screenshot-notice rows
- Communities the user **owns** (deleted outright)
- The user's messages/memberships/moderator roles in communities they do not own
- Mood logs, crisis alerts, crisis logs, Therry chat history, notifications,
  exercise logs, and web-push subscriptions

Exceptions:

- **Audit logs are retained** but the user's identity is nulled from them, so
  the trail survives without pointing at the person.
- **Encrypted at-rest fields** (DM content, mood notes, crisis descriptions,
  Therry messages, notification previews, community messages) are destroyed
  with the rows; the encryption key is managed per environment (see
  `key-management.md`).

## Deletion requests and backups

Therabridge supports self-service account deletion (username-confirmed). There
is no separate "request" workflow; deletion is immediate and irreversible.
Backup snapshots held by the hosting database provider may contain a user's
data for the duration of the standard backup window; this is disclosed in the
privacy notice.

## Ops notes

- The crisis/audit collections should be pruned or identity-nulled on the
  cadence above. A scheduled job (or manual run) that nulls `user` on
  `crisislogs`/`crises` and `actor`/`target` on `auditlogs` older than the
  retention window is the recommended mechanism.
- Legal hold: maintain a blocklist of user/record identifiers that are exempt
  from automatic purge. Never auto-purge records under a legal hold.
