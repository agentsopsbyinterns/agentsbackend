# Backend API Test Plan (Admin → Project Manager → Team Member)

## Prerequisites
- Start server on port 4000:
  - Windows PowerShell:
    - Set env (temporary):  
      `$env:JWT_ACCESS_SECRET='dev-access-secret-1234567890123456'; $env:JWT_REFRESH_SECRET='dev-refresh-secret-1234567890123456'; $env:HMAC_SECRET='dev-hmac-secret-1234567890123456'`
    - Run: `npx tsx src/server.ts`
- Health: `curl -s http://localhost:4000/health`
  - Expected: `{"ok":true,"env":"development"}`

## 1) Signup (Admin)
- Request:
  ```
  curl -s -H "Content-Type: application/json" \
    -d "{\"name\":\"Admin\",\"email\":\"admin@test.com\",\"password\":\"Admin@123\",\"organizationName\":\"Acme Inc\"}" \
    http://localhost:4000/auth/signup
  ```
- Expected (shape):
  ```
  {
    "user": { "id":"...", "organizationId":"...", "email":"admin@test.com", "name":"Admin", "role":"ADMIN" },
    "accessToken":"<JWT>"
  }
  ```
- Save `accessToken` for subsequent calls.

## 2) Create First Project
- Request:
  ```
  curl -s -H "Authorization: Bearer <ACCESS>" -H "Content-Type: application/json" \
    -d "{\"name\":\"Website Revamp\",\"clientName\":\"Acme Inc\"}" \
    http://localhost:4000/projects
  ```
- Expected (shape):
  ```
  { "id":"<projectId>", "organizationId":"...", "name":"Website Revamp", "clientName":"Acme Inc", ... }
  ```

## 3) Invite Team Member (Project-level)
- Request:
  ```
  curl -s -H "Authorization: Bearer <ACCESS>" -H "Content-Type: application/json" \
    -d "{\"email\":\"member@test.com\",\"role\":\"VIEWER\"}" \
    http://localhost:4000/projects/<projectId>/invite
  ```
- Expected:
  - Existing user: `{ "added": true, "inviteSent": false, "member": { "userId":"...", "projectId":"...", "projectRole":"VIEWER" } }`
  - New user: `{ "added": false, "inviteSent": true, "invite": { "id":"...", "projectId":"...", "email":"member@test.com", "projectRole":"VIEWER" } }`

## 4) Accept Invite (for new user)
- Get invite token from email log (JSON transport) or backend logs.
- Request:
  ```
  curl -s -H "Content-Type: application/json" \
    -d "{\"token\":\"<INVITE_TOKEN>\",\"password\":\"Member@123\"}" \
    http://localhost:4000/accept-invite
  ```
- Expected:
  ```
  { "user": { "email":"member@test.com", "role":"MEMBER", "globalRole":"TEAM_MEMBER" }, "accessToken":"<JWT>" }
  ```

## 5) Workspace (Project switcher)
- As invited user:
  ```
  curl -s -H "Authorization: Bearer <ACCESS_MEMBER>" http://localhost:4000/workspace
  ```
- Expected:
  ```
  { "projects": [ { "id":"<projectId>", "name":"Website Revamp", "clientName":"Acme Inc", "role":"VIEWER" } ] }
  ```

## 6) Role-Based Examples
- Only Admin/Project Manager can update project:
  ```
  curl -s -H "Authorization: Bearer <ACCESS>" -H "Content-Type: application/json" \
    -X PUT -d "{\"name\":\"Website Revamp v2\"}" \
    http://localhost:4000/projects/<projectId>
  ```
- Viewer will be forbidden (expected 403).

## 7) Meetings (existing)
- List:
  ```
  curl -s -H "Authorization: Bearer <ACCESS>" http://localhost:4000/meetings
  ```
- Get by id (returns 404 if not in org or deleted):
  ```
  curl -s -H "Authorization: Bearer <ACCESS>" http://localhost:4000/meetings/<meetingId>
  ```

## 8) Refresh Token (stay logged in)
- Request:
  ```
  curl -s -X POST http://localhost:4000/auth/refresh
  ```
- Expected:
  ```
  { "accessToken": "<NEW_JWT>" }
  ```
  - Requires refresh cookie set during signup/login (HttpOnly).

## Notes
- Roles used:
  - Global: Admin, Project Manager, Team Member
  - Project: Owner, Editor, Viewer
- Current task endpoints:
  - List tasks: `GET /projects/:id/tasks`
  - Metrics: `GET /projects/:id/metrics`
  - CRUD endpoints can be added similarly:
    - `POST /projects/:id/tasks`, `PATCH /projects/:id/tasks/:taskId`, `DELETE /projects/:id/tasks/:taskId`
    - Guard with `requireProjectRole(['OWNER','EDITOR'])` for write; `['OWNER','EDITOR','VIEWER']` for read.
