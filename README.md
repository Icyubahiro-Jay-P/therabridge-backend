# Therabridge - Backend

Express 5 + MongoDB API server for Therabridge, a mental wellness platform.

## Tech

- **Express 5** - HTTP framework
- **Mongoose 9** - MongoDB ODM
- **JWT** - Cookie-based auth: short-lived access token (`token`, 15 min) + rotating refresh token (`refreshToken`, 7 days, hashed `jti`s stored on the user for revocation)
- **Bcrypt** - Password hashing (10 rounds) with old-password rotation
- **Zod** - Request body validation (`utils/validation.js`)
- **Nodemailer** - Transactional emails (password reset, nodemailer-ethereal in dev)
- **Multer** + **Sharp** - Profile picture upload + image optimization
- **Helmet**, **express-rate-limit**, **CORS** - Security
- **Pino** - Structured logging (`utils/logger.js`)
- **@google/generative-ai** - Therry chat model (`gemini-3.5-flash`)
- **Socket.io** - Real-time DMs, community messages, notifications, and possible-screenshot notices (JWT-authed handshake)
- **Web Push** (`web-push`, VAPID) - Device notifications for messages and activity
- **Vitest** - Unit tests (`__tests__/`)

## Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Google Gemini API key (for the Therry AI companion)

### Setup

```bash
npm install
cp .env.example .env   # fill in values
npm run dev            # nodemon server.js
npm test               # vitest run
```

### Environment Variables

Copy `backend/.env.example` to `.env`:

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default: 5000) |
| `CLIENT_URL` | Allowed CORS origin (default: `http://localhost:5173`; production: `https://therabridge.vercel.app`) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret for JWT signing |
| `EMAIL_HOST` / `EMAIL_PORT` | SMTP host and port (Gmail SMTP) |
| `EMAIL_USER` / `EMAIL_PASS` | SMTP credentials (Gmail app password) |
| `FROM_NAME` / `FROM_EMAIL` | Outbound email sender identity |
| `GEMINI_API_KEY` | Google Gemini API key (Therry AI companion) |
| `AI_SERVICE_URL` | Optional Python ML microservice for spam/crisis/sentiment hints (falls back gracefully when unavailable) |
| `NODE_ENV` | `development` \| `production` |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push keys (generate with `npm run vapid`) - required for device notifications |
| `VAPID_SUBJECT` | Contact for VAPID (e.g. `mailto:no-reply@therabridge.com`) |

**Production:** the API runs at [therabridge-backend.onrender.com](https://therabridge-backend.onrender.com); the Vercel frontend proxies `/api`, `/uploads`, and `/socket.io` to it via the rewrites in `frontend/vercel.json`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Nodemon on `server.js` |
| `npm start` | Run `server.js` |
| `npm test` | Run Vitest suite |

## API Routes

All endpoints below are mounted under `/api`. Endpoints marked **🔒** require the JWT cookie.

### Users - `/api/users`

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

### Chat - `/api/chat`

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
| POST | `/chat/screenshot-notice` | 🔒 REST fallback for possible-screenshot notices (rate-limited) |
| POST | `/chat/watermark-stamp` | 🔒 Render text to a PNG with a tiled per-viewer watermark (Sharp) |
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

### Exercises - `/api/exercises`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/exercises` | List all exercises (public) |
| GET | `/exercises/:id` | Get exercise (public) |
| POST | `/exercises` | 🔒 Create exercise (admin) |
| GET | `/exercises/logs/mine` | 🔒 My exercise logs |
| GET | `/exercises/stats` | 🔒 Exercise/login streak & score stats |
| POST | `/exercises/:id/start` | 🔒 Start exercise |
| POST | `/exercises/:id/complete` | 🔒 Complete exercise (awards points/streaks) |

### Mood - `/api/mood`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/mood` | 🔒 Log mood entry |
| GET | `/mood` | 🔒 Get my mood history |
| GET | `/mood/stats` | 🔒 30-day mood stats (incl. streak) |
| DELETE | `/mood/:id` | 🔒 Delete a mood entry |

### Notifications - `/api/notifications`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications` | 🔒 Get my notifications |
| GET | `/notifications/unread-count` | 🔒 Unread count |
| PUT | `/notifications/:id/read` | 🔒 Mark one read |
| PUT | `/notifications/read-all` | 🔒 Mark all read |
| DELETE | `/notifications/:id` | 🔒 Delete one |
| DELETE | `/notifications` | 🔒 Delete all |

### Crisis - `/api/crisis`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/crisis` | 🔒 Create crisis alert (triggers notifications) |
| GET | `/crisis/mine` | 🔒 Get my alerts |
| GET | `/crisis/active` | 🔒 All active alerts (therapist/admin) |
| PUT | `/crisis/:id/acknowledge` | 🔒 Acknowledge alert |
| PUT | `/crisis/:id/resolve` | 🔒 Resolve alert |

### Therry - `/api/therry`

| Method | Path | Description |
|--------|------|-------------|
| POST | `/therry/chat` | 🔒 Send a message, get Therry's reply |
| GET | `/therry/messages` | 🔒 Get my Therry history (asc, max 500) |

### Push - `/api/push`

| Method | Path | Description |
|--------|------|-------------|
| GET | `/push/vapid-public-key` | 🔒 Public VAPID key for creating a push subscription |
| POST | `/push/subscribe` | 🔒 Register/refresh a device push subscription |
| POST | `/push/unsubscribe` | 🔒 Remove a device push subscription (logout/unsubscribe) |

### Misc

- `GET /health` - health check (server + DB status)
- `GET /` - API banner

## Auth

Protected routes require a valid access token (httpOnly `token` cookie or `Authorization: Bearer` header, 15-min expiry). When the access token expires, the client calls `/users/refresh` with the httpOnly `refreshToken` cookie (7-day expiry); the refresh token is rotated on every use and stored hashed (`sha256` of the `jti`) in `user.refreshTokens` so sessions can be revoked (logout, password change/reset). Both cookies use `secure: true` and `sameSite: "none"` in production. Rate limiting is applied globally (500 req/15min, with long-poll `*/updates` endpoints exempt) and on auth endpoints (50 req/15min). Idempotency keys are honored via the `Idempotency-Key` header.

## Models

- **User** - firstName, lastName, username, email, password (+ `oldPasswords` rotation), role (`user`/`admin`/`therapist`), avatar, bio, chat settings (read receipts), per-field privacy settings, disabled flag, wellness score (exercises + Talking Points), login/exercise streaks & bests, last login/exercise dates, daily talking-points counter.
- **Message** (DM) - sender, recipient, `kind` (`message` \| `screenshot-notice`), `noticeType`, content (≤2000), read/readAt, `deletedFor`, unsent, edited/editCount/editHistory.
- **Community** - name, owner, members, unique `inviteKey`, description, embedded messages (sender, content ≤2000, readBy, unsent, edit history).
- **Mood** - user, mood (`great`/`good`/`okay`/`bad`/`terrible`), emoji, note, factors, intensity (1–10), date.
- **Crisis** - user, alertType, description, status (`active`/`acknowledged`/`resolved`), acknowledgedBy, resolvedAt, resourcesShared.
- **Exercise** - title, description, duration (sec), type, steps, difficulty, emoji, color.
- **ExerciseLog** - user, exercise, startedAt, completedAt, timeSpent, completed.
- **Notification** - recipient, sender, type (message, community_invite, exercise_reminder, system, mood_reminder, crisis_alert, community_update, streak_milestone), title, body, data, read/readAt.
- **TherryMessage** - user, role (`user`/`assistant`), content (≤4000), category (`anxiety`/`sad`/`stress`/`lonely`/`angry`/`general`/`crisis`).

## Talking Points

"Reaching out is cardio for the heart." Sending a DM or community message earns **+2 Wellness points**; messaging Therry earns **+5** (opening up = bonus self-care). Points feed the same wellness score as completing exercises and are capped at **20/day** per user so chat can't outpace real self-care. Awarded points are returned as `pointsEarned` on the send/chat endpoints and surfaced as `talkingPointsToday` in `GET /api/exercises/stats`. (The mechanics are intentionally undisclosed in the UI - discovery is part of the fun.)

## Real-time (Socket.io)

The server exposes a Socket.io endpoint on the same port as the API (`sockets/chatSocket.js`). The client connects with the same JWT used for the API (via `auth.token` in the handshake, or the `token` cookie / `Authorization` header); unauthorized and disabled users are rejected. The REST long-poll endpoints are kept for backwards compatibility but the client no longer uses them.

**Rooms:** every authenticated socket joins `user:<id>`. Clients subscribe to `community:<id>` while viewing a community via the `join_community` / `leave_community` events (re-joined automatically on reconnect).

**Server → client events** (delivered to the `user:<id>` / `community:<id>` rooms):

| Event | Payload | Emitted when |
|-------|---------|--------------|
| `dm_message` | populated message | a DM is sent - to the recipient (`chat.controller.js`) |
| `conversations_updated` | `{ partnerId }` | a DM is sent - to both parties (conversation list + unread refresh) |
| `dm_message_updated` | message | a DM is edited |
| `dm_message_unsent` | `{ messageId }` | a DM is unsent |
| `community_message` | `{ communityId, message }` | a community message is sent - to the community room |
| `community_message_updated` / `community_message_unsent` | `{ communityId, message }` | a community message is edited / unsent |
| `notification` | notification doc | a notification is created (`services/notification.service.js`) |
| `possible_screenshot` | `{ conversationId }` | a peer reports a possible screenshot |

**Client → server events:**

| Event | Payload | Purpose |
|-------|---------|---------|
| `join_community` / `leave_community` | `{ communityId }` | subscribe/unsubscribe a socket to a community room |
| `possible_screenshot` | `{ conversationId }` | possible-screenshot notice (REST fallback: `POST /api/chat/screenshot-notice`) |

## Device Notifications (Web Push)

The same events that create in-app notifications also trigger device notifications via the Web Push API (`services/push.service.js`).

- **Setup:** generate keys with `npm run vapid` and set `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` in `.env` (and the production environment). Without them, pushes are skipped (logged) and the API returns an empty public key.
- **Subscriptions:** the client registers the browser via `POST /api/push/subscribe` (`models/pushSubscription.model.js` - one row per user/endpoint). Logout unregisters the device.
- **Delivery:** `createNotification` (`services/notification.service.js`) sends the same title/body to the device with a type-based deep link (`data.url`) so tapping the notification opens the right page (chat thread, community, crisis, mood, …).
- **Skip-while-online:** chat notifications (DMs, community messages) are pushed with `skipIfOnline`, so a user actively connected via Socket.io gets the in-app update instead of a duplicate device notification. Stale subscriptions (HTTP 404/410) are pruned automatically.

## Privacy Shield

A "privacy shield" feature set that raises the bar and creates a paper trail for screenshots - it does **not** and cannot prevent someone from capturing content.

- **Socket.io** (`sockets/chatSocket.js`): the client connects with the same JWT used for the API (sent via `auth.token` in the handshake, or the `token` cookie / `Authorization` header). Every authenticated socket joins a `user:<id>` room.
- **Possible-screenshot notices**: when the client detects a screenshot attempt (PrintScreen / `Cmd+Shift+S/3/4/5` or the tab losing focus) it emits `possible_screenshot` with `{ conversationId }` (or falls back to `POST /api/chat/screenshot-notice`). The server:
  1. rate-limits per user to **1 notice / 10 s** (in-memory cooldown);
  2. persists a `Message` with `kind: "screenshot-notice"` (in-thread system message both sides see, surviving reloads);
  3. pushes `possible_screenshot` to the peer's `user:<id>` room in real time.
- **Server-side watermark stamp**: `POST /api/chat/watermark-stamp` renders supplied text to a PNG with a tiled low-opacity `<viewerId> · <timestamp>` watermark using Sharp. Intended as a deterrent for flagged content only; content still reaches the screen in plain form.
- **Rate limiting** is deliberately aggressive because tab-switching is a noisy signal. Notices are "possible" captures - the server never asserts a screenshot actually happened.

**Honest limitation:** blur/blackout, notices, and watermarks discourage casual copying and leave an audit trail, but anyone determined to record content (another device, OS-level capture, developer tools) can still do so. Do not design features that assume content cannot be recorded.

## Therry (AI Companion)

`POST /api/therry/chat` generates replies with Google Gemini (`gemini-3.5-flash`, system prompt enforces a supportive, non-diagnostic tone). Keyword heuristics classify the message into a category; if an ML microservice is reachable, its crisis/sentiment/spam hints refine the category and spam can be rejected. Crisis messages always return a helpline response. Both user and assistant turns are persisted to `TherryMessage` and replayed through `GET /api/therry/messages`.

## Architecture Notes

- **Auth:** short-lived access tokens + rotating refresh tokens stored in httpOnly cookies (see Auth above).
- **Role-based access control:** three roles - `user`, `therapist`, `admin` - enforced by dedicated middleware (`middleware/auth.middleware.js` + `middleware/role.middleware.js`).
- **Notification service:** all notifications are created through `services/notification.service.js`, which also pushes the `notification` Socket.io event in real time.
- **Privacy shield:** client-side blur/blackout on tab switch, screenshot-shortcut detection, and server-side watermark stamping (see Privacy Shield above).

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

## License

MIT License. See `LICENSE.txt`.
