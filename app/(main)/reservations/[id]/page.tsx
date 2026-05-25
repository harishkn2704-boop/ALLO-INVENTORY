import { notFound } from "next/navigation";
import { ReservationService } from "@/services/reservation.service";
import ReservationClient from "@/components/reservation/ReservationClient";

interface Props {
  params: { id: string };
}

export default async function ReservationPage({ params }: Props) {
  let reservation;
  try {
    reservation = await ReservationService.getReservation(params.id);
  } catch {
    notFound();
  }

  return <ReservationClient initialReservation={reservation} />;
}
