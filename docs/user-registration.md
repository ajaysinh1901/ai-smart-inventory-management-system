# User Registration

How a new user account is created in SmartStock AI.

## Endpoint

| | |
|---|---|
| **Method / Path** | `POST /api/v1/auth/register` |
| **Auth required** | No (public) |
| **Success status** | `201 Created` |
| **Content-Type** | `application/json` |

## Request body

```json
{
  "name": "Asha Traders",
  "email": "owner@ashatraders.in",
  "password": "secret123"
}
```

| Field | Type | Rules |
|-------|------|-------|
| `name` | string | Required. Trimmed. 2–120 characters. HTML tags are stripped (`<…>` removed) before saving. |
| `email` | string | Required. Trimmed, lowercased. Must be a valid email. Must be unique. |
| `password` | string | Required. Minimum 6 characters. |

> The schema is **strict** — any extra field (including `role`) causes a validation error. Public registration can never set a privilege level.

## Response

On success, a JWT is issued and set both as an `httpOnly` cookie (`token`) and in the JSON body:

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "665f1a2b3c4d5e6f7a8b9c0d",
    "name": "Asha Traders",
    "email": "owner@ashatraders.in",
    "role": "staff"
  }
}
```

- Cookie lifetime: **7 days**, `httpOnly` (and `secure` in production).
- Browser clients should rely on the cookie; the body `token` exists for API / mobile clients.
- JWT lifetime is capped at 7 days regardless of `JWT_EXPIRES_IN` / `JWT_EXPIRE`.

## Role assignment

Every self-registered user is created with role **`staff`** (lowest privilege). This is hard-coded in the service and cannot be overridden by the request. Elevation to `manager` / `admin` is admin-only via a separate endpoint.

## Errors

| Status | Condition | Message |
|--------|-----------|---------|
| `400` | Validation failure (bad name/email/password, extra fields) | Field-level `errors[]` array |
| `400` | Email already registered | `User already exists` |
| `429` | More than 15 requests/minute from one IP | `Too many requests from this IP...` |

Example validation error:

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [
    { "field": "password", "message": "Password must be at least 6 characters" }
  ]
}
```

## Security notes

- Passwords are hashed with **bcrypt** (10 salt rounds) via a `pre('save')` hook; the plaintext is never stored and `password` is `select: false`.
- Registration is rate-limited to **15 req/min per IP** (`authLimiter`), skipped in test mode.
- The `role` field is rejected on registration (privilege-escalation fix, bug #001).

## Request flow

```
POST /api/v1/auth/register
  → authLimiter            (rate limit, 15/min/IP)
  → validate(registerSchema)   (Zod: name/email/password, strict)
  → auth.controller.register
      → auth.service.registerUser   (dupe check, create with role 'staff')
      → User.model pre-save hook    (bcrypt hash password)
  → sendTokenResponse      (sign JWT, set cookie, 201 JSON)
```

## Relevant files

| Concern | File |
|---------|------|
| Route | `server/src/routes/v1/auth.routes.js` |
| Controller | `server/src/controllers/auth.controller.js` |
| Service | `server/src/services/auth.service.js` |
| Validation schema | `server/src/validators/auth.validator.js` |
| User model | `server/src/models/User.model.js` |
| Rate limiter | `server/src/middlewares/rateLimiter.middleware.js` |
