import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { useMenu } from "../../context/MenuContext";
import { updateAdminOpeningHours } from "../../services/adminApi";
import type { OpeningHours } from "../../services/menuApi";

const weekdays = [
  ["monday", "Monday"],
  ["tuesday", "Tuesday"],
  ["wednesday", "Wednesday"],
  ["thursday", "Thursday"],
  ["friday", "Friday"],
  ["saturday", "Saturday"],
  ["sunday", "Sunday"],
] as const;

function validateSchedule(schedule: OpeningHours): string | null {
  const intervals: Array<{ start: number; end: number }> = [];
  let hasInvalidTime = false;
  weekdays.forEach(([weekday], dayIndex) => {
    const day = schedule[weekday];
    if (!day.isOpen) return;
    if (
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(day.opensAt) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(day.closesAt)
    ) {
      hasInvalidTime = true;
      return;
    }
    if (!day.allDay && day.opensAt === day.closesAt) {
      intervals.push({ start: dayIndex * 1440, end: dayIndex * 1440 });
      return;
    }
    const startMinutes = day.allDay
      ? 0
      : Number(day.opensAt.slice(0, 2)) * 60 + Number(day.opensAt.slice(3));
    const closeMinutes = day.allDay
      ? 1440
      : Number(day.closesAt.slice(0, 2)) * 60 + Number(day.closesAt.slice(3));
    const start = dayIndex * 1440 + startMinutes;
    let end = dayIndex * 1440 + closeMinutes;
    if (!day.allDay && end <= start) end += 1440;
    if (end <= 10080) {
      intervals.push({ start, end });
    } else {
      intervals.push({ start, end: 10080 }, { start: 0, end: end - 10080 });
    }
  });

  if (hasInvalidTime) return "Enter opening and closing times in HH:MM format.";
  if (intervals.some(({ start, end }) => start === end)) {
    return "Opening and closing times must differ unless the day is open 24 hours.";
  }
  for (let first = 0; first < intervals.length; first += 1) {
    for (let second = first + 1; second < intervals.length; second += 1) {
      if (
        intervals[first].start < intervals[second].end &&
        intervals[second].start < intervals[first].end
      ) {
        return "These hours overlap another day's schedule. Adjust the times before saving.";
      }
    }
  }
  return null;
}

export default function Settings() {
  const {
    restaurantStatus,
    restaurantStatusLoading,
    restaurantStatusError,
    refreshRestaurantStatus,
    updateRestaurantStatus,
  } = useMenu();
  const [draft, setDraft] = useState<OpeningHours | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const openingHours = dirty ? draft : restaurantStatus?.openingHours ?? draft;

  const editDay = (
    weekday: keyof OpeningHours,
    field: keyof OpeningHours[keyof OpeningHours],
    value: boolean | string,
  ) => {
    if (!openingHours) return;
    const updatedDay = { ...openingHours[weekday], [field]: value };
    if (
      (field === "allDay" && value === false) ||
      (field === "isOpen" && value === true && !updatedDay.allDay)
    ) {
      if (updatedDay.opensAt === updatedDay.closesAt) {
        updatedDay.opensAt = "09:00";
        updatedDay.closesAt = "17:00";
      }
    }
    setDraft({ ...openingHours, [weekday]: updatedDay });
    setDirty(true);
    setError(null);
    setNotice(null);
  };

  const save = async () => {
    if (!openingHours || saving) return;
    const validationError = validateSchedule(openingHours);
    if (validationError) {
      setError(validationError);
      setNotice(null);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const updated = await updateAdminOpeningHours(openingHours);
      updateRestaurantStatus(updated);
      setDraft(null);
      setDirty(false);
      setNotice("Opening hours saved.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to save opening hours.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[#b56b36]">
          Fruits & Roots · Admin
        </p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-[#253b2a]">
          Settings
        </h1>
      </header>

      <section
        aria-labelledby="opening-hours-title"
        className="rounded-2xl border border-[#e7e4d8] bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              id="opening-hours-title"
              className="font-serif text-xl font-semibold text-[#253b2a]"
            >
              Opening Hours
            </h2>
            <p className="mt-1 text-sm text-[#73796d]">
              Weekly schedule · Asia/Kolkata (IST)
            </p>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!openingHours || !dirty || saving}
            className="min-h-11 rounded-xl bg-[#31573a] px-4 font-semibold text-white transition hover:bg-[#25472e] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save hours"}
          </button>
        </div>

        {!openingHours ? (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[#73796d]">
            <p role={restaurantStatusError ? "alert" : "status"}>
              {restaurantStatusLoading
                ? "Loading opening hours..."
                : restaurantStatusError ?? "Opening hours are unavailable."}
            </p>
            {!restaurantStatusLoading && (
              <button
                type="button"
                onClick={() => void refreshRestaurantStatus()}
                className="inline-flex min-h-10 items-center gap-2 font-semibold text-[#31573a] underline"
              >
                <RefreshCw size={15} aria-hidden="true" />
                Retry
              </button>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {weekdays.map(([weekday, label]) => {
              const day = openingHours[weekday];
              return (
                <fieldset
                  key={weekday}
                  className="grid gap-3 rounded-xl border border-[#eeece3] p-3 xl:grid-cols-[minmax(7rem,1fr)_auto_auto_minmax(9rem,auto)_minmax(9rem,auto)] xl:items-center"
                >
                  <legend className="sr-only">{label} opening hours</legend>
                  <span className="font-semibold text-[#354632]">{label}</span>
                  <label className="flex min-h-10 items-center gap-2 text-sm text-[#596554]">
                    <input
                      type="checkbox"
                      checked={day.isOpen}
                      onChange={(event) =>
                        editDay(weekday, "isOpen", event.target.checked)
                      }
                      className="h-4 w-4 accent-[#31573a]"
                    />
                    Open
                  </label>
                  {day.isOpen ? (
                    <>
                      <label className="flex min-h-10 items-center gap-2 text-sm text-[#596554]">
                        <input
                          type="checkbox"
                          checked={day.allDay}
                          onChange={(event) =>
                            editDay(weekday, "allDay", event.target.checked)
                          }
                          className="h-4 w-4 accent-[#31573a]"
                        />
                        24 hours
                      </label>
                      {day.allDay ? (
                        <span className="text-sm text-[#73796d] xl:col-span-2">
                          Open all day
                        </span>
                      ) : (
                        <>
                          <label className="flex items-center gap-2 text-sm text-[#596554]">
                            Opens
                            <input
                              type="time"
                              value={day.opensAt}
                              onChange={(event) =>
                                editDay(weekday, "opensAt", event.target.value)
                              }
                              required
                              className="min-h-10 min-w-0 rounded-lg border border-[#d9ddcf] px-2 text-base"
                            />
                          </label>
                          <label className="flex items-center gap-2 text-sm text-[#596554]">
                            Closes
                            <input
                              type="time"
                              value={day.closesAt}
                              onChange={(event) =>
                                editDay(weekday, "closesAt", event.target.value)
                              }
                              required
                              className="min-h-10 min-w-0 rounded-lg border border-[#d9ddcf] px-2 text-base"
                            />
                          </label>
                        </>
                      )}
                    </>
                  ) : (
                    <span className="text-sm text-[#73796d] xl:col-span-4">
                      Closed
                    </span>
                  )}
                </fieldset>
              );
            })}
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>
        )}
        {notice && (
          <p role="status" className="mt-3 text-sm text-[#31573a]">{notice}</p>
        )}
        <p className="mt-4 text-xs text-[#73796d]">
          Closing earlier than the opening time sets an overnight schedule, such as 18:00–02:00.
          The manual Accepting Orders toggle remains on the Dashboard and always overrides these hours.
        </p>
      </section>
    </div>
  );
}
