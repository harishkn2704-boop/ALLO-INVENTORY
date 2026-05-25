import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      include: {
        inventories: {
          select: {
            productId: true,
            totalStock: true,
            reservedStock: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const result = warehouses.map((w) => ({
      ...w,
      inventories: w.inventories.map((inv) => ({
        ...inv,
        availableStock: inv.totalStock - inv.reservedStock,
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/warehouses]", error);
    return NextResponse.json({ error: "Failed to fetch warehouses" }, { status: 500 });
  }
}
