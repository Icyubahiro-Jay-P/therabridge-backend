# Therabridge — Backend

Express 5 + MongoDB API server for Therabridge, a mental wellness platform.

## Tech

- **Express 5** — HTTP framework
- **Mongoose 9** — MongoDB ODM
- **JWT** — Cookie-based auth: short-lived access token (`token`, 15 min) + rotating refresh token (`refreshToken`, 7 days, hashed `jti`s stored on the user for revocation)
- **Bcrypt** — Password hashing (10 rounds) with old-password rotation
- **Zod** — Request body validation (`utils/validation.js`)
- **Nodemailer** — Transactional emails (password reset, nodemailer-ethereal in dev)
- **Multer** + **Sharp** — Profile picture upload + image optimization
- **Helmet**, **express-rate-limit**, **CORS** — Security
- **Pino** — Structured logging (`utils/logger.js`)
- **@google/generative-ai** — Therry chat model (`gemini-3.5-flash`)
- **Vitest** — Unit tests (`__tests__/`)

## Setup

```bash
npm install
cp .env.example .env   # fill in values
npm run dev            # nodemon server.js
npm test               # vitest run
```

Required env vars (see `.env.example`): `PORT`, `MONGO_URI`, `JWT_SECRET`, `GEMINI_API_KEY` (for Therry), email SMTP vars. `AI_SERVICE_URL` points to an optional Python ML microservice used for spam/crisis/sentiment hints (falls back gracefully when unavailable).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Nodemon on `server.js` |
| `npm start` | Run `server.js` |
| `npm test` | Run Vitest suite |

## API Routes

All endpoints below are mounted under `/api`. Endpoints marked **🔒** require the JWT cookie.

### Users — `/api/users`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/users/register` | Register new user |
| POST | `/users/login` | Login (email or username) |
| POST | `/users/logout` | Clear auth cookies + revoke refresh token |
| POST | `/users/refresh` | Rotate refresh token, issue new access token |
| POST | `/users/forgot-password` | Request reset email |
| POST | `/users/reset-password/:token` | Reset password |
| GET | `/users/profile` | 🔒 Get own profile |
| PUT | `/users/profile` | 🔒 Update profile fields |
| DELETE | `/users/profile` | 🔒 Delete account |
| POST | `/users/change-password` | 🔒 Change password |
| POST | `/users/upload-avatar` | 🔒 Upload profile picture (multipart) |
| PUT | `/users/privacy` | 🔒 Update per-field privacy settings |
| GET | `/users/users` | 🔒 List users (admin) |
| GET | `/users/therapists` | 🔒 List therapists |
| GET | `/users/users/:id` | 🔒 Get user by id |
| PUT | `/users/admin/disable/:id` | 🔒 Disable user (admin) |
| PUT | `/users/admin/role/:id` | 🔒 Change role (admin) |
| DELETE | `/users/admin/user/:id` | 🔒 Delete user (admin) |
| GET | `/users/therapist/user/:id` | 🔒 Full user data (therapist) |
| GET | `/users/:username` | Public profile |

### Chat — `/api/chat`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/chat/conversations` | 🔒 List DM conversations |
| GET | `/chat/conversation/:userId` | 🔒 Get DM thread |
| GET | `/chat/conversation/:userId/updates` | 🔒 Long-poll DM updates (since `?since=`) |
| POST | `/chat/send` | 🔒 Send DM (spam-filtered) |
| GET | `/chat/search` | 🔒 Search users by query |
| GET | `/chat/settings` | 🔒 Get chat settings |
| PUT | `/chat/settings` | 🔒 Update chat settings |
| PUT | `/chat/edit/:messageId` | 🔒 Edit message (tracks history) |
| DELETE | `/chat/unsend/:messageId` | 🔒 Unsend message |
| DELETE | `/chat/messages` | 🔒 Delete all my DMs |
| GET | `/chat/communities` | 🔒 List my communities |
| POST | `/chat/communities` | 🔒 Create community |
| POST | `/chat/communities/join` | 🔒 Join by invite key |
| GET | `/chat/communities/by-key/:inviteKey` | 🔒 Look up community by key |
| GET | `/chat/communities/:id` | 🔒 Get community + messages |
| GET | `/chat/communities/:id/updates` | 🔒 Long-poll community updates |
| PUT | `/chat/communities/:id` | 🔒 Update community |
| POST | `/chat/communities/:id/messages` | 🔒 Send community message (spam-filtered) |
| PUT | `/chat/communities/:id/messages/:msgId` | 🔒 Edit community message |
| DELETE | `/chat/communities/:id/messages/:msgId` | 🔒 Unsend community message |
| POST | `/chat/communities/:id/read` | 🔒 Mark community messages read |
| POST | `/chat/communities/:id/members/remove` | 🔒 Remove a member |
| DELETE | `/chat/communities/:id` | 🔒 Delete community |
| DELETE | `/chat/community-messages` | 🔒 Delete all my community messages |

### Exercises — `/api/exercises`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/exercises` | List all exercises (public) |
| GET | `/exercises/:id` | Get exercise (public) |
| POST | `/exercises` | 🔒 Create exercise (admin) |
| GET | `/exercises/logs/mine` | 🔒 My exercise logs |
| GET | `/exercises/stats` | 🔒 Exercise/login streak & score stats |
| POST | `/exercises/:id/start` | 🔒 Start exercise |
| POST | `/exercises/:id/complete` | 🔒 Complete exercise (awards points/streaks) |

### Mood — `/api/mood`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/mood` | 🔒 Log mood entry |
| GET | `/mood` | 🔒 Get my mood history |
| GET | `/mood/stats` | 🔒 30-day mood stats (incl. streak) |
| DELETE | `/mood/:id` | 🔒 Delete a mood entry |

### Notifications — `/api/notifications`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications` | 🔒 Get my notifications |
| GET | `/notifications/unread-count` | 🔒 Unread count |
| PUT | `/notifications/:id/read` | 🔒 Mark one read |
| PUT | `/notifications/read-all` | 🔒 Mark all read |
| DELETE | `/notifications/:id` | 🔒 Delete one |
| DELETE | `/notifications` | 🔒 Delete all |

### Crisis — `/api/crisis`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/crisis` | 🔒 Create crisis alert (triggers notifications) |
| GET | `/crisis/mine` | 🔒 Get my alerts |
| GET | `/crisis/active` | 🔒 All active alerts (therapist/admin) |
| PUT | `/crisis/:id/acknowledge` | 🔒 Acknowledge alert |
| PUT | `/crisis/:id/resolve` | 🔒 Resolve alert |

### Therry — `/api/therry`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/therry/chat` | 🔒 Send a message, get Therry's reply |
| GET | `/therry/messages` | 🔒 Get my Therry history (asc, max 500) |

### Misc

- `GET /health` — health check (server + DB status)
- `GET /` — API banner

## Auth

Protected routes require a valid access token (httpOnly `token` cookie or `Authorization: Bearer` header, 15-min expiry). When the access token expires, the client calls `/users/refresh` with the httpOnly `refreshToken` cookie (7-day expiry); the refresh token is rotated on every use and stored hashed (`sha256` of the `jti`) in `user.refreshTokens` so sessions can be revoked (logout, password change/reset). Both cookies use `secure: true` and `sameSite: "none"` in production. Rate limiting is applied globally (500 req/15min, with long-poll `*/updates` endpoints exempt) and on auth endpoints (50 req/15min). Idempotency keys are honored via the `Idempotency-Key` header.

## Models

- **User** — firstName, lastName, username, email, password (+ `oldPasswords` rotation), role (`user`/`admin`/`therapist`), avatar, bio, chat settings (read receipts), per-field privacy settings, disabled flag, wellness score (exercises + Talking Points), login/exercise streaks & bests, last login/exercise dates, daily talking-points counter.
- **Message** (DM) — sender, recipient, content (≤2000), read/readAt, `deletedFor`, unsent, edited/editCount/editHistory.
- **Community** — name, owner, members, unique `inviteKey`, description, embedded messages (sender, content ≤2000, readBy, unsent, edit history).
- **Mood** — user, mood (`great`/`good`/`okay`/`bad`/`terrible`), emoji, note, factors, intensity (1–10), date.
- **Crisis** — user, alertType, description, status (`active`/`acknowledged`/`resolved`), acknowledgedBy, resolvedAt, resourcesShared.
- **Exercise** — title, description, duration (sec), type, steps, difficulty, emoji, color.
- **ExerciseLog** — user, exercise, startedAt, completedAt, timeSpent, completed.
- **Notification** — recipient, sender, type (message, community_invite, exercise_reminder, system, mood_reminder, crisis_alert, community_update, streak_milestone), title, body, data, read/readAt.
- **TherryMessage** — user, role (`user`/`assistant`), content (≤4000), category (`anxiety`/`sad`/`stress`/`lonely`/`angry`/`general`/`crisis`).

## Talking Points

"Reaching out is cardio for the heart." Sending a DM or community message earns **+2 Wellness points**; messaging Therry earns **+5** (opening up = bonus self-care). Points feed the same wellness score as completing exercises and are capped at **20/day** per user so chat can't outpace real self-care. Awarded points are returned as `pointsEarned` on the send/chat endpoints and surfaced as `talkingPointsToday` in `GET /api/exercises/stats`. (The mechanics are intentionally undisclosed in the UI — discovery is part of the fun.)

## Therry (AI Companion)

`POST /api/therry/chat` generates replies with Google Gemini (`gemini-3.5-flash`, system prompt enforces a supportive, non-diagnostic tone). Keyword heuristics classify the message into a category; if an ML microservice is reachable, its crisis/sentiment/spam hints refine the category and spam can be rejected. Crisis messages always return a helpline response. Both user and assistant turns are persisted to `TherryMessage` and replayed through `GET /api/therry/messages`.

## Project Layout

```
├── server.js              # App setup, middleware, route mounting, health
├── routes/                # Express routers per resource
├── controllers/           # Request handlers
├── models/                # Mongoose schemas
├── middleware/            # auth, upload (multer+sharp), spamFilter, idempotency, error handlers
├── services/mlClient.js   # Optional ML microservice client (spam/crisis/sentiment)
├── utils/                 # logger (pino), nodemailer, pagination, validation (zod), streakMilestones
├── db/connectDB.js        # Mongo connection
└── __tests__/             # Vitest tests (auth, mood, chat)
```
