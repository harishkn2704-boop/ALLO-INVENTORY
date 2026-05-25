import { NextRequest, NextResponse } from "next/server";
import { ReservationService } from "@/services/reservation.service";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reservation = await ReservationService.getReservation(params.id);
    return NextResponse.json(reservation);
  } catch (error) {
    const msg = (error as Error).message ?? "";
    if (msg.startsWith("NOT_FOUND")) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }
    console.error("[GET /api/reservations/:id]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
