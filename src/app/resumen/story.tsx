"use client";

import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { type MotionValue, motion, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { fmt } from "@/lib/dates";
import { CopyButton } from "../client";

export type StoryData = {
  month: string;
  label: string;
  prev: string;
  next: string | null;
  days: string[];
  dots: { day: string; type: string; repo: string; env: number }[];
  total: number;
  activeDays: number;
  best: { day: string; label: string; n: number; subjects: string[] } | null;
  types: { k: string; label: string; n: number }[];
  repos: { k: string; n: number }[];
  envs: { k: string; n: number }[];
  done: { title: string; took: string }[];
  copy: string;
};

const SCENES = 8; // lluvia, nube, días, mejor día, tipos, repos, ambientes, calendario
type Pt = { x: number; y: number };
type Label = { text: string; x: number; y: number; align?: CanvasTextAlign; strong?: boolean };
type Rect = { x: number; y: number; w: number; h: number };
type Layout = { pos: Pt[][]; r: number[]; alpha: number[][]; labels: Label[][]; cells: Rect[] };

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** PRNG con semilla: la lluvia cae igual cada vez que recargas. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mayor celda cuadrada que acomoda n puntos en w x h. */
function fit(n: number, w: number, h: number) {
  let best = 0;
  for (let cols = 1; cols <= Math.max(1, n); cols++) best = Math.max(best, Math.min(w / cols, h / Math.ceil(n / cols)));
  return best;
}

/** Coloca n puntos de abajo hacia arriba en columnas de `cols`, dentro de r (x centrado). */
function stack(n: number, rect: Rect, cell: number, colMajor = false) {
  const cols = Math.max(1, Math.floor(rect.w / cell));
  const rows = Math.max(1, Math.floor(rect.h / cell));
  const used = colMajor ? Math.ceil(n / rows) : Math.min(cols, n);
  const x0 = rect.x + (rect.w - used * cell) / 2 + cell / 2;
  return Array.from({ length: n }, (_, i) => {
    const [c, r] = colMajor ? [Math.floor(i / rows), i % rows] : [i % cols, Math.floor(i / cols)];
    return { x: x0 + c * cell, y: rect.y + rect.h - cell / 2 - r * cell };
  });
}

function layout(d: StoryData, w: number, h: number): Layout {
  const n = d.dots.length;
  const narrow = w < 720;
  const m = Math.max(16, w * 0.06);
  const area: Rect = narrow ? { x: m, y: h * 0.42, w: w - 2 * m, h: h * 0.44 } : { x: m, y: h * 0.4, w: w - 2 * m, h: h * 0.48 };
  const rand = rng(n * 31 + d.days.length);
  const pos: Pt[][] = Array.from({ length: SCENES }, () => Array(n));
  const alpha: number[][] = Array.from({ length: SCENES }, () => Array(n).fill(1));
  const labels: Label[][] = Array.from({ length: SCENES }, () => []);
  const r: number[] = Array(SCENES).fill(3);

  // 0-1: lluvia y nube
  d.dots.forEach((_, i) => {
    const x = area.x + rand() * area.w;
    pos[0][i] = { x, y: -20 - rand() * h * 0.8 };
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand());
    pos[1][i] = { x: w / 2 + Math.cos(a) * rr * Math.min(area.w, 520) * 0.5, y: area.y + area.h * 0.5 + Math.sin(a) * rr * area.h * 0.45 };
  });
  r[0] = r[1] = narrow ? 2.6 : 3.4;

  // 2-3: columnas por día (3 = mismo lugar, resalta el mejor día)
  const idx = new Map(d.days.map((day, i) => [day, i]));
  const cw = area.w / d.days.length;
  const perDay = new Map<string, number[]>();
  d.dots.forEach((p, i) => perDay.set(p.day, [...(perDay.get(p.day) ?? []), i]));
  const maxDay = Math.max(1, ...[...perDay.values()].map((v) => v.length));
  let cell = Math.min(cw, 14);
  while (cell > 2 && Math.ceil(maxDay / Math.max(1, Math.floor(cw / cell))) * cell > area.h) cell *= 0.92;
  for (const [day, ids] of perDay) {
    const col: Rect = { x: area.x + idx.get(day)! * cw, y: area.y, w: cw, h: area.h };
    stack(ids.length, col, cell).forEach((p, k) => {
      pos[2][ids[k]] = p;
      pos[3][ids[k]] = day === d.best?.day ? { x: p.x, y: p.y - 14 } : p;
      alpha[3][ids[k]] = day === d.best?.day ? 1 : 0.14;
    });
  }
  r[2] = r[3] = cell * 0.36;
  d.days.forEach((day, i) => {
    const num = Number(day.slice(8));
    if (num === 1 || num % 5 === 0) labels[2].push({ text: String(num), x: area.x + i * cw + cw / 2, y: area.y + area.h + 18, align: "center" });
  });
  if (d.best) labels[3].push({ text: `${d.best.n}`, x: area.x + idx.get(d.best.day)! * cw + cw / 2, y: area.y + area.h - Math.ceil(d.best.n / Math.max(1, Math.floor(cw / cell))) * cell - 26, align: "center", strong: true });

  // 4: franja por tipo (relleno por columnas, cada tipo queda como un bloque de color)
  const band: Rect = { x: area.x, y: area.y + area.h * 0.25, w: area.w, h: area.h * 0.5 };
  const order = d.types.map((t) => t.k);
  const byType = d.dots.map((p, i) => ({ p, i })).sort((a, b) => order.indexOf(a.p.type) - order.indexOf(b.p.type) || a.i - b.i);
  const c4 = fit(n, band.w, band.h);
  const p4 = stack(n, band, c4, true);
  byType.forEach(({ i }, k) => (pos[4][i] = p4[k]));
  r[4] = c4 * 0.36;
  let k4 = 0;
  for (const t of d.types) {
    const xs = byType.slice(k4, k4 + t.n).map(({ i }) => pos[4][i].x);
    k4 += t.n;
    if (xs.length && (Math.max(...xs) - Math.min(...xs) > 30 || d.types.length < 6))
      labels[4].push({ text: `${t.n} ${t.label}`, x: (Math.min(...xs) + Math.max(...xs)) / 2, y: band.y + band.h + 20, align: "center" });
  }

  // 5: bloques por repo
  const gap = narrow ? 8 : 18;
  const blockH = area.h * 0.62;
  let c5 = blockH / 2;
  const width5 = (c: number) => d.repos.reduce((s, rp) => s + Math.ceil(rp.n / Math.max(1, Math.floor(blockH / c))) * c, 0) + gap * (d.repos.length - 1);
  while (c5 > 2 && width5(c5) > area.w) c5 *= 0.94;
  let x5 = area.x + (area.w - width5(c5)) / 2;
  for (const rp of d.repos) {
    const ids = d.dots.map((p, i) => (p.repo === rp.k ? i : -1)).filter((i) => i >= 0);
    const bw = Math.ceil(rp.n / Math.max(1, Math.floor(blockH / c5))) * c5;
    stack(ids.length, { x: x5, y: area.y + area.h * 0.12, w: bw, h: blockH }, c5, true).forEach((p, k) => (pos[5][ids[k]] = p));
    labels[5].push({ text: `${rp.n}`, x: x5 + bw / 2, y: area.y + area.h * 0.12 + blockH + 20, align: "center", strong: true });
    if (!narrow || d.repos.length <= 3) labels[5].push({ text: rp.k.replace(/^(frontend|backend)-/, ""), x: x5 + bw / 2, y: area.y + area.h * 0.12 + blockH + 38, align: "center" });
    x5 += bw + gap;
  }
  r[5] = c5 * 0.36;

  // 6: escalera de ambientes (cada commit se para en el más alto al que llegó)
  const stepW = (area.w - gap * 4) / 5;
  const rise = area.h * 0.13;
  const maxH = area.h - rise * 4;
  let c6 = Math.min(stepW, 14);
  while (c6 > 2 && d.envs.some((e) => Math.ceil(e.n / Math.max(1, Math.floor(stepW / c6))) * c6 > maxH)) c6 *= 0.92;
  d.envs.forEach((e, lvl) => {
    const ids = d.dots.map((p, i) => (p.env === lvl ? i : -1)).filter((i) => i >= 0);
    const step: Rect = { x: area.x + lvl * (stepW + gap), y: area.y + area.h - lvl * rise - maxH, w: stepW, h: maxH };
    stack(ids.length, step, c6).forEach((p, k) => (pos[6][ids[k]] = p));
    labels[6].push({ text: `${e.n}`, x: step.x + stepW / 2, y: step.y + step.h + 20, align: "center", strong: true });
    labels[6].push({ text: e.k, x: step.x + stepW / 2, y: step.y + step.h + 38, align: "center" });
  });
  r[6] = c6 * 0.36;

  // 7: calendario del mes
  const lead = (new Date(`${d.days[0]}T00:00:00Z`).getUTCDay() + 6) % 7;
  const weeks = Math.ceil((lead + d.days.length) / 7);
  const cal: Rect = narrow ? { x: m, y: h * 0.14, w: w - 2 * m, h: h * 0.36 } : { x: m, y: h * 0.16, w: w * 0.46 - m, h: h * 0.68 };
  const side = Math.min(cal.w / 7, cal.h / weeks);
  const cx0 = cal.x + (cal.w - side * 7) / 2;
  const cells: Rect[] = d.days.map((_, i) => {
    const j = lead + i;
    return { x: cx0 + (j % 7) * side + 2, y: cal.y + Math.floor(j / 7) * side + 2, w: side - 4, h: side - 4 };
  });
  const k7 = Math.ceil(Math.sqrt(maxDay));
  const c7 = (side - 10) / k7;
  for (const [day, ids] of perDay) {
    const c = cells[idx.get(day)!];
    stack(ids.length, { x: c.x + 3, y: c.y + 3, w: c.w - 6, h: c.h - 6 }, c7).forEach((p, k) => (pos[7][ids[k]] = p));
  }
  r[7] = c7 * 0.38;
  ["L", "M", "M", "J", "V", "S", "D"].forEach((t, i) => labels[7].push({ text: t, x: cx0 + i * side + side / 2, y: cal.y - 8, align: "center" }));

  return { pos, r, alpha, labels, cells };
}

function useColors() {
  const read = () => {
    const s = getComputedStyle(document.documentElement);
    const v = (k: string) => s.getPropertyValue(k).trim();
    return { type: (t: string) => v(`--t-${t}`) || v("--t-other"), muted: v("--muted-foreground"), fg: v("--foreground"), cell: v("--heat-0"), font: getComputedStyle(document.body).fontFamily };
  };
  const ref = useRef<ReturnType<typeof read> | null>(null);
  useEffect(() => {
    ref.current = read();
    // El tema cambia la clase de <html>: se releen los colores.
    const mo = new MutationObserver(() => (ref.current = read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => mo.disconnect();
  }, []);
  return ref;
}

export function Story({ data }: { data: StoryData }) {
  const reduce = useReducedMotion();
  if (reduce || data.total === 0) return <StaticSummary data={data} />;
  return <Animated data={data} />;
}

function Animated({ data }: { data: StoryData }) {
  const section = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0 });
  const lay = useRef<Layout | null>(null);
  const colors = useColors();
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  const t = useTransform(scrollYProgress, (p) => p * (SCENES - 1));
  const stagger = useMemo(() => data.dots.map((_, i) => ((i * 37) % 101) / 101), [data.dots]);

  const draw = useCallback(() => {
    const cv = canvas.current;
    const L = lay.current;
    const col = colors.current;
    if (!cv || !L || !col) return;
    const ctx = cv.getContext("2d")!;
    const { w, h } = size.current;
    ctx.clearRect(0, 0, w, h);
    const tv = t.get();
    const k = Math.min(SCENES - 2, Math.floor(tv));
    const f = tv - k;
    const near = (s: number) => clamp(1 - Math.abs(tv - s) * 2.2);

    // celdas del calendario, que aparecen al llegar a la última escena
    const calA = near(SCENES - 1);
    if (calA > 0) {
      ctx.globalAlpha = calA;
      ctx.fillStyle = col.cell;
      for (const c of L.cells) {
        ctx.beginPath();
        ctx.roundRect(c.x, c.y, c.w, c.h, Math.min(10, c.w * 0.18));
        ctx.fill();
      }
    }

    const r = L.r[k] + (L.r[k + 1] - L.r[k]) * ease(clamp(f));
    data.dots.forEach((dot, i) => {
      // cada punto arranca un poco después que otro: el movimiento se siente orgánico, no en bloque
      const fi = ease(clamp((f - stagger[i] * 0.35) / 0.65));
      const a = L.pos[k][i];
      const b = L.pos[k + 1][i];
      ctx.globalAlpha = L.alpha[k][i] + (L.alpha[k + 1][i] - L.alpha[k][i]) * fi;
      ctx.fillStyle = col.type(dot.type);
      ctx.beginPath();
      ctx.arc(a.x + (b.x - a.x) * fi, a.y + (b.y - a.y) * fi, Math.max(1, r), 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.textBaseline = "alphabetic";
    L.labels.forEach((list, s) => {
      const la = near(s);
      if (la <= 0) return;
      ctx.globalAlpha = la;
      for (const l of list) {
        ctx.font = `${l.strong ? 600 : 400} ${l.strong ? 14 : 12}px ${col.font}`;
        ctx.fillStyle = l.strong ? col.fg : col.muted;
        ctx.textAlign = l.align ?? "left";
        ctx.fillText(l.text, l.x, l.y);
      }
    });
    ctx.globalAlpha = 1;
  }, [colors, data.dots, stagger, t]);

  useEffect(() => {
    const cv = canvas.current!;
    const resize = () => {
      const w = cv.clientWidth;
      const h = cv.clientHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = w * dpr;
      cv.height = h * dpr;
      cv.getContext("2d")!.setTransform(dpr, 0, 0, dpr, 0, 0);
      size.current = { w, h };
      lay.current = layout(data, w, h);
      draw();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(cv);
    return () => ro.disconnect();
  }, [data, draw]);

  useMotionValueEvent(t, "change", () => requestAnimationFrame(draw));

  return (
    <main ref={section} className="relative" style={{ height: `${SCENES * 100}vh` }}>
      <div className="sticky top-0 h-dvh overflow-hidden">
        <canvas ref={canvas} className="absolute inset-0 size-full" aria-hidden />
        <TopBar data={data} />
        <Captions data={data} t={t} />
      </div>
    </main>
  );
}

function TopBar({ data }: { data: StoryData }) {
  return (
    <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 py-4 sm:px-8">
      <Link href={`/?month=${data.month}`} className="press flex h-10 items-center gap-2 rounded-full bg-card/80 px-4 text-sm font-medium ring-1 ring-border backdrop-blur">
        <ArrowLeft className="size-4" />
        Shiplog
      </Link>
      <div className="flex items-center gap-1 rounded-full bg-card/80 ring-1 ring-border backdrop-blur">
        <Link href={`/resumen?month=${data.prev}`} aria-label="Mes anterior" className="flex size-10 items-center justify-center rounded-full hover:bg-muted">
          <ChevronLeft className="size-4" />
        </Link>
        {data.next ? (
          <Link href={`/resumen?month=${data.next}`} aria-label="Mes siguiente" className="flex size-10 items-center justify-center rounded-full hover:bg-muted">
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span aria-hidden className="flex size-10 items-center justify-center text-muted-foreground/30">
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </div>
  );
}

/** Cada texto vive alrededor de su escena: entra subiendo, sale subiendo. */
function Scene({ t, at, className, children }: { t: MotionValue<number>; at: number; className?: string; children: React.ReactNode }) {
  const opacity = useTransform(t, [at - 0.55, at - 0.2, at + 0.2, at + 0.55], [0, 1, 1, 0]);
  const y = useTransform(t, [at - 0.55, at, at + 0.55], [28, 0, -28]);
  const last = at === SCENES - 1;
  const o = useTransform(t, [at - 0.55, at - 0.15], [0, 1]);
  return (
    <motion.div style={{ opacity: last ? o : opacity, y: last ? 0 : y }} className={className}>
      {children}
    </motion.div>
  );
}

const H = "font-display text-[clamp(2rem,6vw,4rem)] leading-[1.02] font-semibold tracking-[-0.03em] text-balance";
const P = "mt-3 max-w-[46ch] text-[clamp(1rem,2vw,1.25rem)] text-muted-foreground";

function Captions({ data, t }: { data: StoryData; t: MotionValue<number> }) {
  const box = "pointer-events-none absolute inset-x-0 top-[12%] px-4 sm:px-[6%]";
  const topRepo = data.repos[0];
  const reached = data.envs[4].n;
  return (
    <>
      <Scene t={t} at={0} className={box}>
        <p className="text-sm text-muted-foreground">Tu mes en commits</p>
        <h1 className={H}>{data.label}</h1>
        <p className={`${P} flex items-center gap-2`}>
          Baja para armarlo
          <ChevronDown className="size-5 animate-bounce" />
        </p>
      </Scene>
      <Scene t={t} at={1} className={box}>
        <h2 className={H}>{data.total} commits.</h2>
        <p className={P}>
          En {data.repos.length} {data.repos.length === 1 ? "repo" : "repos"} y {data.activeDays} de {data.days.length} días. Cada punto es uno, con el color de su tipo.
        </p>
      </Scene>
      <Scene t={t} at={2} className={box}>
        <h2 className={H}>Así se repartieron.</h2>
        <p className={P}>Una columna por día del mes. {data.activeDays < data.days.length ? `${data.days.length - data.activeDays} días sin commits.` : "Ni un día en blanco."}</p>
      </Scene>
      <Scene t={t} at={3} className={box}>
        {data.best && (
          <>
            <p className="text-sm text-muted-foreground">Tu mejor día</p>
            <h2 className={H}>
              {data.best.label.charAt(0).toUpperCase() + data.best.label.slice(1)}, {data.best.n} commits.
            </h2>
            <ul className="mt-3 max-w-[60ch] space-y-1 text-sm text-muted-foreground">
              {data.best.subjects.map((s, i) => (
                <li key={i} className="truncate">
                  {s}
                </li>
              ))}
            </ul>
          </>
        )}
      </Scene>
      <Scene t={t} at={4} className={box}>
        <h2 className={H}>
          {data.types.slice(0, 2).map((x, i) => (
            <span key={x.k}>
              <span style={{ color: `var(--t-${x.k})` }}>
                {x.n} {x.label}
              </span>
              {i === 0 && data.types.length > 1 ? " y " : ""}
            </span>
          ))}
          .
        </h2>
        <p className={P}>Los mismos puntos, ahora juntos por tipo.</p>
      </Scene>
      <Scene t={t} at={5} className={box}>
        <h2 className={H}>{topRepo ? `${topRepo.k} se llevó ${topRepo.n}.` : ""}</h2>
        <p className={P}>Un bloque por repo, del que más trabajo tuvo al que menos.</p>
      </Scene>
      <Scene t={t} at={6} className={box}>
        <h2 className={H}>{reached === data.total ? "Todo llegó a main." : `${reached} de ${data.total} llegaron a main.`}</h2>
        <p className={P}>
          Cada commit se para en el ambiente más alto al que llegó, según el último fetch.
          {data.envs[0].n ? ` ${data.envs[0].n} siguen solo en local.` : ""}
        </p>
      </Scene>
      <Scene t={t} at={7} className="absolute inset-x-0 bottom-0 px-4 pb-6 sm:top-[16%] sm:bottom-auto sm:left-1/2 sm:px-0 sm:pr-[6%] sm:pb-0">
        <FinalCard data={data} />
      </Scene>
    </>
  );
}

function FinalCard({ data }: { data: StoryData }) {
  return (
    <div className="rounded-3xl bg-card/90 p-5 ring-1 ring-border backdrop-blur sm:p-7">
      <p className="text-sm text-muted-foreground">Resumen</p>
      <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{data.label}</h2>
      <dl className="mt-4 grid grid-cols-3 gap-3">
        {[
          ["Commits", data.total],
          ["Días activos", data.activeDays],
          ["Tareas hechas", data.done.length],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="font-display text-2xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full">
        {data.types.map((x) => (
          <span key={x.k} title={`${x.n} ${x.label}`} style={{ width: `${(x.n / Math.max(1, data.total)) * 100}%`, background: `var(--t-${x.k})` }} />
        ))}
      </div>
      {data.done.length > 0 && (
        <ul className="mt-4 max-h-28 space-y-1 overflow-y-auto text-sm sm:max-h-40">
          {data.done.map((x, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[var(--t-docs)]">✓</span>
              <span className="min-w-0 flex-1 truncate">{x.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{x.took}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="pointer-events-auto mt-3 -ml-2.5 flex flex-wrap items-center gap-1">
        <CopyButton text={data.copy} label="Copiar resumen" />
        <Link href={`/?month=${data.month}`} className="h-10 content-center rounded-lg px-3 text-sm font-semibold text-primary hover:underline">
          Ver el detalle
        </Link>
      </div>
    </div>
  );
}

/** Versión sin animación: misma información, en secciones normales. */
function StaticSummary({ data }: { data: StoryData }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-20 pb-24 sm:px-8">
      <TopBar data={data} />
      {data.total === 0 ? (
        <p className="font-display text-3xl font-semibold">{data.label} no tiene commits.</p>
      ) : (
        <div className="space-y-8">
          <FinalCard data={data} />
          {data.best && (
            <p>
              Mejor día: {data.best.label}, {data.best.n} commits.
            </p>
          )}
          <ul className="space-y-1 text-sm">
            {data.repos.map((x) => (
              <li key={x.k}>
                {x.k}: {x.n}
              </li>
            ))}
          </ul>
          <ul className="space-y-1 text-sm">
            {data.envs.map((x) => (
              <li key={x.k}>
                {x.k}: {x.n}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Generado {fmt(`${data.month}-01`, { month: "long", year: "numeric" })}.</p>
        </div>
      )}
    </main>
  );
}
