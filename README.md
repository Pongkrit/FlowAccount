# FlowAccount Product API

A small implementation of the attached FlowAccount Backend Exercise: create products, list/filter products, and sell stock. Both optional features (search and bulk price updates) are included. The PDF is the requirements source; choices it leaves unspecified are documented below.

## Stack and setup

Node.js 22.12+ (tested on 24.19), Express 5, TypeScript, and SQLite. `sqlite3` is the asynchronous driver; `sqlite` provides its promise API. No separate database server is needed.

```sh
npm ci
npm run dev
```

The API listens at `http://localhost:3000`. For a compiled run:

```sh
npm run build
npm start
```

Optional environment variables: `PORT` (default `3000`) and `DB_PATH` (default `data/products.sqlite`, relative to the working directory). The database directory and table are created on startup, and products persist across restarts. Tests use an isolated in-memory database, never your development data.

```sh
npm test
```

Tests send real HTTP requests to an ephemeral local port. They cover every endpoint, validation, duplicate SKUs (including concurrent creation), invalid/missing IDs, insufficient stock, exact remaining stock, concurrent sales, SQL-like input, and database constraints.

## Structure

```text
src/
  routes/products.ts               URL/method mapping
  controllers/productController.ts HTTP input validation and responses
  services/productService.ts       Product operations and SQL
  services/validation.ts           Small runtime validation helpers
  services/errors.ts               Expected HTTP errors
  db/database.ts                   Connection and table constraints
  types/product.ts                Product types and categories
  app.ts                          Express setup and error middleware
  server.ts                       Database readiness and listening
tests/products.test.ts            HTTP integration tests
INTERVIEW_NOTES.md                Short code walkthrough and interview prep
```

## API

| Method | Path | Input | Success |
| --- | --- | --- | --- |
| POST | `/api/products` | Product object in body | `201`, created product |
| GET | `/api/products` | Optional `category` query parameter | `200`, product array |
| POST | `/api/products/sell` | `{ "productId": 1, "quantity": 7 }` | `200`, updated product |
| GET | `/api/products/search` | `keyword` query parameter | `200`, matching product array |
| PUT | `/api/products/bulk-price-update` | Array of `{ "productId", "newPrice" }` | `200`, `{ "updatedCount": 2 }` |

### Example requests

Use the following with curl (on Windows PowerShell, use `curl.exe` if `curl` is an alias). Send JSON bodies with `Content-Type: application/json`.

```sh
curl -X POST http://localhost:3000/api/products -H 'Content-Type: application/json' -d '{"name":"ข้าวผัด","sku":"FOOD001","price":45,"stock":20,"category":"อาหาร"}'
curl http://localhost:3000/api/products
curl -G http://localhost:3000/api/products --data-urlencode 'category=อาหาร'
curl -X POST http://localhost:3000/api/products/sell -H 'Content-Type: application/json' -d '{"productId":1,"quantity":7}'
curl -G http://localhost:3000/api/products/search --data-urlencode 'keyword=ข้าว'
curl -X PUT http://localhost:3000/api/products/bulk-price-update -H 'Content-Type: application/json' -d '[{"productId":1,"newPrice":50}]'
```

Creation returns the product with a generated numeric `id` and UTC `createdAt`:

```json
{"id":1,"name":"ข้าวผัด","sku":"FOOD001","price":45,"stock":20,"category":"อาหาร","createdAt":"2026-09-25T07:00:00.000Z"}
```

Selling 7 from stock 20 returns the same product with `stock: 13`. Selling the remaining 13 succeeds with `stock: 0`; another sale fails.

## Validation and HTTP behavior

- Name: nonblank string. SKU: nonblank string with at least 3 Unicode code points after trimming, and unique. Name and SKU are stored trimmed; SKU uniqueness is case-sensitive. No additional SKU format is imposed.
- Price: finite JSON number greater than zero, in baht. Stock: finite JSON number at least zero. Numeric strings and `null` are rejected. Fractional values are accepted because the PDF does not require whole units or a fixed decimal scale.
- Category: exactly `อาหาร`, `เครื่องดื่ม`, `ของใช้`, or `เสื้อผ้า`.
- Sale: validate positive finite `quantity` first, then positive safe-integer `productId`, then product existence, then stock availability. Unknown valid IDs return `404`; malformed IDs, invalid quantity, and insufficient stock return `400`.
- Invalid creation (including duplicate SKU) returns `400`, following the exercise's validation response. Errors consistently use `{ "errors": ["message", "..."] }`; creation aggregates field errors. Unexpected failures return `500` without exposing SQL or stack traces.
- Category filters are exact matches; an unknown or empty category yields `[]`. Repeated category parameters are rejected. Unfiltered lists are ordered by ID.
- Search uses a literal, case-insensitive substring of name or SKU, including Unicode lowercasing. Missing/repeated keywords return `400`; an empty keyword matches all products. `%` and `_` are literal characters, not SQL wildcards.
- Bulk updates validate the full array before any writes. Missing IDs are skipped, and the summary counts matched entries. An empty array returns zero. Repeated IDs run in input order and each matched entry counts; the last price wins when no other request intervenes. These are implementation choices where the PDF is silent.
- Malformed JSON returns `400`; unknown routes return `404`. Express's default JSON body-size limit applies (`413` for oversized requests).

## Important decisions

**Keep the flow small:** routes select the controller, controllers validate HTTP input, and services perform product operations using SQL. There is no repository framework or dependency-injection container. Express 5 forwards rejected async handlers to the shared error middleware.

**SKU protection in two places:** the service pre-check produces a clear validation error; the database `UNIQUE` constraint prevents a race between simultaneous inserts. A constraint collision is translated to the same `400` response.

**Parameterized SQL:** all request-derived SQL values use `?` bindings. User input is data, never executable SQL. Search filters the small product list in JavaScript so Unicode case handling is straightforward; it does not construct SQL from the keyword.

**Atomic stock decrement:** `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ? RETURNING *` checks current availability and subtracts stock in one statement. SQLite serializes writers, so concurrent requests cannot both spend the same stock. The initial existence lookup is never used to calculate the new balance. A database `CHECK (stock >= 0)` provides another safeguard. `RETURNING` supplies the balance from that sale even if another request changes stock afterward. No explicit multi-statement transaction is needed for this operation.

**Known tradeoffs:** SQLite `REAL`/JavaScript numbers use floating point, so fractional arithmetic can round (for example, `0.3 - 0.1` is not exactly `0.2`). Whole-unit balances are tested exactly. No decimal precision policy is invented for this exercise. Bulk updates are separate statements: malformed input causes no writes, but a database failure during execution can leave earlier updates committed. Search reads the whole dataset. These are deliberate scope limits, not production guarantees.

## Production improvements

Agree on money precision (for example, integer satang) and stock units, then use fixed-scale storage/arithmetic. Add authentication/authorization, pagination and indexed database search, migrations, backups, structured logs, graceful shutdown, and operational monitoring as needed. For a growing multi-instance service, consider PostgreSQL and connection pooling while keeping atomic stock updates. Use a transaction on a dedicated connection if bulk updates must be all-or-nothing. Consider sale idempotency and an inventory movement log to handle retries and auditing. Keep dependencies and security checks in CI.
