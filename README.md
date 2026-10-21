# Blog Microservices: auth + post

Two independent Express 5 services that share one MongoDB database and one Redis instance.

```
                ┌───────────────────────┐         ┌────────────────────────┐
  signup/login  │  auth service :4000   │         │  post service :5000    │  CRUD posts
 ─────────────► │  issues JWTs (HS256)  │         │  verifies JWTs only    │ ◄──────────────
                │  writes users         │         │  writes posts          │
                └───────┬─────────┬─────┘         └─────┬────────┬─────────┘
                        │         │ logout: SET          │        │ EXISTS
                        │         └──► auth:revoked:<jti> ◄───────┘ (Redis)
                        │                                │
                        └────────► MongoDB "blog" ◄──────┘
                                   users   posts (author → users._id)
```

| Folder  | Responsibility                                    | Owns collection |
|---------|---------------------------------------------------|-----------------|
| `auth/` | signup, login, logout, `/me`, issuing JWTs, login rate limiting | `users` |
| `post/` | create / list / get / update / delete posts, ownership checks | `posts` |

## Folder structure (same layout in both services)

```
auth/                              post/
├── src/                           ├── src/
│   ├── config/   env, db, redis   │   ├── config/   env, db, redis
│   ├── models/   User             │   ├── models/   Post, User (read-only view)
│   ├── validators/ authValidators │   ├── validators/ postValidators
│   ├── services/ authService,     │   ├── services/ postService, tokenService
│   │             tokenService     │   ├── controllers/postController
│   ├── controllers/authController │   ├── routes/   postRoutes
│   ├── routes/   authRoutes       │   ├── middleware/ authenticate, validate,
│   ├── middleware/ authenticate,  │   │              errorHandler, notFound
│   │     validate, errorHandler,  │   ├── utils/    AppError
│   │     notFound                 │   ├── app.js    (Express app, no listen)
│   ├── utils/    AppError         │   └── server.js (connect, listen, shutdown)
│   ├── app.js                     ├── tests/
│   └── server.js                  ├── .env.example
├── tests/                         └── package.json
├── .env.example
└── package.json
```

Request flow: **route** → middleware (`authenticate`, validation rules + `validate`) → **controller** (HTTP only) → **service** (business rules) → **model** (Mongoose) → errors go to the central **errorHandler**.

---

## Setup (Linux)

### 1. Prerequisites

You need Node.js ≥ 18.18, MongoDB, and Redis. Check what you have:

```bash
node -v && mongod --version | head -1 && redis-server --version
systemctl status mongod redis-server --no-pager
```

If something is missing (Ubuntu/Debian):

```bash
# Node.js 20 LTS via NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs

# Redis
sudo apt-get install -y redis-server
sudo systemctl enable --now redis-server

# MongoDB: follow https://www.mongodb.com/docs/manual/administration/install-on-linux/ then:
sudo systemctl enable --now mongod
```

Verify connectivity:

```bash
mongosh --quiet --eval 'db.runCommand({ ping: 1 })'   # { ok: 1 }
redis-cli ping                                         # PONG
```

### 2. Environment variables

Each service reads its own `.env` file. Start from the examples:

```bash
cp auth/.env.example auth/.env
cp post/.env.example post/.env

# Generate ONE secret and put the SAME value in both files:
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

| Variable | auth | post | Notes |
|---|---|---|---|
| `PORT` | 4000 | 5000 | |
| `MONGO_URI` | ✓ | ✓ | Same DB in both, e.g. `mongodb://127.0.0.1:27017/blog`. If MongoDB auth is enabled: `mongodb://user:pass@127.0.0.1:27017/blog?authSource=admin` |
| `REDIS_URL` | ✓ | ✓ | Same Redis in both, e.g. `redis://127.0.0.1:6379` (or `redis://:password@host:6379/0`) |
| `JWT_SECRET` | ✓ | ✓ | **Must be identical**, ≥ 32 chars |
| `JWT_ISSUER`, `JWT_AUDIENCE` | ✓ | ✓ | Must match; both services check them |
| `JWT_EXPIRES_IN` | ✓ | – | Access-token lifetime, default `15m` |
| `BCRYPT_SALT_ROUNDS` | ✓ | – | Default 12 |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_WINDOW_SECONDS` | ✓ | – | Failed-login lockout per IP + email |
| `NODE_ENV` | ✓ | ✓ | `development` adds stack traces to 500 responses; `production` never does |

### 3. Install and run (two terminals)

```bash
cd auth && npm install && npm run dev     # http://localhost:4000
cd post && npm install && npm run dev     # http://localhost:5000
```

`npm run dev` restarts on file changes (`node --watch`); `npm start` runs normally. Each service exits with an error message at startup if it can't reach MongoDB or a required env var is missing. Ctrl-C / SIGTERM shuts down gracefully: it stops accepting connections, finishes in-flight requests, then closes MongoDB and Redis.

Health checks: `curl localhost:4000/health` and `curl localhost:5000/health`.

### 4. Run the tests

```bash
cd auth && npm test     # 19 tests
cd post && npm test     # 25 tests
```

The tests use Node's built-in test runner and `fetch`, so there are no test dependencies. They need the local MongoDB and Redis running, and they use **separate** databases (`blog_test_auth`, `blog_test_post`) and Redis DBs 15/14, which are wiped on each run. Your `blog` data is never touched.

### 5. Postman collection

Import **`blog.postman_collection.json`** into Postman (*Import* → choose the file). It contains every API:

| Folder | Requests |
|---|---|
| 1. Auth | Signup, Login, Get my profile, Health check |
| 2. Posts | Create, List all, List by author, Get by id, Update, Delete, Health check |
| 3. Error & security scenarios | Another user editing/deleting your post (403), duplicate email (409), invalid data (400), invalid JSON, wrong password, missing/invalid/expired token (401), invalid id (400), nonexistent post or route (404) |
| 4. Logout | Logout, then show that the old token is rejected (401) |

- Run **Signup** or **Login** first. The token is saved automatically, and protected requests use it through the collection's *Authorization* tab ("Inherit auth from parent").
- Each request has a description and **saved example responses** (success and error), so you can see what it returns without running it.
- To run everything in order: right-click the collection → *Run collection*. For the expired-token test, first set the collection variable `jwtSecret` to `JWT_SECRET` from your `.env`.
- From the terminal (with both services running):

  ```bash
  npx newman run blog.postman_collection.json --env-var "jwtSecret=$(grep ^JWT_SECRET auth/.env | cut -d= -f2)"
  ```

---

## API reference

All responses are JSON:

```jsonc
// success
{ "success": true,  "data": { ... } }
// error
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "Validation failed", "details": [ { "field": "title", "message": "..." } ] } }
```

Protected routes need the header `Authorization: Bearer <accessToken>`.

### Auth service, `http://localhost:4000`

| Method | URL | Auth | Body | Success |
|---|---|---|---|---|
| POST | `/api/auth/signup` | – | `{ name, email, password }` | 201 `{ user, accessToken, tokenType, expiresAt }` |
| POST | `/api/auth/login` | – | `{ email, password }` | 200 `{ user, accessToken, tokenType, expiresAt }` |
| POST | `/api/auth/logout` | ✓ | – | 200 `{ message }` (the token is revoked) |
| GET | `/api/auth/me` | ✓ | – | 200 `{ user }` |
| GET | `/health` | – | – | 200 / 503 `{ service, mongo, redis }` |

Validation ([auth/src/validators/authValidators.js](auth/src/validators/authValidators.js)): `name` 2–50 chars; `email` valid format, stored lowercased; `password` 8–72 bytes with at least one letter and one number.

### Post service, `http://localhost:5000`

| Method | URL | Auth | Body | Success |
|---|---|---|---|---|
| GET | `/api/posts?page=1&limit=10&author=<userId>` | – | – | 200 `{ posts, pagination }` |
| GET | `/api/posts/:id` | – | – | 200 `{ post }` |
| POST | `/api/posts` | ✓ | `{ title, content }` | 201 `{ post }` |
| PATCH | `/api/posts/:id` | ✓ owner | `{ title?, content? }` (at least one) | 200 `{ post }` |
| DELETE | `/api/posts/:id` | ✓ owner | – | 200 `{ message, id }` |
| GET | `/health` | – | – | 200 / 503 |

Validation ([post/src/validators/postValidators.js](post/src/validators/postValidators.js)): `title` 3–150 chars, `content` 1–20000 chars, `limit` 1–100 (default 10), `page` ≥ 1 (default 1), `author` and `:id` must be valid ObjectIds. Any other body field (such as `author` or `_id`) is silently dropped. `details` has one error per invalid field.

### Error codes

| HTTP | `error.code` | When |
|---|---|---|
| 400 | `BAD_REQUEST` | Missing or invalid fields (see `details`), empty update |
| 400 | `INVALID_JSON` | Malformed JSON body |
| 400 | `INVALID_ID` | `:id` is not a 24-char hex ObjectId |
| 401 | `TOKEN_MISSING` | No `Authorization: Bearer …` header |
| 401 | `TOKEN_INVALID` | Bad signature, malformed, wrong issuer/audience, `alg: none` |
| 401 | `TOKEN_EXPIRED` | `exp` is in the past |
| 401 | `TOKEN_REVOKED` | Token was logged out |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password (same response for both) |
| 403 | `FORBIDDEN` | Updating/deleting someone else's post |
| 404 | `NOT_FOUND` | Unknown route or post |
| 409 | `CONFLICT` / `DUPLICATE_KEY` | Email already registered |
| 413 | `PAYLOAD_TOO_LARGE` | Body > 100 kB |
| 429 | `TOO_MANY_ATTEMPTS` | Too many failed logins |
| 500 | `INTERNAL_ERROR` | Unexpected error (generic message, details only in server logs) |
| 503 | `DATABASE_UNAVAILABLE` / `SERVICE_UNAVAILABLE` | MongoDB or Redis unreachable |

### Examples (curl)

```bash
# Signup
curl -s -X POST localhost:4000/api/auth/signup -H 'Content-Type: application/json' \
  -d '{"name":"Jane Doe","email":"jane@example.com","password":"secret123"}'
```
```json
{
  "success": true,
  "data": {
    "user": { "name": "Jane Doe", "email": "jane@example.com", "createdAt": "2026-10-15T08:42:44.657Z",
              "updatedAt": "2026-10-15T08:42:44.657Z", "id": "6ad092044e1f9e00b621033c" },
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "tokenType": "Bearer",
    "expiresAt": "2026-10-15T08:57:44.000Z"
  }
}
```

```bash
# Login and keep the token in a shell variable
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","password":"secret123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.accessToken')

# Create a post
curl -s -X POST localhost:5000/api/posts -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"My first post","content":"Hello world!"}'
```
```json
{
  "success": true,
  "data": {
    "post": { "title": "My first post", "content": "Hello world!",
              "author": { "id": "6ad092044e1f9e00b621033c", "name": "Jane Doe" },
              "createdAt": "2026-10-15T08:42:44.962Z", "updatedAt": "2026-10-15T08:42:44.962Z",
              "id": "6ad092048ef5f8fb4ecd97f1" }
  }
}
```

```bash
# View all posts / one post (no token needed)
curl -s 'localhost:5000/api/posts?page=1&limit=10'
curl -s localhost:5000/api/posts/6ad092048ef5f8fb4ecd97f1
```
```json
{
  "success": true,
  "data": {
    "posts": [ { "title": "My first post", "content": "Hello world!", "author": { "id": "6ad0…033c", "name": "Jane Doe" }, "id": "6ad0…97f1", "createdAt": "…", "updatedAt": "…" } ],
    "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
  }
}
```

```bash
# Update (owner only)
curl -s -X PATCH localhost:5000/api/posts/6ad092048ef5f8fb4ecd97f1 -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"content":"Updated content"}'
# → 200 { "success": true, "data": { "post": { ..., "content": "Updated content" } } }
# Another user's token → 403 { "success": false, "error": { "code": "FORBIDDEN", "message": "You can only modify your own posts" } }

# Delete (owner only)
curl -s -X DELETE localhost:5000/api/posts/6ad092048ef5f8fb4ecd97f1 -H "Authorization: Bearer $TOKEN"
# → 200 { "success": true, "data": { "message": "Post deleted successfully", "id": "6ad092048ef5f8fb4ecd97f1" } }

# Logout: the token stops working in BOTH services immediately
curl -s -X POST localhost:4000/api/auth/logout -H "Authorization: Bearer $TOKEN"
curl -s -X POST localhost:5000/api/posts -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"title":"x","content":"y"}'
# → 401 { "success": false, "error": { "code": "TOKEN_REVOKED", "message": "Access token has been revoked" } }
```

---

## How it works: key decisions

### JWT: who signs, who verifies
- Only the **auth service signs** tokens. The post service has the secret only to **verify** them; it never calls the auth service over HTTP, so a post request makes no network hop to auth.
- Claims: `sub` = user id, `jti` = random UUID (used for revocation), `email`, `iat`, `exp`, `iss`, `aud`.
- Verification pins `algorithms: ['HS256']` and checks `iss`/`aud`. That rejects unsigned `alg: none` tokens and tokens minted for some other system with the same secret.
- Tokens are short-lived (15 min) because a stateless JWT stays valid until it expires unless you revoke it.
- *Upgrade path:* switch to **RS256**. Auth would keep the private key and post would only get the public key, so a compromised post service could not forge tokens.

### Redis: two jobs
1. **Revocation denylist.** On logout, auth writes `auth:revoked:<jti>` with a TTL equal to the token's remaining lifetime. Both services check that key in `authenticate`. Keys expire on their own exactly when the token would have expired anyway, so the denylist never grows without bound. The key prefix is a contract between the two services.
2. **Login brute-force protection.** Each failed login increments `auth:login-fail:<ip>:<email>` (a fixed 15-minute window). After 5 failures you get 429; a successful login clears the counter. Keying on IP + email means an attacker elsewhere can't lock a real user out.
- **Fail closed:** if Redis is down, protected routes return **503** instead of skipping the revocation check. The client is created with `disableOfflineQueue` so requests fail fast instead of hanging. Public `GET /api/posts` keeps working without Redis.

### Authorization: never trust the client's user id
- `req.user.id` comes **only** from the verified token's `sub`.
- The `validate` middleware keeps only fields that have a rule (`matchedData`), so `{ "author": "<someone else>" }` in a create or update is dropped. The schema also marks `author` as `immutable`.
- Update/delete load the post, return **404** if it doesn't exist and **403** if `post.author ≠ req.user.id`. Delete also filters on `{ _id, author }` as defense in depth. Changing the `:id` in the URL only reaches *your own* posts.

### MongoDB / Mongoose
- Both services connect to the same `blog` database. Each service writes only its own collection (`users` / `posts`). The post service registers a **read-only** `User` model so it can `populate('author', 'name')`. It only ever reads `name`, and passwords are never selected.
- **Duplicate users:** a unique index on `email` (lowercased) is the real guarantee. The `exists()` pre-check just gives a friendly 409, and a race between two signups hits E11000, which the error handler also maps to 409. The test suite runs three concurrent signups and expects one 201 and two 409s.
- `password` has `select: false`, and `toJSON` strips `password`/`__v` and renames `_id` → `id`, so a hash can't reach a response by accident. Hashing runs in a `pre('save')` hook with bcrypt (12 rounds). Login compares against a dummy hash when the email is unknown, so response timing doesn't reveal which emails are registered.
- Indexes: `users.email` (unique), `posts.createdAt` (list newest first), `posts.{author, createdAt}` (filter by author). `server.js` calls `createIndexes()` at startup.
- `sanitizeFilter` is enabled globally as a second layer against `{ "$gt": "" }`-style injection. The first layer is the `isString()` check on every text field.

### Middleware and errors
- **Express 5** forwards rejected promises from `async` handlers and middleware to the error handler, so there are no try/catch blocks or `asyncHandler` wrappers.
- **express-validator** handles request validation. Each route lists its rules, then the `validate` middleware, then the controller:

  ```js
  // post/src/validators/postValidators.js
  body('title').isString().trim().isLength({ min: 3, max: 150 }).withMessage('title must be 3-150 characters')

  // post/src/routes/postRoutes.js
  router.post('/', authenticate, createPostRules, validate, controller.create);
  ```

  - The rules (`body()`, `param()`, `query()`) only *check* the request and record any errors.
  - `validate` ([src/middleware/validate.js](auth/src/middleware/validate.js)) reads the errors with `validationResult(req)`. If there are any, it responds 400. Otherwise it replaces `req.body` with `matchedData(req)`, which keeps only the checked fields and their cleaned values (trimmed, lowercased).
  - An invalid `:id` (checked with `param('id').isMongoId()`) returns `INVALID_ID` before the database is queried.
  - In Express 5, `req.query` can't be changed, so the list controller reads `page`/`limit` from `matchedData(req)`, where they're already numbers.
- `errorHandler` turns everything into one JSON shape: `AppError` (our own) → its status; body-parser `SyntaxError` → 400; Mongoose `CastError`/`ValidationError` → 400; E11000 → 409; Mongo network/selection errors → 503; anything else → a generic 500, with the full error logged on the server only.
- `notFound` turns unknown routes into a JSON 404.

### Why the code is duplicated across services
`AppError`, `errorHandler`, the `validate` middleware, `authenticate` and the db/redis config exist in both folders on purpose. Each service can be installed, versioned and deployed alone, without a shared package coupling their releases. If you'd rather not duplicate, move these files into a local `shared/` package and reference it with `"shared": "file:../shared"`.
