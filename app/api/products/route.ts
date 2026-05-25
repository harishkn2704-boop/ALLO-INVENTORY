import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: {
        inventories: {
          include: { warehouse: true },
          orderBy: { warehouse: { name: "asc" } },
        },
      },
      orderBy: { name: "asc" },
    });

    const result = products.map((p) => ({
      ...p,
      price: Number(p.price),
      inventories: p.inventories.map((inv) => ({
        ...inv,
        availableStock: inv.totalStock - inv.reservedStock,
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("[GET /api/products]", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
