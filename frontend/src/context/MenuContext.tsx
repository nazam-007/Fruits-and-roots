
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  useCallback,
} from "react";

import type { MenuItem } from "../data/menu";
import {
  fetchMenu,
  fetchRestaurantOrderingStatus,
  type RestaurantOrderingStatus,
} from "../services/menuApi";

type MenuContextType = {
  menuItems: MenuItem[];
  loading: boolean;
  error: string | null;
  refreshMenu: (quiet?: boolean) => Promise<void>;
  restaurantStatus: RestaurantOrderingStatus | null;
  restaurantStatusLoading: boolean;
  restaurantStatusError: string | null;
  refreshRestaurantStatus: () => Promise<void>;
  updateRestaurantStatus: (status: RestaurantOrderingStatus) => void;
};

const MenuContext = createContext<MenuContextType | undefined>(
  undefined
);
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function MenuProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restaurantStatus, setRestaurantStatus] =
    useState<RestaurantOrderingStatus | null>(null);
  const [restaurantStatusLoading, setRestaurantStatusLoading] = useState(true);
  const [restaurantStatusError, setRestaurantStatusError] = useState<string | null>(
    null,
  );
  const hasLoadedMenu = useRef(false);
  const requestInFlight = useRef(false);
  const refreshQueued = useRef(false);
  const refreshMenuRef = useRef<(quiet?: boolean) => Promise<void>>(
    () => Promise.resolve(),
  );
  const statusRequestInFlight = useRef(false);
  const statusRefreshQueued = useRef(false);
  const refreshRestaurantStatusRef = useRef<() => Promise<void>>(
    () => Promise.resolve(),
  );

  const refreshMenu = useCallback(async (quiet = false) => {
    if (requestInFlight.current) {
      refreshQueued.current = true;
      return;
    }
    requestInFlight.current = true;
    if (!quiet) setLoading(true);
    setError(null);

    try {
      const products = await fetchMenu();
      setMenuItems(products);
      hasLoadedMenu.current = true;
    } catch {
      if (!quiet || !hasLoadedMenu.current) {
        setError("Unable to load the menu. Please try again.");
      }
    } finally {
      requestInFlight.current = false;
      setLoading(false);
      if (refreshQueued.current) {
        refreshQueued.current = false;
        window.setTimeout(() => void refreshMenuRef.current(true), 0);
      }
    }
  }, []);

  const refreshRestaurantStatus = useCallback(async () => {
    if (statusRequestInFlight.current) {
      statusRefreshQueued.current = true;
      return;
    }
    statusRequestInFlight.current = true;
    try {
      const status = await fetchRestaurantOrderingStatus();
      setRestaurantStatus(status);
      setRestaurantStatusError(null);
    } catch (statusError) {
      setRestaurantStatusError(
        statusError instanceof Error
          ? statusError.message
          : "Unable to verify restaurant ordering status.",
      );
    } finally {
      statusRequestInFlight.current = false;
      setRestaurantStatusLoading(false);
      if (statusRefreshQueued.current) {
        statusRefreshQueued.current = false;
        window.setTimeout(
          () => void refreshRestaurantStatusRef.current(),
          0,
        );
      }
    }
  }, []);
  const updateRestaurantStatus = useCallback(
    (status: RestaurantOrderingStatus) => {
      setRestaurantStatus(status);
      setRestaurantStatusError(null);
      setRestaurantStatusLoading(false);
    },
    [],
  );

  useEffect(() => {
    refreshMenuRef.current = refreshMenu;
    refreshRestaurantStatusRef.current = refreshRestaurantStatus;
    const initialLoad = window.setTimeout(() => void refreshMenu(), 0);
    const initialStatusLoad = window.setTimeout(
      () => void refreshRestaurantStatus(),
      0,
    );
    const menuEvents = new EventSource(`${API_URL}/api/menu/events`);
    const refreshOnCatalogChange = () => void refreshMenu(true);
    const refreshOnRestaurantStatusChange = () =>
      void refreshRestaurantStatus();
    menuEvents.addEventListener("catalog-changed", refreshOnCatalogChange);
    menuEvents.addEventListener(
      "restaurant-status-changed",
      refreshOnRestaurantStatusChange,
    );
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshMenu(true);
        void refreshRestaurantStatus();
      }
    }, 10_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") {
        void refreshMenu(true);
        void refreshRestaurantStatus();
      }
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearTimeout(initialStatusLoad);
      window.clearInterval(interval);
      menuEvents.removeEventListener("catalog-changed", refreshOnCatalogChange);
      menuEvents.removeEventListener(
        "restaurant-status-changed",
        refreshOnRestaurantStatusChange,
      );
      menuEvents.close();
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshMenu, refreshRestaurantStatus]);

  return (
    <MenuContext.Provider
      value={{
        menuItems,
        loading,
        error,
        refreshMenu,
        restaurantStatus,
        restaurantStatusLoading,
        restaurantStatusError,
        refreshRestaurantStatus,
        updateRestaurantStatus,
      }}
    >
      {children}
    </MenuContext.Provider>
  );
}

export function useMenu() {
  const context = useContext(MenuContext);

  if (!context) {
    throw new Error("useMenu must be used inside MenuProvider");
  }

  return context;
}
