import { useContext } from "react";
import { CartActionsContext, CartContext } from "./cartContextStore";

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}

export function useCartActions() {
  const context = useContext(CartActionsContext);

  if (!context) {
    throw new Error("useCartActions must be used inside CartProvider");
  }

  return context;
}
