
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";

import CustomerLayout from "../layouts/CustomerLayout";
import AdminLayout from "../layouts/AdminLayout";
import Cart from "../pages/customer/Cart";

import Home from "../pages/customer/Home";
import Menu from "../pages/customer/Menu";
import ProductDetails from "../pages/customer/ProductDetails";
import Checkout from "../pages/customer/Checkout";
import Payment from "../pages/customer/Payment";
import OrderTracking from "../pages/customer/OrderTracking";
import AdminLogin from "../pages/admin/Login";
import AdminDashboard from "../pages/admin/Dashboard";
import AdminOrders from "../pages/admin/Orders";
import AdminOrderDetails from "../pages/admin/OrderDetails";
import MenuManagement from "../pages/admin/MenuManagement";

const Page = ({ title }: { title: string }) => (
  <div className="rounded-xl bg-white p-8 shadow-sm">
    <h1 className="text-2xl font-bold text-[#354632]">
      {title}
    </h1>
    <p className="mt-2 text-gray-500">
      Fruits & Roots — Page under development
    </p>
  </div>
);

function RouteScrollReset() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}

function PersistTableFromQrUrl() {
  const { search } = useLocation();

  useEffect(() => {
    const tableNumber = new URLSearchParams(search).get("table");
    if (tableNumber) {
      try {
        window.sessionStorage.setItem("fruits-roots-table", tableNumber);
      } catch {
        // Checkout still allows table selection if browser storage is unavailable.
      }
    }
  }, [search]);

  return null;
}

export default function AppRoutes() {
  return (
    <BrowserRouter>
      <RouteScrollReset />
      <PersistTableFromQrUrl />
      <Routes>
        {/* Customer Routes */}
        <Route element={<CustomerLayout />}>
          <Route index element={<Home />} />
          <Route path="menu" element={<Menu />} />

          {/* Product Details */}
          <Route
            path="product/:id"
            element={<ProductDetails />}
          />

          <Route path="cart" element={<Cart />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="payment/:orderId" element={<Payment />} />
          <Route path="order/:orderId" element={<OrderTracking />} />
        </Route>

        {/* Admin Routes */}
        <Route path="admin/login" element={<AdminLogin />} />
        <Route path="admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:orderId" element={<AdminOrderDetails />} />
          <Route path="menu" element={<MenuManagement />} />
          <Route path="tables" element={<Page title="Table Management" />} />
          <Route path="reports" element={<Page title="Reports" />} />
          <Route path="settings" element={<Page title="Settings" />} />
        </Route>

        {/* Fallback Route */}
        <Route path="*" element={<Page title="Page Not Found" />} />
      </Routes>
    </BrowserRouter>
  );
}
