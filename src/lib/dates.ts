// Fechas como "YYYY-MM-DD" (y meses "YYYY-MM") en UTC para que la aritmética no dependa del horario de verano.
export const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(new Date(toDate(d).getTime() + n * 864e5));
export const fmt = (d: string, o: Intl.DateTimeFormatOptions) => toDate(d).toLocaleDateString("es", { timeZone: "UTC", ...o });
export const mondayOf = (d: string) => addDays(d, -((toDate(d).getUTCDay() + 6) % 7));
export const todayLocal = () => new Date().toLocaleDateString("sv-SE");

export const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  return iso(new Date(Date.UTC(y, m - 1 + n, 1))).slice(0, 7);
};
export const monthEnd = (ym: string) => addDays(`${addMonths(ym, 1)}-01`, -1);
export const monthDays = (ym: string) => Array.from({ length: Number(monthEnd(ym).slice(8)) }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
export const monthLabel = (ym: string, o: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }) => {
  const s = fmt(`${ym}-01`, o);
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const isMonth = (s: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const isDay = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDate(s).getTime());

export function rangeLabel(from: string, to: string) {
  if (from === to) return fmt(from, { weekday: "short", day: "numeric", month: "short" });
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `${fmt(from, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })} – ${fmt(to, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** 45 min, 3 h 20 min, 2 d 4 h */
export function duration(ms: number) {
  const min = Math.max(1, Math.round(ms / 6e4));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  return h % 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${Math.floor(h / 24)} d`;
}
