import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import ProductCard from "@/components/product/ProductCard";
import { Package } from "lucide-react";

async function getProducts() {
  const products = await prisma.product.findMany({
    include: {
      inventories: {
        include: { warehouse: true },
        orderBy: { warehouse: { name: "asc" } },
      },
    },
    orderBy: { name: "asc" },
  });

  return products.map((p) => ({
    ...p,
    price: Number(p.price),
    inventories: p.inventories.map((inv) => ({
      ...inv,
      availableStock: inv.totalStock - inv.reservedStock,
    })),
  }));
}

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <div>
      {/* Page header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <Package className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Products</h1>
            <p className="text-sm text-gray-500">{products.length} items across all warehouses</p>
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Total Products", value: products.length },
          {
            label: "Total Stock",
            value: products.reduce(
              (sum, p) => sum + p.inventories.reduce((s, i) => s + i.totalStock, 0),
              0
            ),
          },
          {
            label: "Available Now",
            value: products.reduce(
              (sum, p) => sum + p.inventories.reduce((s, i) => s + i.availableStock, 0),
              0
            ),
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-gray-900 border border-gray-800 rounded-xl p-4"
          >
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-xs text-gray-500 mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Product grid */}
      <Suspense fallback={<div className="text-gray-500">Loading products…</div>}>
        {products.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            No products found. Run the seed script to add demo data.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </Suspense>
    </div>
  );
}
