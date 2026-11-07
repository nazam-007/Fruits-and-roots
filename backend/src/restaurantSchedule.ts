import { z } from "zod";

export const RESTAURANT_TIME_ZONE = "Asia/Kolkata";
const RESTAURANT_UTC_OFFSET_MINUTES = 330;
export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const weekdayNames: Record<string, typeof WEEKDAYS[number]> = {
  mon: "monday",
  tue: "tuesday",
  wed: "wednesday",
  thu: "thursday",
  fri: "friday",
  sat: "saturday",
  sun: "sunday",
};
const dayScheduleSchema = z.object({
  isOpen: z.boolean(),
  allDay: z.boolean(),
  opensAt: timeSchema,
  closesAt: timeSchema,
}).strict().superRefine((day, context) => {
  if (day.isOpen && !day.allDay && day.opensAt === day.closesAt) {
    context.addIssue({
      code: "custom",
      message: "Opening and closing times must differ unless open all day.",
    });
  }
});

export const openingHoursSchema = z.object({
  monday: dayScheduleSchema,
  tuesday: dayScheduleSchema,
  wednesday: dayScheduleSchema,
  thursday: dayScheduleSchema,
  friday: dayScheduleSchema,
  saturday: dayScheduleSchema,
  sunday: dayScheduleSchema,
}).strict().superRefine((schedule, context) => {
  const intervals: Array<{ start: number; end: number; day: number }> = [];
  WEEKDAYS.forEach((weekday, dayIndex) => {
    const day = schedule[weekday];
    if (!day.isOpen) return;
    const dayStart = dayIndex * 1440;
    if (day.allDay) {
      intervals.push({ start: dayStart, end: dayStart + 1440, day: dayIndex });
      return;
    }

    const [openHour, openMinute] = day.opensAt.split(":").map(Number);
    const [closeHour, closeMinute] = day.closesAt.split(":").map(Number);
    const start = dayStart + openHour * 60 + openMinute;
    let end = dayStart + closeHour * 60 + closeMinute;
    if (end <= start) end += 1440;
    if (end <= 10080) {
      intervals.push({ start, end, day: dayIndex });
    } else {
      intervals.push({ start, end: 10080, day: dayIndex });
      intervals.push({ start: 0, end: end - 10080, day: dayIndex });
    }
  });

  for (let first = 0; first < intervals.length; first += 1) {
    for (let second = first + 1; second < intervals.length; second += 1) {
      if (
        intervals[first].start < intervals[second].end &&
        intervals[second].start < intervals[first].end
      ) {
        context.addIssue({
          code: "custom",
          path: [WEEKDAYS[intervals[second].day]],
          message: "Opening hours overlap another day's schedule.",
        });
      }
    }
  }
});

export type OpeningHours = z.infer<typeof openingHoursSchema>;

export type RestaurantAvailability = {
  orderingAvailable: boolean;
  status: "OPEN" | "CLOSED" | "PAUSED";
  isScheduledOpen: boolean;
  nextOpenAt: string | null;
  timeZone: typeof RESTAURANT_TIME_ZONE;
};

function getLocalParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: RESTAURANT_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  const weekday = weekdayNames[value("weekday").toLowerCase()];
  const dayIndex = WEEKDAYS.indexOf(weekday);
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
    dayIndex,
  };
}

export function getRestaurantAvailability(
  acceptingOrders: boolean,
  openingHours: OpeningHours,
  now = new Date(),
): RestaurantAvailability {
  const local = getLocalParts(now);
  const localNow = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
  );
  let isScheduledOpen = false;
  let nextOpeningLocal: number | null = null;

  for (let offset = -1; offset <= 7; offset += 1) {
    const dayIndex = (local.dayIndex + offset + 7) % 7;
    const dayKey = WEEKDAYS[dayIndex];
    const schedule = openingHours[dayKey];
    if (!schedule.isOpen) continue;

    const localDate = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
    const dayStart = Date.UTC(
      localDate.getUTCFullYear(),
      localDate.getUTCMonth(),
      localDate.getUTCDate(),
    );
    const startMinutes = schedule.allDay
      ? 0
      : schedule.opensAt.split(":").reduce(
        (total, part) => total * 60 + Number(part),
        0,
      );
    const endMinutes = schedule.allDay
      ? 1440
      : schedule.closesAt.split(":").reduce(
        (total, part) => total * 60 + Number(part),
        0,
      );
    const start = dayStart + startMinutes * 60_000;
    let end = dayStart + endMinutes * 60_000;
    if (!schedule.allDay && endMinutes <= startMinutes) {
      end += 24 * 60 * 60_000;
    }

    if (localNow >= start && localNow < end) isScheduledOpen = true;
    if (start > localNow && (nextOpeningLocal === null || start < nextOpeningLocal)) {
      nextOpeningLocal = start;
    }
  }

  const status = !acceptingOrders
    ? "PAUSED"
    : isScheduledOpen
      ? "OPEN"
      : "CLOSED";
  return {
    orderingAvailable: status === "OPEN",
    status,
    isScheduledOpen,
    nextOpenAt: status === "CLOSED" && nextOpeningLocal !== null
      ? new Date(
        nextOpeningLocal - RESTAURANT_UTC_OFFSET_MINUTES * 60_000,
      ).toISOString()
      : null,
    timeZone: RESTAURANT_TIME_ZONE,
  };
}
