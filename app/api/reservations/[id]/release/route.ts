import { NextRequest, NextResponse } from "next/server";
import { ReservationService } from "@/services/reservation.service";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reservation = await ReservationService.releaseReservation(params.id);
    return NextResponse.json({ reservation, message: "Reservation released" });
  } catch (error) {
    const msg = (error as Error).message ?? "";

    if (msg.startsWith("NOT_FOUND")) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }
    if (msg.startsWith("INVALID_STATUS")) {
      return NextResponse.json(
        { error: msg.replace("INVALID_STATUS: ", "") },
        { status: 400 }
      );
    }

    console.error("[POST /api/reservations/:id/release]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
