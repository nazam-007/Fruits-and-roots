
import type { MenuItem } from "../data/menu";

const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:5000";

export type RestaurantOrderingStatus = {
  acceptingOrders: boolean;
  updatedAt: string;
  openingHours: OpeningHours;
  orderingAvailable: boolean;
  status: "OPEN" | "CLOSED" | "PAUSED";
  isScheduledOpen: boolean;
  nextOpenAt: string | null;
  timeZone: "Asia/Kolkata";
};

export type OpeningHours = Record<
  "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday",
  {
    isOpen: boolean;
    allDay: boolean;
    opensAt: string;
    closesAt: string;
  }
>;

const weekdays = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function isOpeningHours(value: unknown): value is OpeningHours {
  if (!value || typeof value !== "object") return false;
  return weekdays.every((weekday) => {
    const day = (value as Record<string, unknown>)[weekday];
    if (!day || typeof day !== "object") return false;
    const schedule = day as Record<string, unknown>;
    return (
      typeof schedule.isOpen === "boolean" &&
      typeof schedule.allDay === "boolean" &&
      typeof schedule.opensAt === "string" &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(schedule.opensAt) &&
      typeof schedule.closesAt === "string" &&
      /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(schedule.closesAt)
    );
  });
}

export async function fetchMenu(): Promise<MenuItem[]> {
  const response = await fetch(`${API_URL}/api/menu`);

  if (!response.ok) {
    throw new Error("Failed to fetch menu");
  }

  return response.json();
}

export async function fetchRestaurantOrderingStatus(): Promise<RestaurantOrderingStatus> {
  const response = await fetch(`${API_URL}/api/menu/status`);
  const data = await response.json().catch(() => null);
  if (
    !response.ok ||
    typeof data?.acceptingOrders !== "boolean" ||
    typeof data.updatedAt !== "string" ||
    typeof data.orderingAvailable !== "boolean" ||
    !["OPEN", "CLOSED", "PAUSED"].includes(data.status) ||
    typeof data.isScheduledOpen !== "boolean" ||
    (data.nextOpenAt !== null && typeof data.nextOpenAt !== "string") ||
    data.timeZone !== "Asia/Kolkata" ||
    !isOpeningHours(data.openingHours)
  ) {
    throw new Error(
      typeof data?.message === "string"
        ? data.message
        : "Unable to verify restaurant ordering status.",
    );
  }
  return {
    acceptingOrders: data.acceptingOrders,
    updatedAt: data.updatedAt,
    openingHours: data.openingHours,
    orderingAvailable: data.orderingAvailable,
    status: data.status,
    isScheduledOpen: data.isScheduledOpen,
    nextOpenAt: data.nextOpenAt,
    timeZone: data.timeZone,
  };
}
