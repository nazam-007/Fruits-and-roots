import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type CheckoutDetails = {
  customerName: string;
  customerPhone: string;
};

type CheckoutContextValue = {
  checkoutDetails: CheckoutDetails | null;
  saveCheckoutDetails: (details: CheckoutDetails) => void;
  clearCheckoutDetails: () => void;
};

const STORAGE_KEY = "fruits-roots-checkout-details";
const CheckoutContext = createContext<CheckoutContextValue | undefined>(
  undefined,
);

function loadCheckoutDetails(): CheckoutDetails | null {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "customerName" in parsed &&
      "customerPhone" in parsed &&
      typeof parsed.customerName === "string" &&
      typeof parsed.customerPhone === "string"
    ) {
      return {
        customerName: parsed.customerName,
        customerPhone: parsed.customerPhone,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function CheckoutProvider({ children }: { children: ReactNode }) {
  const [checkoutDetails, setCheckoutDetails] =
    useState<CheckoutDetails | null>(loadCheckoutDetails);

  const value = useMemo<CheckoutContextValue>(
    () => ({
      checkoutDetails,
      saveCheckoutDetails: (details) => {
        const savedDetails = {
          customerName: details.customerName.trim(),
          customerPhone: details.customerPhone.trim(),
        };
        window.sessionStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(savedDetails),
        );
        setCheckoutDetails(savedDetails);
      },
      clearCheckoutDetails: () => {
        window.sessionStorage.removeItem(STORAGE_KEY);
        setCheckoutDetails(null);
      },
    }),
    [checkoutDetails],
  );

  return (
    <CheckoutContext.Provider value={value}>
      {children}
    </CheckoutContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCheckout() {
  const context = useContext(CheckoutContext);
  if (!context) {
    throw new Error("useCheckout must be used inside CheckoutProvider");
  }
  return context;
}
