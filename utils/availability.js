const MS_MIN = 60_000;

export const dateToStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const minutesToStr = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const timeToMinutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Combines a YYYY-MM-DD date and HH:mm time into a Date. Interprets the pair in
// the server's local time so availability slots, bookings, and overlap checks
// all agree (the same strings the API returns to clients).
export const slotsToDate = (dateStr, timeStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = timeStr.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
};

export const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

export const addDays = (date, n) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

const overlapsAny = (start, duration, appointments) => {
  const end = start.getTime() + duration * MS_MIN;
  return appointments.some((a) => {
    const aStart = a.start.getTime();
    const aEnd = aStart + (a.duration || 0) * MS_MIN;
    return start.getTime() < aEnd && end > aStart;
  });
};

// Pure slot generator. Given a therapist's weekly availability windows, the
// active appointments already on their calendar, and a [from, to) window,
// returns the Date of every free session start (stepping by `duration`).
export const computeFreeSlots = ({
  weeklyAvailability = [],
  appointments = [],
  from,
  to,
  duration = 50,
}) => {
  const slots = [];
  let day = startOfDay(from);
  const endDay = startOfDay(to);

  while (day.getTime() < endDay.getTime()) {
    const windows = weeklyAvailability.filter(
      (w) => w.dayOfWeek === day.getDay()
    );
    const dayStr = dateToStr(day);

    for (const win of windows) {
      const startMin = timeToMinutes(win.startTime);
      const endMin = timeToMinutes(win.endTime);

      for (let m = startMin; m + duration <= endMin; m += duration) {
        const candidate = slotsToDate(dayStr, minutesToStr(m));
        if (candidate.getTime() < from.getTime()) continue;
        if (overlapsAny(candidate, duration, appointments)) continue;
        slots.push(candidate);
      }
    }

    day = addDays(day, 1);
  }

  return slots;
};