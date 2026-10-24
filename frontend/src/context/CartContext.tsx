import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { MenuVariant } from "../data/menu";

export type CartItem = {
  id: string;
  name: string;
  size: MenuVariant["size"];
  price: number;
  quantity: number;
};

type CartContextType = {
  cart: CartItem[];
  cartCount: number;
  cartTotal: number;
  addToCart: (item: CartItem) => void;
  clearCart: () => void;
  updateQuantity: (
    id: string,
    size: MenuVariant["size"],
    quantity: number,
  ) => void;
  removeFromCart: (id: string, size: MenuVariant["size"]) => void;
};

const MAX_QUANTITY = 99;
const CART_STORAGE_KEY = "fruits-and-roots-cart";

const CartContext = createContext<CartContextType | undefined>(undefined);

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null) return false;

  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    (item.size === "Regular" || item.size === "Large") &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    item.price >= 0 &&
    typeof item.quantity === "number" &&
    Number.isInteger(item.quantity) &&
    item.quantity >= 1 &&
    item.quantity <= MAX_QUANTITY
  );
}

function loadCart(): CartItem[] {
  try {
    const savedCart = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!savedCart) return [];

    const parsed: unknown = JSON.parse(savedCart);
    if (!Array.isArray(parsed)) {
      throw new Error("Saved cart must be an array");
    }

    return parsed.filter(isCartItem);
  } catch (error) {
    console.error("Unable to load the saved cart.", error);
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<CartItem[]>(loadCart);

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (error) {
      console.error("Unable to save the cart.", error);
    }
  }, [cart]);

  const value = useMemo<CartContextType>(() => {
    const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
    const cartTotal = cart.reduce(
      (total, item) => total + item.price * item.quantity,
      0,
    );

    return {
      cart,
      cartCount,
      cartTotal,
      clearCart: () => setCart([]),
      addToCart: (newItem) => {
        if (
          !Number.isInteger(newItem.quantity) ||
          newItem.quantity < 1
        ) {
          throw new Error("Cart quantity must be a positive integer");
        }

        setCart((items) => {
          const existingItem = items.find(
            (item) => item.id === newItem.id && item.size === newItem.size,
          );

          if (!existingItem) {
            return [
              ...items,
              {
                ...newItem,
                quantity: Math.min(newItem.quantity, MAX_QUANTITY),
              },
            ];
          }

          return items.map((item) =>
            item.id === newItem.id && item.size === newItem.size
              ? {
                  ...item,
                  quantity: Math.min(
                    item.quantity + newItem.quantity,
                    MAX_QUANTITY,
                  ),
                }
              : item,
          );
        });
      },
      updateQuantity: (id, size, quantity) => {
        setCart((items) =>
          items.map((item) =>
            item.id === id && item.size === size
              ? {
                  ...item,
                  quantity: Math.max(1, Math.min(quantity, MAX_QUANTITY)),
                }
              : item,
          ),
        );
      },
      removeFromCart: (id, size) => {
        setCart((items) =>
          items.filter((item) => item.id !== id || item.size !== size),
        );
      },
    };
  }, [cart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}
