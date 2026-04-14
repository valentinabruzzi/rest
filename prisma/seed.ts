import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomBytes } from "crypto";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  }),
});

function token() {
  return randomBytes(16).toString("hex");
}

async function main() {
  await prisma.payment.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productOption.deleteMany();
  await prisma.productOptionGroup.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.table.deleteMany();
  await prisma.restaurant.deleteMany();

  const restaurant = await prisma.restaurant.create({
    data: {
      name: "Bistrot Bordeaux",
      slug: "bistrot-bordeaux",
      logoUrl: null,
      primaryColor: "#6E0F1F",
      secondaryColor: "#4E0915",
      currency: "eur",
      active: true,
      allowPayAtCounter: true,
      serviceFeePercent: 0,
    },
  });

  const tables = await Promise.all(
    Array.from({ length: 16 }, (_, i) =>
      prisma.table.create({
        data: {
          restaurantId: restaurant.id,
          tableNumber: String(i + 1),
          qrCodeToken: token(),
          active: true,
        },
      })
    )
  );

  const catNames = [
    "Coffee",
    "Breakfast",
    "Cocktails",
    "Wine",
    "Beer",
    "Soft Drinks",
    "Sandwiches",
    "Salads",
    "Pasta",
    "Desserts",
  ];

  const categories: Record<string, { id: string }> = {};
  for (let i = 0; i < catNames.length; i++) {
    const c = await prisma.category.create({
      data: {
        restaurantId: restaurant.id,
        name: catNames[i],
        sortOrder: i,
        active: true,
      },
    });
    categories[catNames[i]] = c;
  }

  const img = (path: string) =>
    `https://images.unsplash.com/${path}?w=400&h=400&fit=crop&q=80`;

  type P = {
    cat: string;
    name: string;
    description: string;
    price: number;
    image?: string;
    volumeLabel?: string;
    tags?: string[];
    allergens?: string[];
    options?: { name: string; required: boolean; multiple: boolean; opts: { name: string; delta: number }[] }[];
  };

  const products: P[] = [
    {
      cat: "Coffee",
      name: "Espresso",
      description: "Double ristretto, La Marzocco pull. Bold, silky crema.",
      price: 320,
      image: img("photo-1506617420156-8e4536971650"),
      volumeLabel: "40 ml",
      tags: ["Bestseller"],
    },
    {
      cat: "Coffee",
      name: "Cappuccino",
      description: "Microfoam over double espresso. Whole milk, lightly sweet.",
      price: 480,
      image: img("photo-1572442388792-76a1d2e93887"),
      volumeLabel: "180 ml",
      options: [
        {
          name: "Milk",
          required: false,
          multiple: false,
          opts: [
            { name: "Whole", delta: 0 },
            { name: "Oat", delta: 50 },
          ],
        },
      ],
    },
    {
      cat: "Coffee",
      name: "Filter — Ethiopia",
      description: "V60. Floral, bergamot, clean finish.",
      price: 520,
      image: img("photo-1497935586351-b67a49e012bf"),
      volumeLabel: "250 ml",
    },
    {
      cat: "Breakfast",
      name: "Butter Croissant",
      description: "Laminated overnight. Served warm.",
      price: 420,
      image: img("photo-1555507036-ab1f4038808a"),
      tags: ["Vegetarian"],
      allergens: ["Gluten", "Dairy", "Eggs"],
    },
    {
      cat: "Breakfast",
      name: "Truffle Omelette",
      description: "Three eggs, Comté, black truffle butter, chives.",
      price: 1680,
      image: img("photo-1525351484163-7529414344d8"),
      options: [
        {
          name: "Cooking",
          required: true,
          multiple: false,
          opts: [
            { name: "Soft", delta: 0 },
            { name: "Medium", delta: 0 },
            { name: "Well", delta: 0 },
          ],
        },
      ],
      allergens: ["Eggs", "Dairy"],
    },
    {
      cat: "Cocktails",
      name: "Negroni",
      description: "Gin, Campari, vermouth rosso. Orange peel.",
      price: 1400,
      image: img("photo-1546171753-97d44fef965c"),
      volumeLabel: "90 ml",
      tags: ["Signature"],
    },
    {
      cat: "Cocktails",
      name: "Old Fashioned",
      description: "Bourbon, demerara, Angostura, expressed citrus.",
      price: 1500,
      image: img("photo-1470337458703-46ad1756a187"),
      volumeLabel: "100 ml",
    },
    {
      cat: "Cocktails",
      name: "Spritz Bianco",
      description: "Prosecco, bitter bianco, soda, rosemary.",
      price: 1100,
      image: img("photo-1560518883-ce09059eeffa"),
      volumeLabel: "180 ml",
      options: [
        {
          name: "Ice",
          required: true,
          multiple: false,
          opts: [
            { name: "With ice", delta: 0 },
            { name: "Light ice", delta: 0 },
          ],
        },
      ],
    },
    {
      cat: "Wine",
      name: "Bordeaux Supérieur — Château Lalande",
      description: "Merlot-led. Plum, graphite, fine tannins.",
      price: 980,
      image: img("photo-1510817571411-7caa3d0af34f"),
      volumeLabel: "125 ml",
      tags: ["Sommelier pick"],
    },
    {
      cat: "Wine",
      name: "Sancerre — Domaine Vacheron",
      description: "Sauvignon Blanc. Flint, citrus, mineral line.",
      price: 1120,
      image: img("photo-1510817571411-7caa3d0af34f"),
      volumeLabel: "125 ml",
    },
    {
      cat: "Beer",
      name: "Blonde — Brasserie de la Senne",
      description: "Belgian pale. Dry, herbal hop, crisp.",
      price: 720,
      image: img("photo-1436076863939-06870fe6cabe"),
      volumeLabel: "330 ml",
    },
    {
      cat: "Soft Drinks",
      name: "Sparkling Water",
      description: "San Pellegrino, chilled.",
      price: 480,
      image: img("photo-1548839140-29d43a33c4c4"),
      volumeLabel: "750 ml",
    },
    {
      cat: "Sandwiches",
      name: "Jambon-Beurre",
      description: "Paris ham, cultured butter, baguette du jour.",
      price: 1180,
      image: img("photo-1528735602780-2552fd46c7af"),
      tags: ["Bestseller"],
      allergens: ["Gluten", "Dairy"],
    },
    {
      cat: "Sandwiches",
      name: "Mortadella & Pistachio",
      description: "Mortadella IGP, pistachio crema, focaccia.",
      price: 1320,
      image: img("photo-1553909489-cd47e0907980"),
      allergens: ["Gluten", "Nuts"],
    },
    {
      cat: "Salads",
      name: "Endive & Roquefort",
      description: "Belgian endive, walnuts, pear, mustard vinaigrette.",
      price: 1280,
      image: img("photo-1512621776951-a57141f2eefd"),
      tags: ["Vegetarian"],
      allergens: ["Dairy", "Nuts"],
    },
    {
      cat: "Pasta",
      name: "Tagliatelle al Ragù",
      description: "Slow-cooked beef & pork, Parmigiano Reggiano.",
      price: 1980,
      image: img("photo-1621996346565-e3dbc646d9a9"),
      options: [
        {
          name: "Extra",
          required: false,
          multiple: true,
          opts: [
            { name: "Extra Parmigiano", delta: 200 },
            { name: "Chili oil", delta: 0 },
          ],
        },
      ],
      allergens: ["Gluten", "Dairy"],
    },
    {
      cat: "Pasta",
      name: "Cacio e Pepe",
      description: "Pecorino Romano, black pepper, house tonnarelli.",
      price: 1760,
      image: img("photo-1612874742237-6526221588e2"),
      tags: ["Vegetarian"],
      allergens: ["Gluten", "Dairy"],
    },
    {
      cat: "Desserts",
      name: "Tarte Tatin",
      description: "Caramelised apples, crème fraîche.",
      price: 980,
      image: img("photo-1565958011703-44f8e33d7aaf"),
      allergens: ["Gluten", "Dairy", "Eggs"],
    },
    {
      cat: "Desserts",
      name: "Dark Chocolate Ganache",
      description: "Valrhona 70%, fleur de sel, olive oil.",
      price: 890,
      image: img("photo-1606313564200-e75d5e3047d9"),
      tags: ["Vegetarian"],
      allergens: ["Dairy"],
    },
  ];

  let sort = 0;
  for (const p of products) {
    const cat = categories[p.cat];
    if (!cat) continue;
    const product = await prisma.product.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: cat.id,
        name: p.name,
        description: p.description,
        price: p.price,
        imageUrl: p.image ?? null,
        active: true,
        allergens: p.allergens ?? [],
        tags: p.tags ?? [],
        sortOrder: sort++,
        volumeLabel: p.volumeLabel,
      },
    });
    if (p.options) {
      for (const og of p.options) {
        const group = await prisma.productOptionGroup.create({
          data: {
            productId: product.id,
            name: og.name,
            required: og.required,
            multiple: og.multiple,
          },
        });
        for (const o of og.opts) {
          await prisma.productOption.create({
            data: {
              groupId: group.id,
              name: o.name,
              priceDelta: o.delta,
            },
          });
        }
      }
    }
  }

  console.log("Seed OK:", restaurant.slug);
  console.log("Sample table 12 token — query by number in app; tokens are in DB.");
  const t12 = tables[11];
  if (t12) console.log("Table 12 qrCodeToken:", t12.qrCodeToken);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
