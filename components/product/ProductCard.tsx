"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShoppingCart, MapPin, Package, AlertCircle } from "lucide-react";
import type { ProductWithInventory } from "@/types";

interface ProductCardProps {
  product: ProductWithInventory;
}

export default function ProductCard({ product }: ProductCardProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null); // warehouseId being reserved

  const totalAvailable = product.inventories.reduce(
    (sum, inv) => sum + inv.availableStock,
    0
  );

  const handleReserve = async (warehouseId: string, warehouseName: string) => {
    setLoading(warehouseId);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `${product.id}-${warehouseId}-${Date.now()}`,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId,
          quantity: 1,
          userId: "guest-user",
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        toast.error("Out of Stock", {
          description: data.error,
        });
        return;
      }

      if (!res.ok) {
        toast.error("Reservation Failed", {
          description: data.error || "Something went wrong",
        });
        return;
      }

      toast.success("Reserved!", {
        description: `1x ${product.name} held for 10 minutes`,
      });

      router.push(`/reservations/${data.reservation.id}`);
    } catch {
      toast.error("Network Error", {
        description: "Could not connect to the server",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-indigo-500/40 transition-all duration-200 group">
      {/* Product image */}
      <div className="relative h-48 bg-gray-800 overflow-hidden">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-12 h-12 text-gray-700" />
          </div>
        )}
        {/* Stock badge */}
        <div
          className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium ${
            totalAvailable === 0
              ? "bg-red-900/80 text-red-300 border border-red-700"
              : totalAvailable <= 3
              ? "bg-amber-900/80 text-amber-300 border border-amber-700"
              : "bg-green-900/80 text-green-300 border border-green-700"
          }`}
        >
          {totalAvailable === 0
            ? "Out of Stock"
            : totalAvailable <= 3
            ? `Only ${totalAvailable} left`
            : `${totalAvailable} available`}
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="mb-1">
          <span className="text-xs font-mono text-indigo-400">{product.sku}</span>
        </div>
        <h3 className="font-semibold text-white text-lg leading-tight mb-1">
          {product.name}
        </h3>
        {product.description && (
          <p className="text-sm text-gray-500 mb-4 line-clamp-2">
            {product.description}
          </p>
        )}
        <div className="text-xl font-bold text-white mb-5">
          ₹{product.price.toLocaleString("en-IN")}
        </div>

        {/* Warehouse stock breakdown */}
        <div className="space-y-2 mb-5">
          <div className="text-xs text-gray-600 uppercase tracking-wider font-medium">
            Stock by Warehouse
          </div>
          {product.inventories.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between bg-gray-800/60 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <MapPin className="w-3 h-3 text-gray-500 shrink-0" />
                <span className="text-sm text-gray-300 truncate">
                  {inv.warehouse.name}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm font-medium ${
                    inv.availableStock === 0
                      ? "text-red-400"
                      : inv.availableStock <= 2
                      ? "text-amber-400"
                      : "text-green-400"
                  }`}
                >
                  {inv.availableStock} avail
                </span>
                <button
                  onClick={() => handleReserve(inv.warehouseId, inv.warehouse.name)}
                  disabled={inv.availableStock === 0 || loading !== null}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                    inv.availableStock === 0
                      ? "bg-gray-700 text-gray-500 cursor-not-allowed"
                      : loading === inv.warehouseId
                      ? "bg-indigo-700 text-indigo-200 cursor-wait"
                      : "bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
                  }`}
                >
                  {loading === inv.warehouseId ? (
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
                      Reserving…
                    </span>
                  ) : inv.availableStock === 0 ? (
                    "Unavailable"
                  ) : (
                    <span className="flex items-center gap-1">
                      <ShoppingCart className="w-3 h-3" />
                      Reserve
                    </span>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {totalAvailable <= 3 && totalAvailable > 0 && (
          <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-900/20 border border-amber-800/40 rounded-lg px-3 py-2">
            <AlertCircle className="w-3 h-3 shrink-0" />
            Low stock — reservations expire in 10 minutes
          </div>
        )}
      </div>
    </div>
  );
}
