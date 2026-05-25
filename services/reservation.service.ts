/**
 * ReservationService
 *
 * CONCURRENCY STRATEGY:
 * We use a two-layer approach for correctness under concurrent requests:
 *
 * Layer 1 — Redis Distributed Lock:
 *   Before touching the DB, we acquire a per-inventory-slot Redis lock
 *   (SET NX with 5s TTL). This serialises concurrent reservation attempts
 *   for the same product+warehouse at the application layer, keeping
 *   DB contention low.
 *
 * Layer 2 — PostgreSQL Transaction + SELECT FOR UPDATE:
 *   Inside the lock, we run a DB transaction with SELECT FOR UPDATE on the
 *   Inventory row. This row-level pessimistic lock prevents any other
 *   transaction from reading or modifying that row until ours commits.
 *   Combined with the Redis lock, this guarantees exactly-once reservation
 *   even across multiple app instances or if Redis lock acquisition races.
 *
 * The double-layer means:
 *   - Redis lock → fast early rejection, reduces DB pressure
 *   - DB lock     → correctness guarantee even if Redis is unavailable
 */

import { prisma } from "@/lib/prisma";
import {
  acquireLock,
  releaseLock,
  inventoryLockKey,
  getIdempotencyResponse,
  setIdempotencyResponse,
} from "@/lib/redis";
import { ReservationStatus } from "@prisma/client";
import type { CreateReservationInput } from "@/lib/schemas";
import type { ReservationWithDetails } from "@/types";

const RESERVATION_TTL_MINUTES = 10;

function formatReservation(r: any): ReservationWithDetails {
  return {
    ...r,
    price: Number(r.product?.price ?? 0),
    expiresAt: r.expiresAt.toISOString(),
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    releasedAt: r.releasedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
    product: {
      ...r.product,
      price: Number(r.product.price),
    },
  };
}

export class ReservationService {
  /**
   * Create a new reservation with full concurrency safety.
   */
  static async createReservation(
    input: CreateReservationInput,
    idempotencyKey?: string
  ): Promise<ReservationWithDetails> {
    // ── Idempotency check ────────────────────────────────────────────────────
    if (idempotencyKey) {
      const cached = await getIdempotencyResponse(idempotencyKey);
      if (cached) return cached as ReservationWithDetails;
    }

    const { productId, warehouseId, quantity, userId } = input;
    const lockKey = inventoryLockKey(productId, warehouseId);

    // ── Layer 1: Acquire Redis distributed lock ──────────────────────────────
    const lockToken = await acquireLock(lockKey, 5000);
    if (!lockToken) {
      throw new Error("CONFLICT: Another reservation is in progress. Please try again.");
    }

    try {
      // ── Layer 2: PostgreSQL transaction + SELECT FOR UPDATE ────────────────
      const reservation = await prisma.$transaction(async (tx) => {
        // Raw SQL SELECT FOR UPDATE — row-level pessimistic lock.
        // No other transaction can read or modify this inventory row
        // until this transaction commits or rolls back.
        const [inventory] = await tx.$queryRaw<
          Array<{
            id: string;
            totalStock: number;
            reservedStock: number;
          }>
        >`
          SELECT id, "totalStock", "reservedStock"
          FROM "Inventory"
          WHERE "productId" = ${productId}
            AND "warehouseId" = ${warehouseId}
          FOR UPDATE
        `;

        if (!inventory) {
          throw new Error("NOT_FOUND: Inventory record not found for this product/warehouse");
        }

        const availableStock = inventory.totalStock - inventory.reservedStock;

        if (availableStock < quantity) {
          throw new Error(
            `INSUFFICIENT_STOCK: Only ${availableStock} units available, requested ${quantity}`
          );
        }

        // Increment reservedStock atomically within the transaction
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { reservedStock: { increment: quantity } },
        });

        const expiresAt = new Date(
          Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000
        );

        // Create the reservation record
        const newReservation = await tx.reservation.create({
          data: {
            userId,
            productId,
            warehouseId,
            quantity,
            status: "PENDING",
            expiresAt,
          },
          include: {
            product: true,
            warehouse: true,
          },
        });

        return newReservation;
      });

      const formatted = formatReservation(reservation);

      // Cache the response for idempotency
      if (idempotencyKey) {
        await setIdempotencyResponse(idempotencyKey, formatted);
      }

      return formatted;
    } finally {
      // Always release the Redis lock, even on error
      await releaseLock(lockKey, lockToken);
    }
  }

  /**
   * Confirm a reservation (payment succeeded).
   * Returns 410-style error if expired.
   */
  static async confirmReservation(id: string): Promise<ReservationWithDetails> {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (!reservation) throw new Error("NOT_FOUND: Reservation not found");

    if (reservation.status === "EXPIRED" || new Date() > reservation.expiresAt) {
      // Mark as expired and release stock if not already done
      if (reservation.status === "PENDING") {
        await prisma.$transaction([
          prisma.reservation.update({
            where: { id },
            data: { status: "EXPIRED" },
          }),
          prisma.inventory.updateMany({
            where: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
            data: { reservedStock: { decrement: reservation.quantity } },
          }),
        ]);
      }
      throw new Error("EXPIRED: Reservation has expired");
    }

    if (reservation.status !== "PENDING") {
      throw new Error(`INVALID_STATUS: Reservation is ${reservation.status}`);
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Confirm reservation: convert reserved → permanently decremented
      const confirmed = await tx.reservation.update({
        where: { id },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
        include: { product: true, warehouse: true },
      });

      // Decrement totalStock and release the reservedStock hold
      await tx.inventory.updateMany({
        where: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
        data: {
          totalStock: { decrement: reservation.quantity },
          reservedStock: { decrement: reservation.quantity },
        },
      });

      return confirmed;
    });

    return formatReservation(updated);
  }

  /**
   * Release a reservation early (payment failed / user cancelled).
   */
  static async releaseReservation(id: string): Promise<ReservationWithDetails> {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (!reservation) throw new Error("NOT_FOUND: Reservation not found");
    if (reservation.status !== "PENDING") {
      throw new Error(`INVALID_STATUS: Reservation is already ${reservation.status}`);
    }

    const updated = await prisma.$transaction([
      prisma.reservation.update({
        where: { id },
        data: { status: "RELEASED", releasedAt: new Date() },
        include: { product: true, warehouse: true },
      }),
      prisma.inventory.updateMany({
        where: {
          productId: reservation.productId,
          warehouseId: reservation.warehouseId,
        },
        data: { reservedStock: { decrement: reservation.quantity } },
      }),
    ]);

    return formatReservation(updated[0]);
  }

  /**
   * Expire all pending reservations past their expiresAt.
   * Called by the cron job or lazy-expiry path.
   */
  static async expireStaleReservations(): Promise<number> {
    const expired = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
      select: { id: true, productId: true, warehouseId: true, quantity: true },
    });

    if (expired.length === 0) return 0;

    await prisma.$transaction(async (tx) => {
      // Batch update status to EXPIRED
      await tx.reservation.updateMany({
        where: { id: { in: expired.map((r) => r.id) } },
        data: { status: "EXPIRED" },
      });

      // Release reserved stock for each unique inventory slot
      const slots = new Map<string, { productId: string; warehouseId: string; quantity: number }>();
      for (const r of expired) {
        const key = `${r.productId}:${r.warehouseId}`;
        const existing = slots.get(key);
        slots.set(key, {
          productId: r.productId,
          warehouseId: r.warehouseId,
          quantity: (existing?.quantity ?? 0) + r.quantity,
        });
      }

      for (const slot of slots.values()) {
        await tx.inventory.updateMany({
          where: {
            productId: slot.productId,
            warehouseId: slot.warehouseId,
          },
          data: { reservedStock: { decrement: slot.quantity } },
        });
      }
    });

    return expired.length;
  }

  /**
   * Get a single reservation by ID, with lazy expiry check.
   */
  static async getReservation(id: string): Promise<ReservationWithDetails> {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });

    if (!reservation) throw new Error("NOT_FOUND: Reservation not found");

    // Lazy expiry: if it's past expiresAt and still PENDING, expire it now
    if (reservation.status === "PENDING" && new Date() > reservation.expiresAt) {
      await prisma.$transaction([
        prisma.reservation.update({
          where: { id },
          data: { status: "EXPIRED" },
        }),
        prisma.inventory.updateMany({
          where: {
            productId: reservation.productId,
            warehouseId: reservation.warehouseId,
          },
          data: { reservedStock: { decrement: reservation.quantity } },
        }),
      ]);
      reservation.status = "EXPIRED";
    }

    return formatReservation(reservation);
  }
}
