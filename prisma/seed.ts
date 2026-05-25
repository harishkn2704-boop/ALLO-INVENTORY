import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clear existing data
  await prisma.reservation.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.idempotencyKey.deleteMany();

  // Create warehouses
  const warehouses = await Promise.all([
    prisma.warehouse.create({
      data: { name: "Chennai Hub", location: "Chennai, Tamil Nadu" },
    }),
    prisma.warehouse.create({
      data: { name: "Mumbai Central", location: "Mumbai, Maharashtra" },
    }),
    prisma.warehouse.create({
      data: { name: "Delhi North", location: "Delhi, NCR" },
    }),
  ]);

  console.log(`✅ Created ${warehouses.length} warehouses`);

  // Create products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Wireless Noise-Cancelling Headphones",
        description: "Premium over-ear headphones with 30hr battery life",
        sku: "AUDIO-WNC-001",
        price: 8999,
        imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Mechanical Keyboard TKL",
        description: "Tenkeyless mechanical keyboard with RGB backlight",
        sku: "KB-MECH-TKL-002",
        price: 5499,
        imageUrl: "https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "USB-C Hub 7-in-1",
        description: "Multiport adapter with 4K HDMI, USB 3.0, SD card",
        sku: "HUB-USBC-7IN1-003",
        price: 2999,
        imageUrl: "https://images.unsplash.com/photo-1625842268584-8f3296236761?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "Ergonomic Vertical Mouse",
        description: "Wireless ergonomic mouse reducing wrist strain",
        sku: "MOUSE-VERT-004",
        price: 3499,
        imageUrl: "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400",
      },
    }),
    prisma.product.create({
      data: {
        name: "27\" 4K Monitor",
        description: "IPS panel, 144Hz, HDR400, USB-C power delivery",
        sku: "MON-27-4K-005",
        price: 34999,
        imageUrl: "https://images.unsplash.com/photo-1527443224154-c4a3942d3acf?w=400",
      },
    }),
  ]);

  console.log(`✅ Created ${products.length} products`);

  // Create inventory with varied stock levels
  const inventoryData = [
    // Headphones
    { productId: products[0].id, warehouseId: warehouses[0].id, totalStock: 5 },
    { productId: products[0].id, warehouseId: warehouses[1].id, totalStock: 12 },
    { productId: products[0].id, warehouseId: warehouses[2].id, totalStock: 3 },
    // Keyboard
    { productId: products[1].id, warehouseId: warehouses[0].id, totalStock: 8 },
    { productId: products[1].id, warehouseId: warehouses[1].id, totalStock: 2 },
    { productId: products[1].id, warehouseId: warehouses[2].id, totalStock: 15 },
    // USB Hub
    { productId: products[2].id, warehouseId: warehouses[0].id, totalStock: 20 },
    { productId: products[2].id, warehouseId: warehouses[2].id, totalStock: 7 },
    // Mouse
    { productId: products[3].id, warehouseId: warehouses[0].id, totalStock: 1 }, // scarce!
    { productId: products[3].id, warehouseId: warehouses[1].id, totalStock: 4 },
    // Monitor
    { productId: products[4].id, warehouseId: warehouses[0].id, totalStock: 3 },
    { productId: products[4].id, warehouseId: warehouses[1].id, totalStock: 6 },
    { productId: products[4].id, warehouseId: warehouses[2].id, totalStock: 2 },
  ];

  await prisma.inventory.createMany({ data: inventoryData });
  console.log(`✅ Created ${inventoryData.length} inventory records`);

  console.log("🎉 Seed complete!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
