# Server conventions

Express 4 + mysql2 + zod. Every server change follows these rules strictly.

## Layers (`src/`)
| Folder | Holds | Never holds |
| --- | --- | --- |
| `routes/` | Path + middleware + controller wiring only. One file per resource; its admin router lives in the same file. | Logic, SQL, schemas |
| `controllers/` | Read `req` → call a service → send `res`. A few lines each. | SQL, try/catch, validation |
| `schemas/` | zod schemas, one file per resource. | Anything else |
| `services/` | Business rules and SQL. Map DB rows to API shapes (`toProduct`). Throw `HttpError` for expected failures. | `req`/`res` |
| `middleware/` | `requireUser`, `requireAdmin`, `validate`, `errorHandler`, `cors`. | Resource logic |
| `lib/` | Small shared helpers: `http.js` (`HttpError`, `asyncHandler`), `session.js`. | |

A route looks like this:
```js
ordersRouter.post('/', requireUser, validate(orderSchema, 'Invalid order'), asyncHandler(orders.create));
```

- **Validation:** always `validate(schema, message?, source = 'body')` in the route. Controllers trust `req.body` / `req.query`.
- **Errors:** `throw new HttpError(status, message, extra?)` in services. `errorHandler` sends `{ error, ...extra }`. No per-handler try/catch.
- **Async handlers:** wrap them in `asyncHandler` (Express 4 doesn't forward rejected promises).
- **Transactions:** use `withTransaction((connection) => ...)` from `db.js`.
- **SQL:** prefer `INSERT … SET ?` / `UPDATE … SET ?` with a plain object.

## Code style
- Define functions as `const foo = async (...) => { ... }`, never `export function` / `export async function`.
- Put one `export { foo, bar };` at the bottom of each file. No inline `export const`.
- Import a layer as a namespace when that reads better: `import * as orders from '../services/orders.js'`.
- Keep it simple. This is a small app: no repository layer, classes or abstractions until they are needed.

## Tests
- `npm test` runs supertest against a real MySQL test DB (`npm run db:setup:test` first).
- Tests hit HTTP only, so a refactor must pass them unchanged.
