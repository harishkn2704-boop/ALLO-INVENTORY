import { ReservationStatus } from "@prisma/client";

export type { ReservationStatus };

export interface ProductWithInventory {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  price: number;
  imageUrl: string | null;
  inventories: InventoryWithWarehouse[];
}

export interface InventoryWithWarehouse {
  id: string;
  productId: string;
  warehouseId: string;
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
}

export interface WarehouseWithInventory {
  id: string;
  name: string;
  location: string;
  inventories: {
    productId: string;
    totalStock: number;
    reservedStock: number;
    availableStock: number;
  }[];
}

export interface ReservationWithDetails {
  id: string;
  userId: string;
  productId: string;
  warehouseId: string;
  quantity: number;
  status: ReservationStatus;
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  product: {
    id: string;
    name: string;
    sku: string;
    price: number;
    imageUrl: string | null;
  };
  warehouse: {
    id: string;
    name: string;
    location: string;
  };
}

export interface ApiError {
  error: string;
  code?: string;
}

export interface CreateReservationRequest {
  productId: string;
  warehouseId: string;
  quantity: number;
  userId?: string;
}

export interface CreateReservationResponse {
  reservation: ReservationWithDetails;
  message: string;
}
