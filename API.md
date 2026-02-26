# AgentOps Backend API (Production-Ready)

Base URL: http://localhost:4000

- Protected routes require `Authorization: Bearer <ACCESS_TOKEN>`.
- Refresh tokens are stored in an HttpOnly cookie named `rt` (default). Use curl cookie jar to persist across requests.
- All bodies are JSON unless specified.

## Health
- Method: GET  
- Path: `/health`

Response:
```json
{ "ok": true, "env": "production" }
```

Curl:
```bash
curl -s http://localhost:4000/health
```

---

## Signup
- Method: POST  
- Path: `/auth/signup`

Request body:
```json
{
  "name": "Alice Admin",
  "email": "alice@example.com",
  "password": "StrongPass123!",
  "organizationName": "Acme Inc"
}
```

Response:
```json
{
  "user": {
    "id": "cuid",
    "organizationId": "cuid",
    "email": "alice@example.com",
    "name": "Alice Admin",
    "role": "ADMIN",
    "createdAt": "2026-02-18T12:00:00.000Z",
    "updatedAt": "2026-02-18T12:00:00.000Z"
  },
  "accessToken": "<JWT_ACCESS_TOKEN>"
}
```

Curl (saves refresh cookie to cookie.txt):
```bash
curl -i -c cookie.txt -H "Content-Type: application/json" \
  -d '{"name":"Alice Admin","email":"alice@example.com","password":"StrongPass123!","organizationName":"Acme Inc"}' \
  http://localhost:4000/auth/signup
```

---

## Login
- Method: POST  
- Path: `/auth/login`

Request body:
```json
{
  "email": "alice@example.com",
  "password": "StrongPass123!"
}
```

Response:
```json
{
  "user": { "...": "same shape as signup user" },
  "accessToken": "<JWT_ACCESS_TOKEN>"
}
```

Curl (saves refresh cookie to cookie.txt):
```bash
curl -i -c cookie.txt -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"StrongPass123!"}' \
  http://localhost:4000/auth/login
```

---

## Refresh Access Token
- Method: POST  
- Path: `/auth/refresh`
- Requires: Refresh cookie (`rt`)

Response:
```json
{ "accessToken": "<NEW_JWT_ACCESS_TOKEN>" }
```

Curl (reads + updates cookie.txt):
```bash
curl -b cookie.txt -c cookie.txt -X POST http://localhost:4000/auth/refresh
```

---

## Get Current User
- Method: GET  
- Path: `/auth/me`
- Requires: `Authorization: Bearer <ACCESS_TOKEN>`

Response:
```json
{
  "id": "cuid",
  "organizationId": "cuid",
  "email": "alice@example.com",
  "name": "Alice Admin",
  "role": "ADMIN",
  "createdAt": "2026-02-18T12:00:00.000Z",
  "updatedAt": "2026-02-18T12:00:00.000Z",
  "organization": {
    "id": "cuid",
    "name": "Acme Inc",
    "createdAt": "2026-02-18T12:00:00.000Z",
    "updatedAt": "2026-02-18T12:00:00.000Z"
  }
}
```

Curl:
```bash
ACCESS="<JWT_ACCESS_TOKEN_FROM_SIGNUP_OR_LOGIN>"
curl -H "Authorization: Bearer $ACCESS" http://localhost:4000/auth/me
```

---

## Logout
- Method: POST  
- Path: `/auth/logout`
- Requires: `Authorization: Bearer <ACCESS_TOKEN>`  
- Notes: Also clears the refresh cookie if present.

Response:
```json
{ "success": true }
```

Curl:
```bash
ACCESS="<JWT_ACCESS_TOKEN_FROM_SIGNUP_OR_LOGIN>"
curl -b cookie.txt -H "Authorization: Bearer $ACCESS" -X POST http://localhost:4000/auth/logout
```

---

## Forgot Password
- Method: POST  
- Path: `/auth/forgot-password`

Request body:
```json
{ "email": "alice@example.com" }
```

Response:
```json
{ "success": true }
```

Curl:
```bash
curl -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com"}' \
  http://localhost:4000/auth/forgot-password
```

---

## Reset Password
- Method: POST  
- Path: `/auth/reset-password`
- Use the token received via email link created by the forgot-password flow.

Request body:
```json
{
  "token": "<RESET_TOKEN_FROM_EMAIL_LINK>",
  "newPassword": "NewStrongPass123!"
}
```

Response:
```json
{ "success": true }
```

Curl:
```bash
curl -H "Content-Type: application/json" \
  -d '{"token":"<RESET_TOKEN_FROM_EMAIL_LINK>","newPassword":"NewStrongPass123!"}' \
  http://localhost:4000/auth/reset-password
```

---

## Quick End-to-End Test with curl
```bash
# 1) Signup and capture access token (requires jq)
curl -s -c cookie.txt -H "Content-Type: application/json" \
  -d '{"name":"Alice Admin","email":"alice@example.com","password":"StrongPass123!","organizationName":"Acme Inc"}' \
  http://localhost:4000/auth/signup | tee signup.json
ACCESS=$(cat signup.json | jq -r '.accessToken')

# 2) Call /auth/me
curl -s -H "Authorization: Bearer $ACCESS" http://localhost:4000/auth/me

# 3) Refresh and get new access token
curl -s -b cookie.txt -c cookie.txt -X POST http://localhost:4000/auth/refresh | tee refresh.json
ACCESS=$(cat refresh.json | jq -r '.accessToken')

# 4) Logout
curl -s -b cookie.txt -H "Authorization: Bearer $ACCESS" -X POST http://localhost:4000/auth/logout
```

> If `jq` isn’t available, inspect responses directly and copy the `accessToken` manually.

