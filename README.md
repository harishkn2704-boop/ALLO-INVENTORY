# Allo Inventory — Reservation System

A production-style inventory reservation system for multi-warehouse e-commerce, built with Next.js 15 App Router, TypeScript, Prisma, PostgreSQL, and Redis.

## Problem

When a customer proceeds to checkout, payment can take several minutes (3DS flows, UPI confirmations). During that window:

- **Don't decrement at add-to-cart** → 80% abandoned carts make inventory look depleted, killing conversion.
- **Don't decrement at payment** → Two customers can pay for the same last unit.

**Solution:** A time-bound reservation (10 minutes) that holds stock during checkout, releases it on timeout or cancellation, and permanently decrements on payment success.

---

## Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 15 App Router |
| Language | TypeScript (strict) |
| ORM | Prisma |
| Database | PostgreSQL (Supabase / Neon / Railway) |
| Cache + Locks | Upstash Redis |
| Validation | Zod |
| UI | Tailwind CSS + Lucide icons |
| Toasts | Sonner |
| Hosting | Vercel |

---

## Local Setup

### 1. Clone and install

```bash
git clone https://github.com/your-username/allo-inventory
cd allo-inventory
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
# PostgreSQL — Supabase, Neon, or Railway all have free tiers
DATABASE_URL="postgresql://..."

# Upstash Redis — console.upstash.com → Create database → REST API
UPSTASH_REDIS_REST_URL="https://xxxx.upstash.io"
UPSTASH_REDIS_REST_TOKEN="xxxx"

# Optional: protects the cron endpoint
CRON_SECRET="your-secret"
```

### 3. Database setup

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database (dev)
npm run db:push

# Or use migrations (recommended for production)
npm run db:migrate

# Seed with demo data (5 products, 3 warehouses)
npm run db:seed
```

### 4. Run dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → redirects to `/products`.

---

## API Reference

### `GET /api/products`
Returns all products with inventory per warehouse.

```json
[
  {
    "id": "...",
    "name": "Wireless Headphones",
    "sku": "AUDIO-WNC-001",
    "price": 8999,
    "inventories": [
      {
        "warehouseId": "...",
        "totalStock": 5,
        "reservedStock": 1,
        "availableStock": 4,
        "warehouse": { "name": "Chennai Hub", "location": "Chennai, TN" }
      }
    ]
  }
]
```

### `GET /api/warehouses`
Returns all warehouses with inventory summary.

### `POST /api/reservations`
Reserve stock.

**Request:**
```json
{
  "productId": "...",
  "warehouseId": "...",
  "quantity": 1,
  "userId": "user-123"
}
```

**Headers:**
```
Idempotency-Key: client-generated-uuid   (optional, for retry safety)
```

**Responses:**
- `201` — Reservation created
- `409` — Insufficient stock (or concurrent reservation in progress)
- `400` — Validation error

### `POST /api/reservations/:id/confirm`
Confirm payment success. Permanently decrements stock.

**Responses:**
- `200` — Confirmed
- `410` — Reservation expired
- `400` — Already confirmed/released

### `POST /api/reservations/:id/release`
Cancel reservation early. Returns stock to available.

**Responses:**
- `200` — Released
- `400` — Not in PENDING state

---

## Concurrency Strategy

### The Problem
If two users simultaneously hit `POST /api/reservations` for the last unit, a naive implementation would:
1. Both read `availableStock = 1`
2. Both see sufficient stock
3. Both create reservations → **oversell**

### Our Solution: Two-Layer Locking

**Layer 1: Redis Distributed Lock**

Before touching the database, we acquire a per-inventory-slot lock:

```typescript
const lockKey = `lock:inventory:${productId}:${warehouseId}`;
const lockToken = await acquireLock(lockKey, 5000); // 5s TTL
if (!lockToken) throw new Error("CONFLICT: Try again");
```

This uses Redis `SET NX PX` — atomic "set if not exists with expiry". Only one process holds the lock at a time. The 5s TTL ensures locks auto-release if the process crashes.

**Layer 2: PostgreSQL SELECT FOR UPDATE**

Inside the lock, we use a DB transaction with row-level pessimistic locking:

```sql
SELECT id, "totalStock", "reservedStock"
FROM "Inventory"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```

`FOR UPDATE` blocks any other transaction from reading or modifying this row until ours commits. This provides a hard guarantee even if the Redis lock fails.

**Why both?**
- Redis lock → fast early rejection, reduces DB contention
- DB lock → correctness guarantee even if Redis is temporarily unavailable

**Result:** Exactly one of two concurrent requests succeeds. The other receives HTTP 409.

---

## Reservation Expiry Mechanism

Reservations that aren't confirmed before `expiresAt` (10 minutes) must automatically release their stock.

### Vercel Cron Job (Production)

`vercel.json` configures a cron job running every minute:

```json
{
  "crons": [
    {
      "path": "/api/cron/expire-reservations",
      "schedule": "* * * * *"
    }
  ]
}
```

The endpoint:
1. Finds all PENDING reservations where `expiresAt < now()`
2. Batch updates status to `EXPIRED`
3. Decrements `reservedStock` for affected inventory slots — all in a single transaction

Protected by `CRON_SECRET` env var (Vercel sends the `Authorization` header automatically).

### Lazy Expiry (Belt and Suspenders)

`GET /api/reservations/:id` also checks expiry on read and expires inline if needed. This means a reservation is guaranteed to be expired by the time the user sees it, even if the cron missed a run.

---

## Idempotency

The `POST /api/reservations` endpoint supports `Idempotency-Key` header.

**How it works:**
1. Client sends a unique key (UUID) with each reservation request
2. On first request: process normally, store response in Redis with 24h TTL
3. On retry with same key: return cached response, skip side effects

**Why it matters:** If a client retries due to a network timeout, they won't accidentally create two reservations.

```typescript
// Redis key: "idempotency:{key}"
await redis.set(`idempotency:${key}`, JSON.stringify(response), { ex: 86400 });
```

---

## Deployment

### Vercel + Supabase + Upstash (recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel deploy --prod
```

Set these environment variables in Vercel dashboard:
- `DATABASE_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `CRON_SECRET`

After deploy, run migrations and seed:
```bash
# From local (with DATABASE_URL pointing to production)
npx prisma migrate deploy
npm run db:seed
```

---

## Trade-offs and Future Work

### What I'd do with more time

**1. Proper auth**
The current implementation uses `"guest-user"` as the userId. Production would integrate NextAuth or Clerk for real session management, and reservations would be scoped to authenticated users.

**2. WebSocket / SSE for live stock updates**
Currently, stock counts are stale once the page loads. A production system would use Server-Sent Events or Supabase Realtime to push stock updates to all connected clients. This matters especially on product listing pages during flash sales.

**3. Warehouse selection UX**
Rather than separate "Reserve" buttons per warehouse, a smarter UX would auto-select the warehouse with the fastest shipping estimate based on user location, with manual override.

**4. Quantity selector**
The current UI reserves exactly 1 unit. Multi-quantity support exists in the API and data model but isn't exposed in the frontend.

**5. Distributed lock fallback**
If Upstash Redis is unavailable, the current implementation falls through to the DB lock alone (which is still correct). A production system might want to circuit-break and return a 503 rather than relying solely on DB-level locking.

**6. Optimistic locking alternative**
Instead of `SELECT FOR UPDATE`, an optimistic locking approach using a version column (`UPDATE ... WHERE version = $expected`) would reduce lock contention under low-conflict workloads. Worth benchmarking.

**7. Monitoring**
Add Sentry error tracking and Datadog/Vercel Analytics dashboards for reservation success/failure rates, lock contention metrics, and expiry volumes.

### Deliberate simplifications

- **No email/notification on expiry** — would add a queue (BullMQ or Trigger.dev) in production
- **No pagination** on product listing — fine for demo, needs cursor-based pagination at scale
- **Cron granularity is 1 minute** — reservations can be "expired" for up to 60s before cleanup. Lazy expiry on read covers UX in the meantime.
