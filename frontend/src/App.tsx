
import AppRoutes from "./routes/AppRoutes";
import { CartProvider } from "./context/CartContext";
import { CheckoutProvider } from "./context/CheckoutContext";
import { MenuProvider } from "./context/MenuContext";

export default function App() {
  return (
    <MenuProvider>
      <CartProvider>
        <CheckoutProvider>
          <AppRoutes />
        </CheckoutProvider>
      </CartProvider>
    </MenuProvider>
  );
}
