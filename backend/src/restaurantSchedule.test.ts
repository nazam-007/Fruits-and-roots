import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getRestaurantAvailability,
  openingHoursSchema,
  type OpeningHours,
} from "./restaurantSchedule";

const allDaySchedule: OpeningHours = {
  monday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  tuesday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  wednesday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  thursday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  friday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  saturday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
  sunday: { isOpen: true, allDay: true, opensAt: "00:00", closesAt: "00:00" },
};

test("evaluates normal opening and closing times in Asia/Kolkata", () => {
  const schedule = {
    ...allDaySchedule,
    monday: {
      isOpen: true,
      allDay: false,
      opensAt: "09:00",
      closesAt: "17:00",
    },
  };
  assert.equal(
    getRestaurantAvailability(true, schedule, new Date("2026-11-09T03:30:00Z")).status,
    "OPEN",
  );
  assert.equal(
    getRestaurantAvailability(true, schedule, new Date("2026-11-09T12:00:00Z")).status,
    "CLOSED",
  );
  assert.equal(
    getRestaurantAvailability(true, schedule, new Date("2026-11-09T03:29:00Z")).status,
    "CLOSED",
  );
  assert.equal(
    getRestaurantAvailability(true, schedule, new Date("2026-11-09T11:30:00Z")).status,
    "CLOSED",
  );
});

test("supports a seven-day 24-hour schedule", () => {
  const result = getRestaurantAvailability(
    true,
    allDaySchedule,
    new Date("2026-11-09T18:45:00Z"),
  );
  assert.equal(result.status, "OPEN");
  assert.equal(result.orderingAvailable, true);
  assert.equal(result.nextOpenAt, null);
});

test("keeps overnight opening hours active after midnight", () => {
  const schedule = {
    ...allDaySchedule,
    monday: {
      isOpen: true,
      allDay: false,
      opensAt: "18:00",
      closesAt: "02:00",
    },
    tuesday: {
      isOpen: false,
      allDay: false,
      opensAt: "00:00",
      closesAt: "00:00",
    },
  };
  assert.equal(
    getRestaurantAvailability(true, schedule, new Date("2026-11-09T19:00:00Z")).status,
    "OPEN",
  );
});

test("reports the next opening after a closed day", () => {
  const schedule: OpeningHours = {
    ...allDaySchedule,
    monday: {
      isOpen: false,
      allDay: false,
      opensAt: "00:00",
      closesAt: "00:00",
    },
    tuesday: {
      isOpen: true,
      allDay: false,
      opensAt: "10:00",
      closesAt: "18:00",
    },
    wednesday: {
      isOpen: false,
      allDay: false,
      opensAt: "00:00",
      closesAt: "00:00",
    },
    thursday: {
      isOpen: false,
      allDay: false,
      opensAt: "00:00",
      closesAt: "00:00",
    },
    friday: {
      isOpen: false,
      allDay: false,
      opensAt: "00:00",
      closesAt: "00:00",
    },
    saturday: {
      isOpen: false,
      allDay: false,
      opensAt: "00:00",
      closesAt: "00:00",
    },
    sunday: {
      isOpen: false,
      allDay: false,
      opensAt: "00:00",
      closesAt: "00:00",
    },
  };
  const result = getRestaurantAvailability(
    true,
    schedule,
    new Date("2026-11-09T03:30:00Z"),
  );
  assert.equal(result.status, "CLOSED");
  assert.equal(result.nextOpenAt, "2026-11-10T04:30:00.000Z");
  assert.equal(
    getRestaurantAvailability(
      true,
      schedule,
      new Date("2026-11-10T04:30:00Z"),
    ).status,
    "OPEN",
  );
});

test("manual pause overrides an open schedule", () => {
  const result = getRestaurantAvailability(
    false,
    allDaySchedule,
    new Date("2026-11-09T03:30:00Z"),
  );
  assert.equal(result.status, "PAUSED");
  assert.equal(result.orderingAvailable, false);
  assert.equal(result.nextOpenAt, null);
});

test("rejects malformed or overlapping schedules", () => {
  const malformed = {
    ...allDaySchedule,
    monday: {
      isOpen: true,
      allDay: false,
      opensAt: "18:00",
      closesAt: "02:00",
    },
    tuesday: {
      isOpen: true,
      allDay: false,
      opensAt: "01:00",
      closesAt: "05:00",
    },
  };
  assert.equal(openingHoursSchema.safeParse(malformed).success, false);
  assert.equal(
    openingHoursSchema.safeParse({
      ...allDaySchedule,
      monday: { ...allDaySchedule.monday, opensAt: "25:00" },
    }).success,
    false,
  );
});
