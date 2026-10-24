
export type MenuVariant = {
  size: "Regular" | "Large";
  price: number;
};

export type AvailabilityStatus = "AVAILABLE" | "SOLD_OUT" | "COMING_SOON";

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  variants: MenuVariant[];
  available: boolean;
  availabilityStatus?: AvailabilityStatus;
  featured?: boolean;
  image?: string;
  description?: string;
  archived?: boolean;
};

// Large = (Regular × 2) - ₹10
export const calculateLargePrice = (
  regularPrice: number
): number => {
  return regularPrice * 2 - 10;
};

export const createVariants = (
  regularPrice: number,
  largePrice?: number
): MenuVariant[] => [
  {
    size: "Regular",
    price: regularPrice,
  },
  {
    size: "Large",
    price: largePrice ?? calculateLargePrice(regularPrice),
  },
];

export const categories = [
  "Liquid Therapy",
  "Fruitopia",
  "Guilty Pleasures",
  "Bread & Bite",
];

export const getCategorySlug = (category: string): string =>
  category.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export const menuItems: MenuItem[] = [
  // ============================
  // LIQUID THERAPY
  // ============================

  {
    id: "drink-banana",
    name: "Banana",
    category: "Liquid Therapy",
    variants: createVariants(129),
    available: true,
  },
  {
    id: "drink-date",
    name: "Date",
    category: "Liquid Therapy",
    variants: createVariants(139),
    available: true,
  },
  {
    id: "drink-date-&-banana",
    name: "Date & Banana",
    category: "Liquid Therapy",
    variants: createVariants(149),
    available: true,
    featured: true,
  },
  {
    id: "drink-mango",
    name: "Mango",
    category: "Liquid Therapy",
    variants: createVariants(149),
    available: true,
    featured: true,
  },
  {
    id: "drink-kiwi",
    name: "Kiwi",
    category: "Liquid Therapy",
    variants: createVariants(159),
    available: true,
  },
  {
    id: "drink-dry-fruit",
    name: "Dry Fruit",
    category: "Liquid Therapy",
    variants: createVariants(159),
    available: true,
    featured: true,
  },
  {
    id: "drink-dragon",
    name: "Dragon",
    category: "Liquid Therapy",
    variants: createVariants(169),
    available: true,
  },
  {
    id: "drink-blueberry",
    name: "Blueberry",
    category: "Liquid Therapy",
    variants: createVariants(169),
    available: true,
  },
  {
    id: "drink-strawberry",
    name: "Strawberry",
    category: "Liquid Therapy",
    variants: createVariants(169),
    available: true,
  },
  {
    id: "drink-avocado",
    name: "Avocado",
    category: "Liquid Therapy",
    variants: createVariants(199),
    available: true,
    featured: true,
  },
  {
    id: "drink-pineapple",
    name: "Pineapple",
    category: "Liquid Therapy",
    variants: createVariants(89),
    available: true,
    featured: true,
  },
  {
    id: "drink-mosambi",
    name: "Mosambi",
    category: "Liquid Therapy",
    variants: createVariants(89),
    available: true,
  },
  {
    id: "drink-watermelon",
    name: "Watermelon",
    category: "Liquid Therapy",
    variants: createVariants(89),
    available: true,
  },
  {
    id: "drink-beetroot",
    name: "Beetroot",
    category: "Liquid Therapy",
    variants: createVariants(59),
    available: true,
  },
  {
    id: "drink-abc",
    name: "ABC",
    category: "Liquid Therapy",
    variants: createVariants(99),
    available: true,
  },
  {
    id: "drink-grape",
    name: "Grape",
    category: "Liquid Therapy",
    variants: createVariants(129),
    available: true,
  },
  {
    id: "drink-mix-fruit",
    name: "Mix Fruit",
    category: "Liquid Therapy",
    variants: createVariants(129),
    available: true,
    featured: true,
  },
  {
    id: "drink-anar",
    name: "Anar",
    category: "Liquid Therapy",
    variants: createVariants(129),
    available: true,
  },
  {
    id: "drink-orange",
    name: "Orange",
    category: "Liquid Therapy",
    variants: createVariants(149),
    available: true,
    featured: true,
  },
  {
    id: "drink-apple",
    name: "Apple",
    category: "Liquid Therapy",
    variants: createVariants(169),
    available: true,
  },
  {
    id: "drink-lassi",
    name: "Lassi",
    category: "Liquid Therapy",
    variants: createVariants(69),
    available: true,
  },
  {
    id: "drink-cold-coffee",
    name: "Cold Coffee",
    category: "Liquid Therapy",
    variants: createVariants(159),
    available: true,
    featured: true,
  },
  {
    id: "drink-persian-tea",
    name: "Persian Tea",
    category: "Liquid Therapy",
    variants: createVariants(35),
    available: true,
  },
  {
    id: "drink-turkish-tea",
    name: "Turkish Tea",
    category: "Liquid Therapy",
    variants: [],
    available: false,
  },
  {
    id: "drink-filter-coffee",
    name: "Filter Coffee",
    category: "Liquid Therapy",
    variants: [],
    available: false,
  },

  // ============================
  // FRUITOPIA
  // ============================

  {
    id: "mix-fruit-salad",
    name: "Mix Fruit Salad",
    category: "Fruitopia",
    variants: createVariants(99, 149),
    available: true,
  },
  {
    id: "exotic-fruit-salad",
    name: "Exotic Fruit Salad",
    category: "Fruitopia",
    variants: createVariants(249, 549),
    available: true,
    featured: true,
  },
  {
    id: "fruit-date-delight",
    name: "Fruit Date Delight",
    category: "Fruitopia",
    variants: createVariants(149, 199),
    available: true,
  },
  {
    id: "biscoff-fruit-custard",
    name: "Biscoff Fruit Custard",
    category: "Fruitopia",
    variants: createVariants(99),
    available: true,
    featured: true,
  },

  // ============================
  // GUILTY PLEASURES
  // ============================

  {
    id: "brownie-strawberry",
    name: "Brownie Strawberry",
    category: "Guilty Pleasures",
    variants: createVariants(199),
    available: true,
  },
  {
    id: "strawberry-chocolate",
    name: "Strawberry Chocolate",
    category: "Guilty Pleasures",
    variants: createVariants(99, 169),
    available: true,
  },
  {
    id: "single-choco-waffle",
    name: "Single Choco Waffle",
    category: "Guilty Pleasures",
    variants: createVariants(99),
    available: true,
  },
  {
    id: "triple-choco-waffle",
    name: "Triple Choco Waffle",
    category: "Guilty Pleasures",
    variants: createVariants(129),
    available: true,
  },
  {
    id: "fruit-choco-waffle",
    name: "Fruit Choco Waffle",
    category: "Guilty Pleasures",
    variants: createVariants(159),
    available: true,
  },

  // ============================
  // BREAD & BITE
  // ============================

  {
    id: "avocado-sandwich",
    name: "Avocado Sandwich",
    category: "Bread & Bite",
    variants: createVariants(119),
    available: true,
  },
  {
    id: "paneer-sandwich",
    name: "Paneer Sandwich",
    category: "Bread & Bite",
    variants: createVariants(99),
    available: true,
  },
  {
    id: "aalu-cheese-burger",
    name: "Aalu Cheese Burger",
    category: "Bread & Bite",
    variants: [],
    available: false,
  },
];
