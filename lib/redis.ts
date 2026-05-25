import { Redis } from "@upstash/redis";

// Upstash Redis client — REST-based, works in edge & serverless
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const LOCK_TTL_MS = 5000; // 5 seconds max lock hold time

/**
 * Acquire a distributed Redis lock for a specific inventory key.
 * Uses SET NX (set if not exists) for atomic acquisition.
 *
 * @param key  - unique lock key, e.g. "lock:inventory:productId:warehouseId"
 * @param ttlMs - how long the lock lives in milliseconds (default 5s)
 * @returns lockToken string if acquired, null if already locked
 */
export async function acquireLock(
  key: string,
  ttlMs: number = LOCK_TTL_MS
): Promise<string | null> {
  const token = `${Date.now()}-${Math.random()}`;
  // SET key token NX PX ttl — atomic "set if not exists with expiry"
  const result = await redis.set(key, token, {
    nx: true,
    px: ttlMs,
  });
  return result === "OK" ? token : null;
}

/**
 * Release a lock only if we own it (compare-and-delete via Lua script).
 * This prevents accidentally releasing a lock acquired by another process
 * after our lock TTL expired.
 */
export async function releaseLock(key: string, token: string): Promise<void> {
  // Lua script for atomic compare-and-delete
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  await redis.eval(luaScript, [key], [token]);
}

/**
 * Build the lock key for a specific product+warehouse inventory slot.
 */
export function inventoryLockKey(productId: string, warehouseId: string): string {
  return `lock:inventory:${productId}:${warehouseId}`;
}

/**
 * Store idempotency key response in Redis with 24hr TTL.
 */
export async function setIdempotencyResponse(
  key: string,
  response: unknown
): Promise<void> {
  await redis.set(`idempotency:${key}`, JSON.stringify(response), {
    ex: 86400, // 24 hours
  });
}

/**
 * Retrieve a cached idempotency response, or null if not found.
 */
export async function getIdempotencyResponse(
  key: string
): Promise<unknown | null> {
  const raw = await redis.get<string>(`idempotency:${key}`);
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return raw;
  }
}
