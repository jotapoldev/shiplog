"use client";

import { ChevronLeft, ChevronRight, Minimize2, Sparkles } from "lucide-react";
import Link from "next/link";
import { AnimatePresence, LayoutGroup, animate, motion, useMotionValue, useTransform } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, fmt, mondayOf, monthDays, monthLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useHref } from "./filters";

const EASE = [0.23, 1, 0.32, 1] as const;
// Curva tipo iOS para el "zoom" del mes: arranca rápido y aterriza suave.
const ZOOM = { duration: 0.5, ease: [0.32, 0.72, 0, 1] } as const;

export type Breakdown = { d: string; t: string; r: string; n: number }[];
type DayInfo = { n: number; types: [string, number][]; repos: [string, number][] };

const shade = (n: number) => (n === 0 ? 0 : n <= 2 ? 30 : n <= 5 ? 55 : n <= 9 ? 78 : 100);
const bg = (n: number) => `color-mix(in oklab, var(--primary) ${shade(n)}%, var(--heat-0))`;
const typeLabel = (t: string) => (t === "other" ? "sin tipo" : t);
const nCommits = (n: number) => `${n} ${n === 1 ? "commit" : "commits"}`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function useDays(rows: Breakdown) {
  return useMemo(() => {
    const acc = new Map<string, { n: number; t: Map<string, number>; r: Map<string, number> }>();
    for (const { d, t, r, n } of rows) {
      const x = acc.get(d) ?? { n: 0, t: new Map(), r: new Map() };
      x.n += n;
      x.t.set(t, (x.t.get(t) ?? 0) + n);
      x.r.set(r, (x.r.get(r) ?? 0) + n);
      acc.set(d, x);
    }
    const sorted = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]);
    return new Map<string, DayInfo>([...acc].map(([d, x]) => [d, { n: x.n, types: sorted(x.t), repos: sorted(x.r) }]));
  }, [rows]);
}

/** Número que cuenta hasta su valor: el mes "se carga" frente a ti. */
function Count({ value }: { value: number }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => Math.round(v).toLocaleString("es"));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.7, ease: EASE });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}

type Hover = { d: string; x: number; y: number; w: number } | null;

export function Heatmap({ rows, today, month }: { rows: Breakdown; today: string; month: string }) {
  const router = useRouter();
  const href = useHref();
  const days = useDays(rows);
  const wrap = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover>(null);

  // Estado local para que el zoom arranque al instante; la URL lo alcanza después.
  const [zoom, setZoom] = useState(month);
  const [prevMonth, setPrevMonth] = useState(month);
  const [dir, setDir] = useState(0);
  if (month !== prevMonth) {
    setPrevMonth(month);
    setZoom(month);
  }

  const go = (ym: string) => {
    setHover(null);
    setDir(zoom && ym ? (ym > zoom ? 1 : -1) : 0);
    setZoom(ym);
    router.push(href({ month: ym, day: "", from: "", to: "" }), { scroll: false });
  };

  const point = (d: string, el: HTMLElement) => {
    const a = el.getBoundingClientRect();
    const b = wrap.current!.getBoundingClientRect();
    setHover({ d, x: a.left - b.left + a.width / 2, y: a.top - b.top, w: b.width });
  };
  // Salir de una celda espera un instante: si entras a la vecina, el tooltip se desliza en vez de parpadear.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHover(null), 90);
  };
  const hoverProps: HoverProps = (d) => ({
    onPointerEnter: (e) => {
      clearTimeout(timer.current);
      point(d, e.currentTarget);
    },
    onFocus: (e) => point(d, e.currentTarget),
    onPointerLeave: leave,
    onBlur: leave,
  });

  return (
    <div ref={wrap} className="relative mt-10">
      <LayoutGroup>
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          {zoom ? (
            <MonthZoom key={zoom} ym={zoom} dir={dir} days={days} today={today} onMonth={go} hoverProps={hoverProps} />
          ) : (
            <Year key="year" days={days} today={today} onMonth={go} hoverProps={hoverProps} onDay={(d) => router.push(href({ from: d, to: d, month: "", day: "" }), { scroll: false })} />
          )}
        </AnimatePresence>
      </LayoutGroup>
      <Tooltip hover={hover} info={hover ? days.get(hover.d) : undefined} />
    </div>
  );
}

type HoverProps = (d: string) => {
  onPointerEnter: (e: React.PointerEvent<HTMLElement>) => void;
  onFocus: (e: React.FocusEvent<HTMLElement>) => void;
  onPointerLeave: () => void;
  onBlur: () => void;
};

function Year({ days, today, onMonth, onDay, hoverProps }: { days: Map<string, DayInfo>; today: string; onMonth: (ym: string) => void; onDay: (d: string) => void; hoverProps: HoverProps }) {
  const start = mondayOf(addDays(today, -52 * 7));
  const weeks = Array.from({ length: 53 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  return (
    <motion.div exit={{ opacity: 0, transition: { duration: 0.2 } }} className="overflow-x-auto pb-2 [direction:rtl] sm:[direction:ltr]">
      <div className="w-max [direction:ltr]">
        <div className="mb-1.5 flex gap-[3px] text-[11px] text-muted-foreground">
          {weeks.map((w, i) => {
            const first = w.find((d) => d.endsWith("-01") && d <= today);
            return (
              <span key={i} className="w-3 overflow-visible whitespace-nowrap sm:w-3.5">
                {first && (
                  <button
                    onClick={() => onMonth(first.slice(0, 7))}
                    className="rounded px-0.5 -mx-0.5 transition-colors hover:bg-primary hover:text-primary-foreground"
                    title={`Ver ${monthLabel(first.slice(0, 7))} en grande`}
                  >
                    {fmt(first, { month: "short" }).replace(".", "")}
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <div className="flex gap-[3px]">
          {weeks.map((w, i) => (
            <div key={i} className="heat-col grid gap-[3px]" style={{ "--i": i } as React.CSSProperties}>
              {w.map((d) =>
                d > today ? (
                  <span key={d} className="size-3 sm:size-3.5" />
                ) : (
                  <motion.button
                    key={d}
                    layoutId={`hm-${d}`}
                    transition={{ layout: ZOOM }}
                    onClick={() => onDay(d)}
                    aria-label={`${nCommits(days.get(d)?.n ?? 0)} el ${d}`}
                    className="size-3 outline-offset-1 hover:outline-2 hover:outline-foreground/40 focus-visible:outline-2 focus-visible:outline-ring sm:size-3.5"
                    style={{ background: bg(days.get(d)?.n ?? 0), borderRadius: 3 }}
                    {...hoverProps(d)}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function MonthZoom({ ym, dir, days, today, onMonth, hoverProps }: { ym: string; dir: number; days: Map<string, DayInfo>; today: string; onMonth: (ym: string) => void; hoverProps: HoverProps }) {
  const router = useRouter();
  const href = useHref();
  const selected = useSearchParams().get("day");
  const list = monthDays(ym);
  const lead = (new Date(`${list[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...list];
  while (cells.length % 7) cells.push(null);

  const info = list.map((d) => days.get(d)?.n ?? 0);
  const total = info.reduce((a, b) => a + b, 0);
  const active = info.filter(Boolean).length;
  const best = list.reduce((b, d) => ((days.get(d)?.n ?? 0) > (days.get(b)?.n ?? 0) ? d : b), list[0]);
  let streak = 0;
  let run = 0;
  for (const n of info) streak = Math.max(streak, (run = n ? run + 1 : 0));
  const sum = (k: "types" | "repos") => {
    const m = new Map<string, number>();
    for (const d of list) for (const [x, n] of days.get(d)?.[k] ?? []) m.set(x, (m.get(x) ?? 0) + n);
    return [...m].sort((a, b) => b[1] - a[1]);
  };
  const types = sum("types");
  const repos = sum("repos");
  const repoMax = Math.max(1, ...repos.map((r) => r[1]));
  const next = addMonths(ym, 1);
  const pick = (patch: Record<string, string>) => router.push(href(patch), { scroll: false });

  return (
    <motion.div
      custom={dir}
      initial={dir ? { opacity: 0, x: dir * 40 } : false}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <motion.h2
          initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 0.35, delay: 0.1, ease: EASE }}
          className="font-display text-[clamp(1.75rem,5vw,2.75rem)] leading-none font-semibold tracking-[-0.03em]"
        >
          {monthLabel(ym).replace(" de ", " ")}
        </motion.h2>
        <div className="flex items-center gap-1">
          <IconBtn label="Mes anterior" onClick={() => onMonth(addMonths(ym, -1))}>
            <ChevronLeft />
          </IconBtn>
          <IconBtn label="Mes siguiente" disabled={next > today.slice(0, 7)} onClick={() => onMonth(next)}>
            <ChevronRight />
          </IconBtn>
          <Link
            href={`/resumen?month=${ym}`}
            className="press ml-1 flex h-10 items-center gap-2 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground sm:px-4 hover:bg-primary/90"
          >
            <Sparkles className="size-4" />
            <span className="hidden sm:inline">Ver como historia</span>
          </Link>
          <button
            onClick={() => onMonth("")}
            aria-label="Ver el año"
            className="press ml-1 flex h-10 items-center gap-2 rounded-full bg-card px-3 text-sm font-medium ring-1 ring-border hover:bg-muted sm:px-4"
          >
            <Minimize2 className="size-4" />
            <span className="max-sm:hidden">Ver el año</span>
            <kbd className="hidden rounded border border-border px-1.5 text-[11px] text-muted-foreground sm:inline">Esc</kbd>
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div>
          <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground sm:gap-2">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {cells.map((d, i) => {
              if (!d) return <span key={`x${i}`} />;
              const x = days.get(d);
              const n = x?.n ?? 0;
              const strong = shade(n) >= 55;
              const future = d > today;
              return (
                <motion.button
                  key={d}
                  layoutId={future ? undefined : `hm-${d}`}
                  transition={{ layout: { ...ZOOM, delay: i * 0.006 } }}
                  disabled={future}
                  onClick={() => pick({ day: selected === d ? "" : d })}
                  aria-pressed={selected === d}
                  aria-label={`${nCommits(n)} el ${fmt(d, { weekday: "long", day: "numeric", month: "long" })}`}
                  className={cn(
                    "group relative aspect-square text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring sm:aspect-[5/4]",
                    future && "opacity-40",
                    (d === today || selected === d) && "ring-2 ring-offset-2 ring-offset-background",
                    d === today && "ring-primary/50",
                    selected === d && "ring-foreground",
                  )}
                  style={{ background: bg(n), borderRadius: 14 }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  {...hoverProps(d)}
                >
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { delay: 0.28 + i * 0.006, duration: 0.2 } }}
                    exit={{ opacity: 0, transition: { duration: 0.05 } }}
                    className={cn("absolute inset-0 flex flex-col justify-between p-1.5 sm:p-2.5", strong ? "text-primary-foreground" : "text-foreground")}
                  >
                    <span className={cn("text-xs tabular-nums sm:text-sm", !strong && "text-muted-foreground")}>{Number(d.slice(8))}</span>
                    {n > 0 && <span className="font-display text-base leading-none font-semibold tabular-nums sm:text-2xl">{n}</span>}
                    {x && (
                      <span className="absolute inset-x-1.5 bottom-1.5 hidden h-1 overflow-hidden rounded-full bg-black/10 sm:inset-x-2.5 sm:bottom-2 sm:flex">
                        {x.types.map(([t, k]) => (
                          <span key={t} style={{ width: `${(k / n) * 100}%`, background: `var(--t-${t})` }} />
                        ))}
                      </span>
                    )}
                  </motion.span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <motion.aside
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.35, delay: 0.2, ease: EASE }}
          className="space-y-6"
        >
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
            <Stat label="Commits" value={<Count value={total} />} />
            <Stat label="Días activos" value={<><Count value={active} /><span className="text-base text-muted-foreground"> / {list.length}</span></>} />
            <Stat label="Mejor día" value={total ? fmt(best, { day: "numeric", month: "short" }).replace(".", "") : "—"} hint={total ? nCommits(days.get(best)?.n ?? 0) : undefined} />
            <Stat label="Racha más larga" value={<><Count value={streak} /><span className="text-base text-muted-foreground"> días</span></>} />
          </dl>

          {types.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Por tipo</p>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted">
                {types.map(([t, n], i) => (
                  <motion.button
                    key={t}
                    title={`${typeLabel(t)}: ${n}`}
                    aria-label={`Filtrar ${typeLabel(t)}`}
                    onClick={() => pick({ type: t })}
                    initial={{ width: 0 }}
                    animate={{ width: `${(n / total) * 100}%` }}
                    transition={{ duration: 0.6, delay: 0.3 + i * 0.05, ease: EASE }}
                    style={{ background: `var(--t-${t})` }}
                  />
                ))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                {types.map(([t, n]) => (
                  <button key={t} onClick={() => pick({ type: t })} className="flex items-center gap-1.5 rounded hover:text-primary">
                    <span className="size-2 rounded-full" style={{ background: `var(--t-${t})` }} />
                    {typeLabel(t)} <span className="font-semibold tabular-nums">{n}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {repos.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground">Por repo</p>
              <ul className="mt-2 space-y-1">
                {repos.map(([r, n], i) => (
                  <li key={r}>
                    <button onClick={() => pick({ repo: r })} className="press relative flex h-9 w-full items-center justify-between overflow-hidden rounded-lg px-2.5 text-sm hover:bg-muted">
                      <motion.span
                        className="absolute inset-y-0 left-0 bg-primary/12"
                        initial={{ width: 0 }}
                        animate={{ width: `${(n / repoMax) * 100}%` }}
                        transition={{ duration: 0.6, delay: 0.35 + i * 0.05, ease: EASE }}
                      />
                      <span className="relative truncate">{r}</span>
                      <span className="relative font-semibold tabular-nums">{n}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.aside>
      </div>
    </motion.div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="press flex size-10 items-center justify-center rounded-full hover:bg-muted disabled:opacity-30 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-display text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

/** Un solo tooltip que se desliza de celda en celda en vez de aparecer y desaparecer. */
function Tooltip({ hover, info }: { hover: Hover; info?: DayInfo }) {
  const W = 224;
  const x = hover ? Math.min(Math.max(hover.x, W / 2), Math.max(W / 2, hover.w - W / 2)) : 0;
  return (
    <AnimatePresence>
      {hover && (
        <motion.div
          className="pointer-events-none absolute top-0 left-0 z-30"
          initial={{ opacity: 0, scale: 0.96, x, y: hover.y }}
          animate={{ opacity: 1, scale: 1, x, y: hover.y }}
          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.1 } }}
          transition={{ type: "spring", duration: 0.28, bounce: 0 }}
        >
          <div
            className="-translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-xl bg-popover p-3 text-popover-foreground shadow-[0_12px_32px_-12px_color-mix(in_oklab,var(--primary)_40%,transparent)] ring-1 ring-border"
            style={{ width: W }}
          >
            <p className="text-xs text-muted-foreground">{cap(fmt(hover.d, { weekday: "long", day: "numeric", month: "long" }))}</p>
            <p className="font-display text-lg font-semibold">{info ? nCommits(info.n) : "Sin commits"}</p>
            {info && (
              <>
                <div className="mt-2 flex h-1.5 overflow-hidden rounded-full">
                  {info.types.map(([t, n]) => (
                    <span key={t} style={{ width: `${(n / info.n) * 100}%`, background: `var(--t-${t})` }} />
                  ))}
                </div>
                <ul className="mt-2 space-y-0.5 text-xs">
                  {info.types.slice(0, 4).map(([t, n]) => (
                    <li key={t} className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: `var(--t-${t})` }} />
                      <span className="flex-1">{typeLabel(t)}</span>
                      <span className="tabular-nums">{n}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                  {info.repos
                    .slice(0, 3)
                    .map(([r, n]) => `${r} (${n})`)
                    .join(", ")}
                </p>
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
