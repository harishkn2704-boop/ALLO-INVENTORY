import { z } from "zod";

export const CreateReservationSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  warehouseId: z.string().min(1, "Warehouse ID is required"),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(100),
  userId: z.string().optional().default("guest-user"),
});

export const ReservationIdSchema = z.object({
  id: z.string().min(1, "Reservation ID is required"),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;
