# Therabridge - Backend

Express 5 + MongoDB API server for Therabridge, a mental wellness platform.

## Tech

- **Express 5** - HTTP framework
- **Mongoose 9** - MongoDB ODM
- **JWT** - Cookie-based auth: short-lived access token (`token`, 15 min) + rotating refresh token (`refreshToken`, 7 days, hashed `jti`s stored on the user for revocation)
- **Bcrypt** - Password hashing (10 rounds) with old-password rotation
- **Zod** - Request body validation (`utils/validation.js`)
- **Per-route JSON body limits** - each router mounts a route-tuned `express.json` limit (`middleware/jsonBody.js`); oversized bodies return `413 PAYLOAD_TOO_LARGE`
- **Google Apps Script** - Transactional emails (verification codes, password reset) via a GAS Web App; emails sent through Gmail server-side with no SMTP dependency
- **Multer** + **Sharp** - Profile picture upload + image optimization
- **Helmet**, **express-rate-limit**, **CORS** - Security
- **Pino** - Structured logging (`utils/logger.js`)
- **@google/generative-ai** - Therry chat model (`gemini-3.5-flash`)
- **Socket.io** - Real-time DMs, community messages, notifications, and possible-screenshot notices (JWT-authed handshake)
- **Web Push** (`web-push`, VAPID) - Device notifications for messages and activity
- **Node crypto** - AES-256-GCM field-level encryption for sensitive data at rest (`utils/crypto.js`)
- **Vitest** - Unit tests (`__tests__/`)

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Google Gemini API key (for the Therry AI companion)
- Google Apps Script Web App URL (for email delivery)

### Setup

```bash
npm install
cp .env.example .env   # fill in values
npm run dev            # nodemon server.js
npm test               # vitest run
npm run migrate:encrypt # backfill-encrypt existing plaintext fields (once, before shipping)
```

### Environment Variables

Copy `backend/.env.example` to `.env`:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5000) |
| `CLIENT_URL` | Prod | Allowed CORS origin (default: `http://localhost:5173`) |
| `MONGO_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | Secret for JWT signing (min 32 chars; `openssl rand -hex 32`) |
| `GOOGLE_SCRIPT_URL` | Prod | Google Apps Script Web App URL for email delivery |
| `GEMINI_API_KEY` | Prod | Google Gemini API key (Therry AI) |
| `FIELD_ENCRYPTION_KEY` | Prod | 32-byte hex key for AES-256-GCM field encryption |
| `VAPID_PUBLIC_KEY` | Prod | Web Push public key (`npm run vapid`) |
| `VAPID_PRIVATE_KEY` | Prod | Web Push private key |
| `VAPID_SUBJECT` | Prod | Contact for VAPID (e.g. `mailto:no-reply@therabridge.com`) |
| `CLOUDINARY_CLOUD_NAME` | Prod | Cloudinary cloud name for profile pictures |
| `CLOUDINARY_API_KEY` | Prod | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Prod | Cloudinary API secret |
| `NODE_ENV` | No | `development` or `production` |
| `LOG_LEVEL` | No | Pino log level (default: `info`) |

**Production:** the API runs at [therabridge-backend.onrender.com](https://therabridge-backend.onrender.com); the Vercel frontend proxies `/api` and `/socket.io` to it via the rewrites in `frontend/vercel.json`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Nodemon on `server.js` |
| `npm start` | Run `server.js` |
| `npm test` | Run Vitest suite |
| `npm run migrate:encrypt` | Encrypt existing plaintext records in place (idempotent) |

## API Routes

All endpoints below are mounted under `/api` and require the JWT cookie unless noted otherwise.

### Users - `/api/users`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/users/register` | Register new user |
| POST | `/users/login` | Login (email or username) |
| POST | `/users/logout` | Clear auth cookies + revoke refresh token |
| POST | `/users/refresh` | Rotate refresh token, issue new access token |
| POST | `/users/forgot-password` | Request reset email |
| POST | `/users/reset-password/:token` | Reset password |
| POST | `/users/verify-email` | Verify email with 6-digit code (30-min TTL) |
| POST | `/users/resend-verification` | Re-issue verification code (60-s cooldown) |
| GET | `/users/profile` | Get own profile |
| PUT | `/users/profile` | Update profile fields |
| DELETE | `/users/profile` | Delete account (cascades to all owned data) |
| GET | `/users/export` | Download all personal data as JSON (decrypted) |
| POST | `/users/ai-disclosure` | Acknowledge the AI companion disclosure |
| POST | `/users/change-password` | Change password |
| POST | `/users/upload-avatar` | Upload profile picture (multipart) |
| DELETE | `/users/avatar` | Remove profile picture |
| PUT | `/users/privacy` | Update per-field privacy settings |
| GET | `/users/users` | List users (admin) |
| GET | `/users/therapists` | List therapists |
| GET | `/users/users/:id` | Get user by id |
| PUT | `/users/admin/disable/:id` | Disable user (admin) |
| PUT | `/users/admin/role/:id` | Change role (admin) |
| DELETE | `/users/admin/user/:id` | Delete user (admin) |
| PUT | `/users/admin/therapist` | Assign a therapist to a user (admin) |
| GET | `/users/therapist/user/:id` | Full user data (therapist) |
| GET | `/users/therapist/clients` | List my clients (therapist) |
| POST | `/users/therapist/clients` | Add a client to my roster (therapist) |
| GET | `/users/:username` | Public profile |

### Chat - `/api/chat`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/chat/conversations` | List DM conversations |
| GET | `/chat/conversation/:userId` | Get DM thread |
| PUT | `/chat/conversation/:userId/read` | Mark DM thread read |
| GET | `/chat/conversation/:userId/updates` | Long-poll DM updates |
| POST | `/chat/send` | Send DM (spam-filtered) |
| GET | `/chat/search` | Search users by query |
| GET | `/chat/settings` | Get chat settings |
| PUT | `/chat/settings` | Update chat settings |
| PUT | `/chat/edit/:messageId` | Edit message |
| DELETE | `/chat/unsend/:messageId` | Unsend message |
| DELETE | `/chat/messages` | Delete all my DMs |
| POST | `/chat/screenshot-notice` | Possible-screenshot notice (rate-limited) |
| POST | `/chat/watermark-stamp` | Watermark stamp to PNG |
| POST | `/chat/communities` | Create community |
| POST | `/chat/communities/join` | Join by invite key |
| GET | `/chat/communities/by-key/:inviteKey` | Look up community by key |
| GET | `/chat/communities/:id` | Get community + messages |
| GET | `/chat/communities/:id/updates` | Long-poll community updates |
| PUT | `/chat/communities/:id` | Update community |
| POST | `/chat/communities/:id/messages` | Send community message |
| PUT | `/chat/communities/:id/messages/:msgId` | Edit community message |
| DELETE | `/chat/communities/:id/messages/:msgId` | Unsend community message |
| POST | `/chat/communities/:id/read` | Mark community messages read |
| POST | `/chat/communities/:id/members/remove` | Remove a member |
| DELETE | `/chat/communities/:id` | Delete community |
| DELETE | `/chat/community-messages` | Delete all my community messages |

### Exercises - `/api/exercises`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/exercises` | List all exercises (public) |
| GET | `/exercises/:id` | Get exercise |
| POST | `/exercises` | Create exercise (admin) |
| GET | `/exercises/logs/mine` | My exercise logs |
| GET | `/exercises/stats` | Exercise/login streak & score stats |
| POST | `/exercises/:id/start` | Start exercise |
| POST | `/exercises/:id/complete` | Complete exercise (awards points/streaks) |

### Mood - `/api/mood`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/mood` | Log mood entry |
| GET | `/mood` | Get my mood history |
| GET | `/mood/stats` | 30-day mood stats (incl. streak) |
| DELETE | `/mood/:id` | Delete a mood entry |

### Notifications - `/api/notifications`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications` | Get my notifications |
| GET | `/notifications/unread-count` | Unread count |
| PUT | `/notifications/:id/read` | Mark one read |
| PUT | `/notifications/read-all` | Mark all read |
| DELETE | `/notifications/:id` | Delete one |
| DELETE | `/notifications` | Delete all |

### Crisis - `/api/crisis`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/crisis` | Create crisis alert (severity escalation) |
| GET | `/crisis/mine` | Get my alerts |
| GET | `/crisis/active` | All active alerts (therapist/admin) |
| GET | `/crisis/hotlines` | Region-appropriate crisis hotlines |
| GET | `/crisis/logs` | Crisis escalation log (therapist/admin) |
| POST | `/crisis/logs/:logId/action` | Record follow-up action (therapist/admin) |
| POST | `/crisis/message-therapist` | Notify assigned therapist |
| PUT | `/crisis/:id/acknowledge` | Acknowledge alert |
| PUT | `/crisis/:id/resolve` | Resolve alert |

### Safety Plan - `/api/safety-plan`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/safety-plan` | Get my safety plan (decrypted) |
| PUT | `/safety-plan` | Create-or-replace my plan (7 sections) |
| GET | `/safety-plan/:userId` | Read-only client plan (therapist/admin) |

### Therry (AI Companion) - `/api/therry`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/therry/chat` | Send a message, get Therry's reply |
| GET | `/therry/messages` | Get my Therry history |
| PUT | `/therry/messages/:messageId` | Edit a Therry message |

### Journal - `/api/journal`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/journal` | Create journal entry |
| GET | `/journal` | My journal entries |
| GET | `/journal/public` | Public journal entries |
| GET | `/journal/:id` | Get journal entry |
| PUT | `/journal/:id` | Update journal entry |
| DELETE | `/journal/:id` | Delete journal entry |
| POST | `/journal/:id/comments` | Add comment |
| DELETE | `/journal/:id/comments/:commentId` | Delete comment |

### Thought Records (CBT) - `/api/thought-records`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/thought-records` | Create thought record (6-step guided CBT) |
| GET | `/thought-records` | My thought records |
| GET | `/thought-records/stats` | Distortion type stats |
| GET | `/thought-records/:id` | Get thought record |
| PUT | `/thought-records/:id` | Update thought record |
| DELETE | `/thought-records/:id` | Delete thought record |

### Clinical Assessments - `/api/assessments`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/assessments` | Take assessment (PHQ-9, GAD-7, PSS-10, K10) |
| GET | `/assessments` | My assessments |
| GET | `/assessments/trend` | 6-month score trend |
| GET | `/assessments/:id` | Get assessment |
| DELETE | `/assessments/:id` | Delete assessment |

### Gratitude Journaling - `/api/gratitude`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/gratitude/prompt` | Daily rotating prompt |
| POST | `/gratitude` | Create gratitude entry |
| GET | `/gratitude` | My gratitude entries |
| GET | `/gratitude/streak` | Current streak |
| DELETE | `/gratitude/:id` | Delete entry |

### Behavioral Activation - `/api/activities`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/activities` | Create activity |
| GET | `/activities` | My activities |
| GET | `/activities/stats` | Activity stats |
| GET | `/activities/:id` | Get activity |
| PUT | `/activities/:id` | Update activity |
| POST | `/activities/:id/complete` | Complete activity (mood before/after) |
| DELETE | `/activities/:id` | Delete activity |

### Coping Cards - `/api/coping-cards`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/coping-cards` | Create coping card |
| GET | `/coping-cards` | My cards (+ 18 pre-made templates) |
| PATCH | `/coping-cards/:id/favorite` | Toggle favorite |
| DELETE | `/coping-cards/:id` | Delete card |

### Psychoeducation - `/api/psychoed`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/psychoed` | List modules |
| GET | `/psychoed/progress` | My progress |
| GET | `/psychoed/:id` | Get module with steps |
| POST | `/psychoed/:id/start` | Start module |
| POST | `/psychoed/:id/complete-step` | Complete a step |

### Multi-Week Programs - `/api/programs`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/programs` | List programs |
| GET | `/programs/mine` | My enrolled programs |
| GET | `/programs/:id` | Get program with weeks/activities |
| POST | `/programs/:id/start` | Start program |
| POST | `/programs/:id/complete` | Complete activity in program |

### Sleep Tools - `/api/sleep`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sleep` | Log sleep quality |
| GET | `/sleep` | My sleep logs |
| GET | `/sleep/stats` | Sleep trend stats |
| GET | `/sleep/content` | Curated sleep content |
| DELETE | `/sleep/:id` | Delete sleep log |

### Medication Tracking - `/api/medications`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/medications` | Create medication |
| GET | `/medications` | My medications |
| GET | `/medications/logs` | My dose logs |
| GET | `/medications/stats` | Adherence stats |
| PUT | `/medications/:id` | Update medication |
| DELETE | `/medications/:id` | Delete medication |
| POST | `/medications/log` | Log a dose (with optional side effects) |

### Recommendations - `/api/recommendations`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/recommendations` | Personalized AI recommendations |

### Virtual Pet - `/api/pet`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/pet` | Get my pet |
| POST | `/pet/feed` | Feed pet |
| PUT | `/pet/rename` | Rename pet |
| GET | `/pet/adventures` | Get adventure log |
| POST | `/pet/activity` | Log activity (triggers pet events) |

### Audit - `/api/audit`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/audit` | Paginated privacy audit log (admin) |

### Admin - `/api/admin`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/dashboard` | Admin platform overview (KPIs, trends, feeds) |

### Therapist - `/api/therapist`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/therapist/clients/risk-summary` | Per-client check-in signals |

### Push - `/api/push`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/push/vapid-public-key` | Public VAPID key |
| POST | `/push/subscribe` | Register device push subscription |
| POST | `/push/unsubscribe` | Remove device push subscription |

### Misc

- `GET /health` - health check (server + DB status)
- `GET /` - API banner

## Auth

Protected routes require a valid access token (httpOnly `token` cookie or `Authorization: Bearer` header, 15-min expiry). When the access token expires, the client calls `/users/refresh` with the httpOnly `refreshToken` cookie (7-day expiry); the refresh token is rotated on every use and stored hashed (`sha256` of the `jti`) in `user.refreshTokens` so sessions can be revoked (logout, password change/reset). Both cookies use `secure: true` and `sameSite: "none"` in production. Rate limiting is applied globally (500 req/15min, with long-poll `*/updates` endpoints exempt) and on auth endpoints (50 req/15min). Idempotency keys are honored via the `Idempotency-Key` header.

## Email Verification

Every account starts unverified. Registration (`POST /api/users/register`) mints a **6-digit code** (`crypto.randomInt`, zero-padded, **30-minute TTL**), stores only its **SHA-256 hash** in `user.verificationCode` + `verificationCodeExpire`, and emails the plaintext via Google Apps Script. Sending is **best-effort** - a failure at registration is logged, not surfaced, so the account still works and the user can resend later.

- `POST /api/users/verify-email` (`{ code }`): validates `ALREADY_VERIFIED` / `NO_CODE` / `CODE_EXPIRED` / `INVALID_CODE` (400s), then sets `isAccountVerified = true` and clears the code fields.
- `POST /api/users/resend-verification`: replaces the stored code with a fresh one and re-emails it. Mounted under the auth rate limiter. On failure returns `502 { code: "EMAIL_FAILED" }` with a generic message in production. Response includes `resendCooldownSeconds: 60`.

### Email delivery (production)

`utils/nodemailer.js` sends emails via a **Google Apps Script Web App**. The function POSTs a JSON payload `{ to, subject, html }` to `process.env.GOOGLE_SCRIPT_URL` over HTTPS (port 443). The GAS web app calls `MailApp.sendEmail()` using the deployer's Gmail account, so no SMTP ports or custom domain are needed.

**Setup:** deploy the script from `google-apps-script.js` in the project root as a Google Apps Script Web App (Execute as: Me, Access: Anyone). Paste the resulting URL into the `GOOGLE_SCRIPT_URL` env var.

## Models

- **User** - firstName, lastName, username, email, password (+ `oldPasswords` rotation), role (`user`/`admin`/`therapist`), avatar, bio, chat settings (read receipts), per-field privacy settings, disabled flag, `isAccountVerified` + hashed 6-digit `verificationCode`/`verificationCodeExpire` (email verification), wellness score (exercises + Talking Points), login/exercise streaks & bests, last login/exercise dates, daily talking-points counter, `aiDisclosureAcknowledgedAt`, `countryCode`.
- **Message** (DM) - sender, recipient, `kind` (`message` | `screenshot-notice`), `noticeType`, content (<=2000, encrypted at rest), read/readAt, `deletedFor`, unsent, edited/editCount/editHistory.
- **Community** - name, owner, members, unique `inviteKey`, description, embedded messages (sender, content <=2000 - encrypted at rest, readBy, unsent, edit history).
- **Mood** - user, mood (`great`/`good`/`okay`/`bad`/`terrible`), note (encrypted at rest), factors, intensity (1-10), date.
- **Crisis** - user, alertType, `severity` (`mild`/`medium`/`severe`), description (encrypted at rest), source (`manual` | `therry`), status (`active`/`acknowledged`/`resolved`), acknowledgedBy, resolvedAt, resourcesShared.
- **CrisisLog** - chronicles every crisis event: user, source, category, therryMessageId, notified therapist/admins, hotlines shared, follow-up actions.
- **AuditLog** - actor, actorRole, action, target, detail, ip, userAgent.
- **SafetyPlan** - one per user: seven short lists (warningSigns, internalCoping, distractionPeople, distractionSettings, helpPeople, professionals, meansRestriction, reasonsForLiving), each item encrypted at rest.
- **Exercise** - title, description, duration (sec), type, steps, difficulty, color.
- **ExerciseLog** - user, exercise, startedAt, completedAt, timeSpent, completed.
- **Notification** - recipient, sender, type, title/body (encrypted at rest), data, read/readAt.
- **TherryMessage** - user, role (`user`/`assistant`), content (<=4000, encrypted at rest), category.
- **JournalEntry** - user, title, content (encrypted), mood, tags, comments, isPublic.
- **ThoughtRecord** - user, situation, automaticThought, emotions, distortionType, evidenceFor, evidenceAgainst, reframe, distressLevel, outcomeEmotion.
- **Assessment** - user, type (PHQ-9/GAD-7/PSS-10/K10), responses, score, severity, takenAt.
- **GratitudeEntry** - user, content (encrypted), promptText, date.
- **Activity** - user, title, category, expectedPleasure, actualPleasure, moodBefore, moodAfter, notes, completedAt.
- **PsychoedModule** - title, description, category, steps (title, content, duration).
- **PsychoedProgress** - user, module, startedAt, completedSteps, isCompleted.
- **CopingCard** - user, title, text (encrypted), category, isFavorite, isTemplate.
- **Program** - title, description, durationWeeks, weeks (activities with title, description, type, duration).
- **UserProgress** - user, program, startedAt, completedActivities, currentWeek, isCompleted.
- **SleepLog** - user, quality (1-5), notes (encrypted), dreams (encrypted), duration, date.
- **SleepContent** - title, description, type (sound/meditation/story), duration, url.
- **Medication** - user, name (encrypted), dosage (encrypted), frequency, notes (encrypted), isActive.
- **MedicationLog** - medication, user, takenAt, dosage, sideEffects, notes (encrypted).
- **Pet** - user, name, level, experience, mood, hunger, lastFed, accessories, adventureLog.

## Input Limits & Validation

All user-entered free-text is capped at both the API and the model layer so the database is never a vector for abuse, and the limits are enforced against **plaintext** (before/independent of encryption).

**Per-route body limits** (`middleware/jsonBody.js`, mounted in each router, there is no global JSON parser in `server.js`):

| Router | Body limit | Reason |
|--------|-----------|--------|
| `/api/chat` | `16kb` | DM/community messages <=2000 chars |
| `/api/therry` | `32kb` | Therry messages <=4000 chars |
| `/api/crisis` | `16kb` | Crisis descriptions <=1000 chars |
| `/api/exercises` | `16kb` | Exercise catalog create/update bodies |
| All other routers | `10kb` | Profile, mood, notification, and new feature payloads |

Oversized request bodies are rejected by Express before any handler runs and surface as `413 { error: { code: "PAYLOAD_TOO_LARGE" } }`.

**Character caps** (Zod `utils/validation.js` + Mongoose validators, must stay in sync with `frontend/src/lib/limits.ts`):

| Field | Cap |
|-------|-----|
| DM / community message content | 2000 |
| Therry user messages | 4000 |
| Crisis description | 1000 |
| Mood note | 500 |
| Mood factors | <=20 items, <=40 chars each |
| Community name / description / rules | 60 / 200 / 500 |
| User first/last name, username, email, password | 50 / 50 / 30 / 254 / 128 |
| Profile bio / avatar URL | 300 / 500 |
| Journal title / content | 200 / 5000 |
| Journal comment | 1000 |
| Thought record fields (situation, thoughts, evidence, reframe) | 500 each |
| Thought record emotions | 300 each |
| Gratitude entry / prompt text | 1000 / 200 |
| Activity title / notes | 100 / 500 |
| Coping card text | 300 |
| Medication name / dosage / notes | 100 / 50 / 200 |
| Medication log notes | 200 |
| Sleep log notes / dreams | 500 each |

Because message/mood/crisis fields are encrypted at rest, the Mongoose validators decrypt the envelope with `decryptFieldLength` (`utils/crypto.js`) before applying the cap, since the ciphertext envelope is always longer than the plaintext.

## Talking Points

Sending a DM or community message earns **+2 Wellness points**; messaging Therry earns **+5**. Points feed the same wellness score as completing exercises and are capped at **20/day** per user. Awarded points are returned as `pointsEarned` on the send/chat endpoints and surfaced as `talkingPointsToday` in `GET /api/exercises/stats`.

## Real-time (Socket.io)

The server exposes a Socket.io endpoint on the same port as the API (`sockets/chatSocket.js`). The client connects with the same JWT used for the API (via `auth.token` in the handshake, or the `token` cookie / `Authorization` header); unauthorized and disabled users are rejected.

**Rooms:** every authenticated socket joins `user:<id>`. Clients subscribe to `community:<id>` while viewing a community via the `join_community` / `leave_community` events.

**Server -> client events** (delivered to the `user:<id>` / `community:<id>` rooms):

| Event | Payload | Emitted when |
|-------|---------|--------------|
| `dm_message` | populated message | a DM is sent - to the recipient |
| `conversations_updated` | `{ partnerId }` | a DM is sent - to both parties |
| `dm_message_updated` | message | a DM is edited |
| `dm_message_unsent` | `{ messageId }` | a DM is unsent |
| `community_message` | `{ communityId, message }` | a community message is sent |
| `community_message_updated` / `community_message_unsent` | `{ communityId, message }` | edited / unsent |
| `notification` | notification doc | a notification is created |
| `possible_screenshot` | `{ conversationId }` | a peer reports a possible screenshot |

**Client -> server events:**

| Event | Payload | Purpose |
|-------|---------|---------|
| `join_community` / `leave_community` | `{ communityId }` | subscribe/unsubscribe to a community room |
| `possible_screenshot` | `{ conversationId }` | possible-screenshot notice |

## Device Notifications (Web Push)

The same events that create in-app notifications also trigger device notifications via the Web Push API (`services/push.service.js`).

- **Setup:** generate keys with `npm run vapid` and set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` in `.env`. Without them, pushes are skipped (logged).
- **Subscriptions:** the client registers via `POST /api/push/subscribe`. Logout unregisters the device.
- **Delivery:** `createNotification` sends the same title/body to the device with a type-based deep link (`data.url`).
- **Skip-while-online:** chat notifications are pushed with `skipIfOnline`. Stale subscriptions (HTTP 404/410) are pruned automatically.

## Privacy Shield

A "privacy shield" feature set that raises the bar and creates a paper trail for screenshots - it does **not** and cannot prevent someone from capturing content.

- **Socket.io** (`sockets/chatSocket.js`): the client connects with the same JWT used for the API. Every authenticated socket joins a `user:<id>` room.
- **Possible-screenshot notices**: when the client detects a screenshot attempt it emits `possible_screenshot` with `{ conversationId }`. The server rate-limits per user to **1 notice / 10 s**, persists a `Message` with `kind: "screenshot-notice"`, and pushes `possible_screenshot` to the peer in real time.
- **Server-side watermark stamp**: `POST /api/chat/watermark-stamp` renders text to a PNG with a tiled low-opacity watermark using Sharp.

**Honest limitation:** blur/blackout, notices, and watermarks discourage casual copying and leave an audit trail, but anyone determined to record content can still do so.

## Field-Level Encryption

Sensitive fields are encrypted at rest with **AES-256-GCM** (`utils/crypto.js`): DM and community message content (including edit history), mood notes, crisis descriptions, Therry messages, notification bodies, journal entries, thought records, gratitude entries, activity notes, coping card text, sleep log notes/dreams, and medication names/dosages/notes. Each value is stored as a base64url envelope `<iv>:<authTag>:<ciphertext>` with a fresh random 12-byte IV.

- **Key:** `FIELD_ENCRYPTION_KEY` (32-byte hex or raw 32-byte string). In production a missing key makes `encryptField` throw (fail-closed); in non-production it warns and stores plaintext.
- **Backfill:** run `npm run migrate:encrypt` (idempotent) **before** shipping.
- **API boundary:** controllers decrypt fields before returning them, so clients are unaffected. See `docs/key-management.md` for key handling and rotation notes.

## Data Privacy & Retention

- **Data export:** `GET /api/users/export` returns a decrypted JSON dump of everything the platform holds about the user (profile, chats, communities, moods, crisis records, Therry history, notifications, exercise logs, journal entries, thought records, assessments, gratitude entries, activities, psychoeducation progress, program progress, sleep logs, medications, and pet data).
- **Account deletion:** `DELETE /api/users/profile` (self) and `DELETE /api/users/admin/user/:id` (admin) run a permanent cascade (`services/deletion.service.js`) covering the user record, avatar file, owned communities, community messages/memberships, DMs on both sides, moods, crises, crisis logs, Therry messages, notifications, exercise logs, and push subscriptions.
- **Retention:** crisis and audit logs are retained for **6 months**, after which identity fields are nulled (`docs/retention-policy.md`).
- **Audit trail:** privacy-sensitive reads are recorded through `services/audit.service.js` and surfaced to admins via `GET /api/audit`.

## Crisis Escalation

Crisis handling is automatic, not just manual:

1. **Manual:** `POST /api/crisis` creates an alert + crisis log and notifies therapists/admins.
2. **Therry-detected:** `POST /api/therry/chat` runs crisis classification. On detection it creates a `Crisis` (source `therry`) + `CrisisLog`, notifies the user's assigned therapist (falling back to admins when unassigned) via `services/notification.service.js`, includes region-appropriate hotlines and sets `crisis: { detected, alertType, hotlines, therapistNotified }` on the response.
3. **User-initiated:** `POST /api/crisis/message-therapist` lets a user notify their assigned therapist directly.

## Therry (AI Companion)

`POST /api/therry/chat` generates replies with Google Gemini (`gemini-3.5-flash`, system prompt enforces a supportive, non-diagnostic tone). Keyword heuristics classify the message into a category. Crisis messages always return a helpline response and are auto-escalated. Both user and assistant turns are persisted to `TherryMessage` (encrypted content, <=4000 chars).

## Architecture Notes

- **Auth:** short-lived access tokens + rotating refresh tokens stored in httpOnly cookies.
- **Role-based access control:** three roles - `user`, `therapist`, `admin` - enforced by dedicated middleware.
- **Notification service:** all notifications are created through `services/notification.service.js`, which also pushes the `notification` Socket.io event in real time.
- **Audit service:** privacy-sensitive access is logged through `services/audit.service.js` (fire-and-forget).
- **Deletion service:** account deletion cascades through `services/deletion.service.js`.
- **Mood check-in service:** `services/moodCheckin.service.js` fires after `POST /api/mood`: when the 3 most recent mood entries are all strictly below the user's 14-day baseline, it creates a `mood_checkin` notification (max one per 3 days) and a Therry assistant message.
- **Encryption:** AES-256-GCM field-level encryption via `utils/crypto.js`, backfilled by `scripts/migrate-encrypt.js`.

## Project Layout

```
├── server.js              # App setup, middleware, route mounting, health
├── routes/                # Express routers per resource (24 route files)
├── controllers/           # Request handlers
├── models/                # Mongoose schemas (23 model files)
├── middleware/            # auth, spamFilter, idempotency, jsonBody, error handlers
├── services/              # notification, push, audit, deletion, moodCheckin
├── scripts/               # migrate-encrypt.js, generateVapidKeys.js
├── docs/                  # key-management.md, retention-policy.md
├── utils/                 # email (Google Apps Script), logger (pino), pagination, validation (zod), crypto, hotlines, cloudinary, tokens, points
├── db/connectDB.js        # Mongo connection
└── __tests__/             # Vitest tests (auth, mood, chat, crypto, validation, points, admin, crisis, therapist)
```

## License

MIT License. See `LICENSE.txt`.
