import { NextRequest, NextResponse } from "next/server";
import { ReservationService } from "@/services/reservation.service";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reservation = await ReservationService.confirmReservation(params.id);
    return NextResponse.json({ reservation, message: "Reservation confirmed" });
  } catch (error) {
    const msg = (error as Error).message ?? "";

    if (msg.startsWith("EXPIRED")) {
      return NextResponse.json(
        { error: "Reservation has expired. Please start a new reservation." },
        { status: 410 }
      );
    }
    if (msg.startsWith("NOT_FOUND")) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }
    if (msg.startsWith("INVALID_STATUS")) {
      return NextResponse.json(
        { error: msg.replace("INVALID_STATUS: ", "") },
        { status: 400 }
      );
    }

    console.error("[POST /api/reservations/:id/confirm]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
