# Therabridge — Backend

Express 5 API server for Therabridge, a mental wellness platform.

## Tech

- **Express 5** — HTTP framework
- **Mongoose 9** — MongoDB ODM
- **JWT** — Cookie-based auth (30-day expiry)
- **Bcrypt** — Password hashing (10 rounds)
- **Nodemailer** — Transactional emails (password reset)
- **Multer** — Profile picture uploads

## API Routes

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/users/register` | Register new user |
| POST | `/api/users/login` | Login (email or username) |
| POST | `/api/users/logout` | Clear auth cookie |
| GET | `/api/users/profile` | Get own profile |
| PUT | `/api/users/profile` | Update profile fields |
| POST | `/api/users/change-password` | Change password |
| POST | `/api/users/forgot-password` | Request reset email |
| POST | `/api/users/reset-password/:token` | Reset password |
| POST | `/api/users/upload-avatar` | Upload profile picture |
| PUT | `/api/users/privacy` | Update privacy settings |
| GET | `/api/chat/conversations` | List DM conversations |
| GET | `/api/chat/conversation/:userId` | Get DM thread |
| POST | `/api/chat/send` | Send DM |
| PUT | `/api/chat/edit/:messageId` | Edit message |
| DELETE | `/api/chat/unsend/:messageId` | Unsend message |
| GET/POST | `/api/chat/communities` | List / Create community |
| POST | `/api/chat/communities/join` | Join by invite key |
| GET | `/api/chat/communities/:id/messages` | Get community messages |
| POST | `/api/chat/communities/:id/messages` | Send community message |
| POST | `/api/mood` | Log mood entry |
| GET | `/api/mood` | Get mood history |
| GET | `/api/mood/stats` | Get 30-day mood stats |
| POST | `/api/crisis` | Create crisis alert |
| GET | `/api/crisis/mine` | Get own alerts |

## Auth

All protected routes use an httpOnly JWT cookie (`token`). The cookie is set on login/register and cleared on logout. In production, `secure: true` and `sameSite: "none"` are used.

## Models

- **User** — username, email, password, role, avatar, bio, streaks, privacy/chat settings
- **Message** — sender, recipient, content, read status, edit history, soft delete
- **Community** — name, owner, members, inviteKey, messages (embedded)
- **Mood** — user, mood (enum), emoji, note, factors, intensity
- **Crisis** — user, alertType, description, status, resources
- **Exercise** — title, description, category, duration, instructions
- **ExerciseLog** — user, exercise, status, startedAt, completedAt
- **Notification** — user, type, title, body, read, metadata
