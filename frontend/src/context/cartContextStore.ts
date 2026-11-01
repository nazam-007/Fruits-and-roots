import { createContext } from "react";
import type { MenuVariant } from "../data/menu";

export type CartItem = {
  id: string;
  name: string;
  size: MenuVariant["size"];
  price: number;
  quantity: number;
};

export type CartContextType = {
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

export const CartContext = createContext<CartContextType | undefined>(
  undefined,
);
