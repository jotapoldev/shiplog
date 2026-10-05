"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RepoCombobox, type RepoInfo } from "@/components/repo-combobox";
import { Button } from "@/components/ui/button";
import { addMonths, fmt, mondayOf, monthDays, monthEnd, monthLabel, rangeLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";

const EASE = [0.23, 1, 0.32, 1] as const;
const label = (t: string) => (t === "other" ? "sin tipo" : t);

/** Devuelve un href con los params actuales + `patch` (string vacío = quitar). */
export function useHref() {
  const sp = useSearchParams();
  const pathname = usePathname();
  return (patch: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const q = p.toString();
    return q ? `${pathname}?${q}` : pathname;
  };
}

function useMobile() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(max-width: 639px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(max-width: 639px)").matches,
    () => false,
  );
}

type FilterProps = {
  repos: RepoInfo[];
  types: string[];
  counts: Record<string, number>;
  today: string;
  repo: string;
  type: string;
  from: string;
  to: string;
  month: string;
  hasRange: boolean;
};

export function FilterBar({ repos, types, counts, today, repo, type, from, to, month, hasRange }: FilterProps) {
  const router = useRouter();
  const href = useHref();
  const [open, setOpen] = useState(false);
  const go = (patch: Record<string, string>) => router.push(href(patch), { scroll: false });
  const any = Boolean(repo || type || hasRange || month);

  return (
    <div className="flex flex-col gap-3 border-y border-border py-4">
      <div className="relative flex flex-wrap gap-2">
        <Button
          variant="outline"
          className={cn("press h-10 flex-1 justify-start gap-2 rounded-full bg-card px-4 sm:flex-none", (hasRange || month) && "border-primary/40 text-primary")}
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((o) => !o)}
        >
          <CalendarDays />
          {month ? monthLabel(month) : hasRange ? rangeLabel(from, to) : "Últimos 30 días"}
        </Button>

        <RepoCombobox repos={repos} value={repo} allLabel="Todos los repos" className="flex-1 sm:w-64 sm:flex-none" onChange={(v) => go({ repo: v })} />

        {any && (
          <Button variant="ghost" className="h-10 px-3 font-semibold text-primary" onClick={() => router.push("/", { scroll: false })}>
            Limpiar filtros
          </Button>
        )}

        <AnimatePresence>
          {open && (
            <CalendarPanel
              counts={counts}
              today={today}
              initialFrom={hasRange ? from : month ? `${month}-01` : ""}
              initialTo={hasRange ? to : month ? monthEnd(month) : ""}
              onClose={() => setOpen(false)}
              onApply={(f, t) => {
                setOpen(false);
                go({ from: f, to: t, month: "", day: "" });
              }}
              onFocusMonth={(ym) => {
                setOpen(false);
                go({ month: ym, day: "", from: "", to: "" });
              }}
            />
          )}
        </AnimatePresence>
      </div>

      <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Tipo de commit">
        {types.map((t) => {
          const on = type === t;
          return (
            <button
              key={t}
              aria-pressed={on}
              onClick={() => go({ type: on ? "" : t })}
              className={cn(
                "press flex h-10 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm transition-colors",
                on ? "border-transparent bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="size-2 rounded-full" style={{ background: `var(--t-${t})` }} />
              {label(t)}
            </button>
          );
        })}
      </div>

    </div>
  );
}

type CalendarProps = {
  counts: Record<string, number>;
  today: string;
  initialFrom: string;
  initialTo: string;
  onClose: () => void;
  onApply: (from: string, to: string) => void;
  onFocusMonth: (ym: string) => void;
};

function CalendarPanel({ counts, today, initialFrom, initialTo, onClose, onApply, onFocusMonth }: CalendarProps) {
  const mobile = useMobile();
  const ref = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState(initialFrom);
  const [end, setEnd] = useState(initialTo);
  const [view, setView] = useState((initialFrom || today).slice(0, 7));
  const [dir, setDir] = useState(0);
  const [picker, setPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(Number(view.slice(0, 4)));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as Element).closest("[aria-haspopup=dialog]")) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  const move = (n: number) => {
    setDir(n);
    setView((v) => addMonths(v, n));
  };
  const select = (f: string, t: string) => {
    setStart(f);
    setEnd(t);
    setDir(f.slice(0, 7) < view ? -1 : 1);
    setView(f.slice(0, 7));
  };
  const tap = (d: string) => {
    if (!start || end) {
      setStart(d);
      setEnd("");
    } else if (d < start) {
      setEnd(start);
      setStart(d);
    } else setEnd(d);
  };

  const days = monthDays(view);
  const lead = (new Date(`${days[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array(lead).fill(null), ...days];
  while (cells.length < 42) cells.push(null);
  const max = Math.max(1, ...days.map((d) => counts[d] ?? 0));
  const lo = start;
  const hi = end || start;
  const thisMonth = today.slice(0, 7);
  const shortcuts: [string, string, string][] = [
    ["Hoy", today, today],
    ["Esta semana", mondayOf(today), today],
    ["Este mes", `${thisMonth}-01`, today],
    ["Mes pasado", `${addMonths(thisMonth, -1)}-01`, monthEnd(addMonths(thisMonth, -1))],
  ];

  return (
    <>
      {mobile && (
        <motion.div
          className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        />
      )}
      <motion.div
        ref={ref}
        role="dialog"
        aria-label="Elegir fechas"
        initial={mobile ? { y: "100%" } : { opacity: 0, scale: 0.97, y: -4 }}
        animate={mobile ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
        exit={mobile ? { y: "100%", transition: { duration: 0.2 } } : { opacity: 0, scale: 0.97, transition: { duration: 0.12 } }}
        transition={mobile ? { duration: 0.32, ease: [0.32, 0.72, 0, 1] } : { duration: 0.18, ease: EASE }}
        style={{ transformOrigin: "top left" }}
        className={cn(
          "z-50 bg-popover p-4 text-popover-foreground shadow-[0_12px_40px_-12px_color-mix(in_oklab,var(--primary)_35%,transparent)] ring-1 ring-border",
          mobile ? "fixed inset-x-0 bottom-0 rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]" : "absolute top-12 left-0 w-[22rem] rounded-2xl",
        )}
      >
        {mobile && <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border" />}

        <div className="flex items-center justify-between gap-1">
          <button
            onClick={() => {
              setPickerYear(Number(view.slice(0, 4)));
              setPicker((p) => !p);
            }}
            className="press flex h-10 min-w-0 items-center gap-1 rounded-lg px-2 font-display text-lg font-semibold whitespace-nowrap"
            aria-expanded={picker}
          >
            {monthLabel(view).replace(" de ", " ")}
            <ChevronDown className={cn("size-4 text-primary transition-transform duration-200", picker && "rotate-180")} />
          </button>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="size-10" aria-label={`Enfocar ${monthLabel(view)}`} title="Ver el mes en foco" onClick={() => onFocusMonth(view)}>
              <Maximize2 />
            </Button>
            {!picker && (
              <>
                <Button variant="ghost" size="icon" className="size-10" aria-label="Mes anterior" onClick={() => move(-1)}>
                  <ChevronLeft />
                </Button>
                <Button variant="ghost" size="icon" className="size-10" aria-label="Mes siguiente" onClick={() => move(1)}>
                  <ChevronRight />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="relative mt-2 h-[17.5rem] overflow-hidden">
          <AnimatePresence initial={false} mode="popLayout" custom={dir}>
            {picker ? (
              <motion.div
                key="picker"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: EASE }}
                className="absolute inset-0"
              >
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="icon" className="size-10" aria-label="Año anterior" onClick={() => setPickerYear((y) => y - 1)}>
                    <ChevronLeft />
                  </Button>
                  <span className="font-semibold tabular-nums">{pickerYear}</span>
                  <Button variant="ghost" size="icon" className="size-10" aria-label="Año siguiente" onClick={() => setPickerYear((y) => y + 1)}>
                    <ChevronRight />
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {Array.from({ length: 12 }, (_, i) => `${pickerYear}-${String(i + 1).padStart(2, "0")}`).map((ym) => (
                    <button
                      key={ym}
                      onClick={() => {
                        setDir(ym < view ? -1 : 1);
                        setView(ym);
                        setPicker(false);
                      }}
                      className={cn(
                        "press h-11 rounded-xl text-sm capitalize",
                        ym === view ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                        ym === thisMonth && ym !== view && "text-primary font-semibold",
                      )}
                    >
                      {monthLabel(ym, { month: "short" }).replace(".", "")}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key={view}
                custom={dir}
                variants={{
                  enter: (d: number) => ({ x: d * 28, opacity: 0 }),
                  center: { x: 0, opacity: 1 },
                  exit: (d: number) => ({ x: d * -28, opacity: 0 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.18, ease: EASE }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.18}
                onDragEnd={(_, info) => {
                  if (info.offset.x < -48 || info.velocity.x < -400) move(1);
                  else if (info.offset.x > 48 || info.velocity.x > 400) move(-1);
                }}
                className="absolute inset-0 touch-pan-y select-none"
              >
                <div className="grid grid-cols-7 pb-1 text-center text-xs text-muted-foreground">
                  {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                    <span key={i}>{d}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-y-0.5">
                  {cells.map((d, i) => {
                    if (!d) return <span key={i} className="h-10" />;
                    const col = i % 7;
                    const inRange = Boolean(lo && end && d >= lo && d <= hi);
                    const edge = d === lo || d === hi;
                    const n = counts[d] ?? 0;
                    const future = d > today;
                    return (
                      <button
                        key={d}
                        disabled={future}
                        onClick={() => tap(d)}
                        aria-pressed={edge || inRange}
                        aria-label={`${fmt(d, { weekday: "long", day: "numeric", month: "long" })}, ${n} commits`}
                        className="group relative h-10 disabled:opacity-30"
                      >
                        {inRange && lo !== hi && (
                          <span
                            className={cn(
                              "absolute inset-y-1 bg-primary/12",
                              d === lo ? "left-1/2" : "left-0",
                              d === hi ? "right-1/2" : "right-0",
                              (col === 0 || d.endsWith("-01")) && d !== lo && "left-1 rounded-l-full",
                              (col === 6 || d === days.at(-1)) && d !== hi && "right-1 rounded-r-full",
                            )}
                          />
                        )}
                        <span
                          className={cn(
                            "relative mx-auto flex size-9 flex-col items-center justify-center rounded-full text-sm tabular-nums transition-colors duration-150",
                            edge && lo ? "bg-primary font-semibold text-primary-foreground" : "group-hover:bg-muted",
                            d === today && !edge && "font-semibold text-primary",
                          )}
                        >
                          {Number(d.slice(8))}
                          <span
                            className={cn("absolute bottom-1 size-1 rounded-full", edge && lo ? "bg-primary-foreground" : "bg-primary")}
                            style={{ opacity: n ? 0.35 + 0.65 * (n / max) : 0 }}
                          />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="no-scrollbar -mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1">
          {shortcuts.map(([name, f, t]) => (
            <button
              key={name}
              onClick={() => select(f, t)}
              className={cn(
                "press h-9 shrink-0 rounded-full border px-3 text-xs transition-colors",
                start === f && (end || start) === t ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
              )}
            >
              {name}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {start ? rangeLabel(start, end || start) : "Toca un día o un rango"}
          </span>
          <div className="flex shrink-0 gap-1">
            <Button variant="ghost" size="icon" className="size-10" aria-label="Cerrar" onClick={onClose}>
              <X />
            </Button>
            <Button className="press h-10 px-4" disabled={!start} onClick={() => onApply(start, end || start)}>
              Aplicar
            </Button>
          </div>
        </div>
      </motion.div>
    </>
  );
}

/** Esc sale del modo foco (salvo que algo abierto, como el calendario, ya lo haya consumido). */
export function FocusEscape({ exitHref }: { exitHref: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if ((e.target as Element).closest("input, textarea, select")) return;
      router.push(exitHref, { scroll: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exitHref, router]);
  return null;
}

