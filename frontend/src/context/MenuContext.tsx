
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
import { fetchMenu } from "../services/menuApi";

type MenuContextType = {
  menuItems: MenuItem[];
  loading: boolean;
  error: string | null;
  refreshMenu: (quiet?: boolean) => Promise<void>;
};

const MenuContext = createContext<MenuContextType | undefined>(
  undefined
);

export function MenuProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasLoadedMenu = useRef(false);

  const refreshMenu = useCallback(async (quiet = false) => {
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
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refreshMenu(), 0);
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshMenu(true);
    }, 10_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshMenu(true);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [refreshMenu]);

  return (
    <MenuContext.Provider
      value={{
        menuItems,
        loading,
        error,
        refreshMenu,
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
