"use client";

import { useState, useEffect } from "react";

interface CountdownResult {
  minutes: number;
  seconds: number;
  total: number; // total ms remaining
  isExpired: boolean;
  formatted: string; // "MM:SS"
  urgency: "normal" | "warning" | "critical";
}

export function useCountdown(expiresAt: string | Date): CountdownResult {
  const expiry = new Date(expiresAt).getTime();

  const calculate = (): CountdownResult => {
    const now = Date.now();
    const total = expiry - now;

    if (total <= 0) {
      return {
        minutes: 0,
        seconds: 0,
        total: 0,
        isExpired: true,
        formatted: "00:00",
        urgency: "critical",
      };
    }

    const minutes = Math.floor((total / 1000 / 60) % 60);
    const seconds = Math.floor((total / 1000) % 60);

    const urgency =
      total <= 60_000 ? "critical" : total <= 180_000 ? "warning" : "normal";

    return {
      minutes,
      seconds,
      total,
      isExpired: false,
      formatted: `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
      urgency,
    };
  };

  const [state, setState] = useState<CountdownResult>(calculate);

  useEffect(() => {
    setState(calculate());
    const interval = setInterval(() => {
      const next = calculate();
      setState(next);
      if (next.isExpired) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt]);

  return state;
}
