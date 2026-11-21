
import AppRoutes from "./routes/AppRoutes";
import { CartProvider } from "./context/CartContext";
import { CheckoutProvider } from "./context/CheckoutContext";
import { MenuProvider } from "./context/MenuContext";
import DemoNotice from "./demo/DemoNotice";

export default function App() {
  return (
    <>
      {import.meta.env.VITE_PREVIEW_MODE === "true" && <DemoNotice />}
      <MenuProvider>
        <CartProvider>
          <CheckoutProvider>
            <AppRoutes />
          </CheckoutProvider>
        </CartProvider>
      </MenuProvider>
    </>
  );
}
