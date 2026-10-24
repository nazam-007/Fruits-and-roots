
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardList,
  Utensils,
  QrCode,
  ChartColumn,
  Settings,
  LogOut,
} from "lucide-react";
import {
  AdminApiError,
  fetchAdminSession,
  logoutAdmin,
} from "../services/adminApi";

const navigation = [
  { name: "Dashboard", path: "/admin", icon: LayoutDashboard },
  { name: "Orders", path: "/admin/orders", icon: ClipboardList },
  { name: "Menu", path: "/admin/menu", icon: Utensils },
  { name: "Tables & QR", path: "/admin/tables", icon: QrCode },
  { name: "Reports", path: "/admin/reports", icon: ChartColumn },
  { name: "Settings", path: "/admin/settings", icon: Settings },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [adminId, setAdminId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetchAdminSession()
      .then(({ adminId: currentAdmin }) => {
        if (active) setAdminId(currentAdmin);
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        if (requestError instanceof AdminApiError && requestError.status === 401) {
          navigate("/admin/login", {
            replace: true,
            state: { from: location.pathname },
          });
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to validate admin access.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [location.pathname, navigate]);

  useEffect(() => {
    const handleExpiredSession = () => {
      navigate("/admin/login", {
        replace: true,
        state: { from: location.pathname },
      });
    };
    window.addEventListener("admin-session-expired", handleExpiredSession);
    return () =>
      window.removeEventListener("admin-session-expired", handleExpiredSession);
  }, [location.pathname, navigate]);

  const handleLogout = async () => {
    try {
      await logoutAdmin();
      navigate("/admin/login", { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to sign out.",
      );
    }
  };

  if (loading) {
    return (
      <div role="status" className="grid min-h-screen place-items-center text-[#596554]">
        Checking admin session...
      </div>
    );
  }

  if (error || !adminId) {
    return (
      <main className="grid min-h-screen place-items-center bg-gray-50 p-6">
        <section className="max-w-lg rounded-2xl bg-white p-6 text-center shadow-sm">
          <p role="alert" className="text-sm text-red-700">
            {error ?? "Admin authentication is required."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 rounded-full bg-[#354632] px-5 py-2.5 font-semibold text-white"
          >
            Retry
          </button>
        </section>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <aside className="bg-[#354632] p-5 text-white md:min-h-screen md:w-64">
        <h2 className="mb-6 text-xl font-bold">
          Fruits & Roots
        </h2>

        <nav className="flex flex-wrap gap-2 md:flex-col">
          {navigation.map(({ name, path, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/admin"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  isActive
                    ? "bg-white text-[#354632]"
                    : "text-green-50 hover:bg-white/10"
                }`
              }
            >
              <Icon size={18} />
              {name}
            </NavLink>
          ))}
        </nav>
        <div className="mt-8 border-t border-white/15 pt-4">
          <p className="truncate text-xs text-green-100">{adminId}</p>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm text-green-50 hover:bg-white/10"
          >
            <LogOut size={17} aria-hidden="true" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
}
