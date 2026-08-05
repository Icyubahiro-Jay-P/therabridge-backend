# Key Management: FIELD_ENCRYPTION_KEY

Therabridge encrypts sensitive user content at rest in MongoDB using
AES-256-GCM. This document explains how the key is managed.

## What is encrypted

| Collection | Fields |
| --- | --- |
| `messages` | `content`, `editHistory[].content` |
| `communities` (embedded messages) | `messages[].content` |
| `moods` | `note` |
| `crises` | `description` |
| `therrymessages` | `content`, `editHistory[].content` |
| `notifications` | `body` (DM previews) |

## How the key is configured

- Env var: `FIELD_ENCRYPTION_KEY`
- Value: a 32-byte key, provided either as 64 hex chars (recommended) or as a
  raw 32-byte UTF-8 string.
- Generate a new key:

  ```bash
  openssl rand -hex 32
  ```

- Configure it per environment (local `.env`, staging, production). It must be
  identical wherever reads and writes happen.

## Format of encrypted values

Every encrypted value is stored as an envelope string:

```
<iv>:<authTag>:<ciphertext>
```

All three parts are base64url. `iv` is 12 random bytes generated per value
(non-deterministic). GCM authentication tags make tampering detectable; a
failed decrypt returns the raw stored value rather than crashing the request.

## Enabling encryption (deploy sequence)

1. Set `FIELD_ENCRYPTION_KEY` in the environment.
2. Run the one-time backfill against your database **before** shipping the new
   decrypt-on-read code so existing plaintext is never served after the
   feature is live:

   ```bash
   npm run migrate:encrypt
   ```

3. Deploy the application.

Legacy plaintext values (no `:` envelope) are passed through untouched by
decryption, so reads remain correct during and after migration.

## Operational notes

- **Loss = data loss.** The key is not stored in MongoDB. Back it up in a
  secret manager (e.g. AWS Secrets Manager, Vercel/Atlas env vars). If the key
  is lost or rotated without migrating, encrypted fields become unrecoverable.
- **Rotation** requires decrypting and re-encrypting affected documents with
  the new key. No rotation tooling is shipped yet; perform it as a
  maintenance window with `migrate-encrypt.js` logic extended to re-encrypt.
- **Tests** run without `FIELD_ENCRYPTION_KEY`. `encryptField` throws when the
  key is missing, so write paths must not be exercised with encryption in
  test env unless the key is set; read paths return raw values when no key is
  configured.
- Do not log envelope values; they contain ciphertext tied to user data.
