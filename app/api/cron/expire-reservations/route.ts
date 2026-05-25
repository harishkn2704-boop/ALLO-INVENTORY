import { NextRequest, NextResponse } from "next/server";
import { ReservationService } from "@/services/reservation.service";

/**
 * Vercel Cron endpoint — runs every minute via vercel.json cron config.
 * Expires all PENDING reservations that have passed their expiresAt.
 *
 * Protected by CRON_SECRET env var — Vercel sets Authorization header
 * automatically when invoking cron routes.
 */
export async function GET(req: NextRequest) {
  // Validate cron secret to prevent unauthorized calls
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const count = await ReservationService.expireStaleReservations();
    console.log(`[CRON] Expired ${count} stale reservations at ${new Date().toISOString()}`);
    return NextResponse.json({
      success: true,
      expiredCount: count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CRON /api/cron/expire-reservations]", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
