"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Package,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";
import { useCountdown } from "@/hooks/useCountdown";
import type { ReservationWithDetails } from "@/types";

interface ReservationClientProps {
  initialReservation: ReservationWithDetails;
}

const STATUS_CONFIG = {
  PENDING: {
    label: "Active Reservation",
    color: "text-indigo-400",
    bg: "bg-indigo-900/20 border-indigo-700/40",
    dot: "bg-indigo-400",
  },
  CONFIRMED: {
    label: "Purchase Confirmed",
    color: "text-green-400",
    bg: "bg-green-900/20 border-green-700/40",
    dot: "bg-green-400",
  },
  RELEASED: {
    label: "Reservation Cancelled",
    color: "text-gray-400",
    bg: "bg-gray-800/40 border-gray-700/40",
    dot: "bg-gray-400",
  },
  EXPIRED: {
    label: "Reservation Expired",
    color: "text-red-400",
    bg: "bg-red-900/20 border-red-700/40",
    dot: "bg-red-400",
  },
};

export default function ReservationClient({
  initialReservation,
}: ReservationClientProps) {
  const router = useRouter();
  const [reservation, setReservation] = useState(initialReservation);
  const [loadingAction, setLoadingAction] = useState<"confirm" | "release" | null>(null);

  const countdown = useCountdown(reservation.expiresAt);
  const statusConfig = STATUS_CONFIG[reservation.status];
  const isActive = reservation.status === "PENDING" && !countdown.isExpired;

  // Auto-expire in UI when timer runs out
  const displayStatus =
    reservation.status === "PENDING" && countdown.isExpired
      ? "EXPIRED"
      : reservation.status;
  const displayConfig = STATUS_CONFIG[displayStatus];

  const handleConfirm = async () => {
    setLoadingAction("confirm");
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
      });
      const data = await res.json();

      if (res.status === 410) {
        toast.error("Reservation Expired", {
          description: "Your reservation has expired. Please start a new one.",
        });
        setReservation((r) => ({ ...r, status: "EXPIRED" }));
        return;
      }

      if (!res.ok) {
        toast.error("Confirmation Failed", { description: data.error });
        return;
      }

      setReservation(data.reservation);
      toast.success("Purchase Confirmed! 🎉", {
        description: `${reservation.product.name} is yours.`,
      });
    } catch {
      toast.error("Network Error", { description: "Could not connect to server" });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRelease = async () => {
    setLoadingAction("release");
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error("Failed to cancel", { description: data.error });
        return;
      }

      setReservation(data.reservation);
      toast.info("Reservation Cancelled", {
        description: "Stock has been returned to inventory.",
      });
    } catch {
      toast.error("Network Error", { description: "Could not connect to server" });
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push("/products")}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-300 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Products
      </button>

      {/* Status badge */}
      <div
        className={`flex items-center gap-3 border rounded-xl px-4 py-3 mb-6 ${displayConfig.bg}`}
      >
        <div className={`w-2 h-2 rounded-full ${displayConfig.dot} ${
          displayStatus === "PENDING" ? "pulse-ring" : ""
        }`} />
        <span className={`font-medium text-sm ${displayConfig.color}`}>
          {displayConfig.label}
        </span>
        <span className="text-xs text-gray-600 ml-auto font-mono">
          ID: {reservation.id.slice(0, 8).toUpperCase()}
        </span>
      </div>

      {/* Main card */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {/* Product info */}
        <div className="flex gap-4 p-6 border-b border-gray-800">
          {reservation.product.imageUrl && (
            <img
              src={reservation.product.imageUrl}
              alt={reservation.product.name}
              className="w-20 h-20 object-cover rounded-xl bg-gray-800"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono text-indigo-400 mb-1">
              {reservation.product.sku}
            </div>
            <h2 className="font-semibold text-white text-lg leading-tight mb-1">
              {reservation.product.name}
            </h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <MapPin className="w-3 h-3" />
              {reservation.warehouse.name}
              <span className="text-gray-700">·</span>
              <Package className="w-3 h-3" />
              Qty: {reservation.quantity}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-white">
              ₹{reservation.product.price.toLocaleString("en-IN")}
            </div>
          </div>
        </div>

        {/* Countdown timer (only for active reservations) */}
        {(displayStatus === "PENDING" || displayStatus === "EXPIRED") && (
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Clock className="w-4 h-4" />
                Time Remaining
              </div>
              <div
                className={`text-3xl font-mono font-bold tracking-wider ${
                  countdown.urgency === "critical"
                    ? "text-red-400 countdown-critical"
                    : countdown.urgency === "warning"
                    ? "text-amber-400"
                    : "text-white"
                }`}
              >
                {countdown.formatted}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-800 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-1000 ${
                  countdown.urgency === "critical"
                    ? "bg-red-500"
                    : countdown.urgency === "warning"
                    ? "bg-amber-500"
                    : "bg-indigo-500"
                }`}
                style={{
                  width: `${Math.max(
                    0,
                    (countdown.total / (10 * 60 * 1000)) * 100
                  )}%`,
                }}
              />
            </div>

            {countdown.urgency === "warning" && isActive && (
              <div className="mt-3 flex items-center gap-2 text-xs text-amber-400">
                <AlertTriangle className="w-3 h-3" />
                Hurry — reservation expires soon!
              </div>
            )}

            {countdown.isExpired && (
              <div className="mt-3 flex items-center gap-2 text-xs text-red-400">
                <XCircle className="w-3 h-3" />
                This reservation has expired. Stock has been returned.
              </div>
            )}
          </div>
        )}

        {/* Confirmed / Released / Expired states */}
        {displayStatus === "CONFIRMED" && (
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center gap-3 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <div>
                <div className="font-medium">Payment Confirmed</div>
                <div className="text-sm text-gray-500">
                  Confirmed at{" "}
                  {reservation.confirmedAt
                    ? new Date(reservation.confirmedAt).toLocaleString()
                    : "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {displayStatus === "RELEASED" && (
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center gap-3 text-gray-400">
              <XCircle className="w-5 h-5" />
              <div>
                <div className="font-medium">Reservation Cancelled</div>
                <div className="text-sm text-gray-500">
                  Stock returned to inventory
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="p-6">
          {isActive ? (
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                disabled={loadingAction !== null}
                className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 disabled:cursor-wait text-white font-medium py-3 px-6 rounded-xl transition-colors"
              >
                {loadingAction === "confirm" ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Confirming…
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Confirm Purchase
                  </>
                )}
              </button>
              <button
                onClick={handleRelease}
                disabled={loadingAction !== null}
                className="flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-wait text-gray-300 font-medium py-3 px-6 rounded-xl transition-colors"
              >
                {loadingAction === "release" ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <XCircle className="w-4 h-4" />
                    Cancel
                  </>
                )}
              </button>
            </div>
          ) : (
            <button
              onClick={() => router.push("/products")}
              className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-3 px-6 rounded-xl transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Browse Products
            </button>
          )}
        </div>
      </div>

      {/* Reservation metadata */}
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-600">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-3">
          <div className="text-gray-500 mb-1">Created</div>
          <div className="font-mono">
            {new Date(reservation.createdAt).toLocaleString()}
          </div>
        </div>
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-3">
          <div className="text-gray-500 mb-1">Expires</div>
          <div className="font-mono">
            {new Date(reservation.expiresAt).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}
