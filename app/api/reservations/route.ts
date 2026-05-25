import { NextRequest, NextResponse } from "next/server";
import { ReservationService } from "@/services/reservation.service";
import { CreateReservationSchema } from "@/lib/schemas";
import { ZodError } from "zod";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const input = CreateReservationSchema.parse(body);

    // Extract optional idempotency key from headers
    const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;

    const reservation = await ReservationService.createReservation(
      input,
      idempotencyKey
    );

    return NextResponse.json(
      { reservation, message: "Reservation created successfully" },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Validation failed", details: error.flatten() },
        { status: 400 }
      );
    }

    const msg = (error as Error).message ?? "Unknown error";

    if (msg.startsWith("INSUFFICIENT_STOCK")) {
      return NextResponse.json(
        { error: msg.replace("INSUFFICIENT_STOCK: ", "") },
        { status: 409 }
      );
    }

    if (msg.startsWith("CONFLICT")) {
      return NextResponse.json(
        { error: msg.replace("CONFLICT: ", "") },
        { status: 409 }
      );
    }

    if (msg.startsWith("NOT_FOUND")) {
      return NextResponse.json(
        { error: msg.replace("NOT_FOUND: ", "") },
        { status: 404 }
      );
    }

    console.error("[POST /api/reservations]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
