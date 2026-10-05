"use client";

import { RepoCombobox, type RepoInfo } from "@/components/repo-combobox";
import { Cherry, GitMerge, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { memo, useState, useSyncExternalStore } from "react";
import { fmt } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { CopyButton } from "../client";

const EASE = [0.23, 1, 0.32, 1] as const;
/** Geometría del grafo; en pantallas angostas los carriles se juntan y la fila usa dos líneas. */
const WIDE = { row: 38, lane: 16, pad: 14 };
const NARROW = { row: 54, lane: 11, pad: 9 };
type Geo = typeof WIDE;
const narrowQuery = "(max-width: 639px)";
const subscribe = (cb: () => void) => {
  const m = matchMedia(narrowQuery);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const useNarrow = () => useSyncExternalStore(subscribe, () => matchMedia(narrowQuery).matches, () => false);
const FAMILIES = ["main", "uat", "staging", "qa", "develop", "hotfix", "release", "feature", "other"];
const LABEL: Record<string, string> = { other: "otras", feature: "feature/*", hotfix: "hotfix/*", release: "release/*" };

const b = (fam: string) => `var(--b-${fam})`;
const tint = (fam: string, pct = 14) => `color-mix(in oklab, var(--b-${fam}) ${pct}%, transparent)`;
const nCommits = (n: number) => `${n} ${n === 1 ? "commit" : "commits"}`;
const when = (at: string) => fmt(at.slice(0, 10), { day: "numeric", month: "short" });

export type GNode = {
  hash: string;
  row: number;
  col: number;
  branch: string;
  fam: string;
  type: string;
  scope: string | null;
  subject: string;
  refs: { name: string; fam: string }[];
  merge: boolean;
  twins: string[];
  at: string;
  author: string;
  mine: boolean;
};
type GSeg = { row: number; from: number; to: number; fam: string };
type PCommit = { hash: string; at: string; author: string; email: string; type: string; subject: string };
type Pending = { from: string; to: string; commits: PCommit[] };

/* ---------- Ruta de ambientes: develop → qa → uat → main ---------- */

export function Pipeline({ envs, fams, promote, backport, email }: { envs: string[]; fams: Record<string, string>; promote: Pending[]; backport: Pending | null; email: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const all = [...promote, ...(backport ? [backport] : [])];
  const sel = all.find((p) => `${p.from}>${p.to}` === open);

  return (
    <div className="mt-10">
      <ol className="grid items-start" style={{ gridTemplateColumns: `auto ${"minmax(0,1fr) auto ".repeat(envs.length - 1)}` }}>
        {envs.map((env, i) => {
          const p = promote[i];
          return [
            <li key={env} className="flex flex-col items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full" style={{ background: tint(fams[env], 22) }}>
                <span className="size-3 rounded-full" style={{ background: b(fams[env]) }} />
              </span>
              <span className="font-display text-base font-semibold sm:text-lg">{env}</span>
            </li>,
            p && (
              <li key={`${env}-gap`} className="relative flex h-6 items-center px-1 sm:px-2">
                <span
                  aria-hidden
                  className="h-[3px] w-full rounded-full"
                  style={
                    p.commits.length
                      ? { backgroundImage: `repeating-linear-gradient(90deg, ${b(fams[p.from])} 0 6px, transparent 6px 11px)` }
                      : { background: `linear-gradient(90deg, ${b(fams[p.from])}, ${b(fams[p.to])})` }
                  }
                />
                {p.commits.length ? (
                  <button
                    type="button"
                    aria-expanded={open === `${p.from}>${p.to}`}
                    onClick={() => setOpen(open === `${p.from}>${p.to}` ? null : `${p.from}>${p.to}`)}
                    className={cn(
                      "press absolute top-1/2 left-1/2 flex h-8 -translate-x-1/2 -translate-y-1/2 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-semibold whitespace-nowrap ring-1 transition-colors duration-200 sm:text-sm",
                      open === `${p.from}>${p.to}` ? "bg-foreground text-background ring-foreground" : "bg-card text-foreground ring-border hover:ring-foreground/40",
                    )}
                  >
                    <span className="tabular-nums">{p.commits.length}</span>
                    <span className="max-sm:hidden">por subir</span>
                  </button>
                ) : (
                  <span className="absolute top-full left-1/2 mt-1 -translate-x-1/2 text-xs whitespace-nowrap text-muted-foreground">al día</span>
                )}
              </li>
            ),
          ];
        })}
      </ol>

      {backport && backport.commits.length > 0 && (
        <button
          type="button"
          aria-expanded={open === `${backport.from}>${backport.to}`}
          onClick={() => setOpen(open === `${backport.from}>${backport.to}` ? null : `${backport.from}>${backport.to}`)}
          className="press mt-8 flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-[color-mix(in_oklab,var(--b-hotfix)_12%,transparent)] px-4 py-2 text-left text-sm font-medium text-[var(--b-hotfix)]"
        >
          <TriangleAlert className="size-4 shrink-0" />
          {nCommits(backport.commits.length)} de {backport.from} no {backport.commits.length === 1 ? "está" : "están"} en {backport.to}: hotfix o cherry-pick que falta bajar.
        </button>
      )}

      <AnimatePresence initial={false}>
        {sel && (
          <motion.div
            key={open}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
            transition={{ duration: 0.22, ease: EASE }}
            className="mt-6 rounded-2xl bg-card p-4 ring-1 ring-border sm:p-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                En {sel.from}, todavía no en {sel.to}
              </h2>
              <CopyButton label="Copiar lista" text={[`${sel.from} → ${sel.to} (${nCommits(sel.commits.length)})`, ...sel.commits.map((c) => `- ${c.hash.slice(0, 7)} ${c.subject}`)].join("\n")} />
            </div>
            <ul className="mt-3 max-h-80 divide-y divide-border overflow-y-auto">
              {sel.commits.map((c) => (
                <li key={c.hash} className="flex items-baseline gap-3 py-2 text-sm">
                  <span className="w-14 shrink-0 text-xs font-semibold" style={{ color: `var(--t-${c.type})` }}>
                    {c.type === "other" ? "" : c.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.subject}</span>
                  <span className="shrink-0 text-xs text-muted-foreground max-sm:hidden">{c.email.toLowerCase() === email ? "tú" : c.author.split(" ")[0]}</span>
                  <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{when(c.at)}</span>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Grafo ---------- */

const x = (g: Geo, col: number) => g.pad + col * g.lane;
const y = (g: Geo, row: number) => row * g.row + g.row / 2;

function segPath(g: Geo, { row, from, to }: GSeg) {
  const [x1, y1, x2, y2] = [x(g, from), y(g, row), x(g, to), y(g, row + 1)];
  return from === to ? `M${x1} ${y1}V${y2}` : `M${x1} ${y1}C${x1} ${y1 + g.row * 0.6} ${x2} ${y2 - g.row * 0.6} ${x2} ${y2}`;
}

/** Marca (o desmarca) en el DOM las filas gemelas: evita re-renderizar cientos de filas al pasar el mouse. */
function markTwins(twins: string[], on: boolean) {
  for (const h of twins) {
    const el = document.getElementById(`c-${h}`);
    if (el) el.dataset.twin = on ? "1" : "";
  }
}

export function Graph({ nodes, segs, width }: { nodes: GNode[]; segs: GSeg[]; width: number }) {
  const [focus, setFocus] = useState<string | null>(null);
  const narrow = useNarrow();
  const present = FAMILIES.filter((f) => nodes.some((n) => n.fam === f));
  const dim = (fam: string) => focus !== null && fam !== focus;

  return (
    <section aria-label="Grafo de ramas">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border pb-4">
        <h2 className="font-display text-xl font-semibold tracking-tight">Historia</h2>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Resaltar una familia de ramas">
          {present.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={focus === f}
              onClick={() => setFocus(focus === f ? null : f)}
              className={cn(
                "press flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-semibold ring-1 transition-[opacity,background-color] duration-200",
                focus === f ? "ring-transparent" : "ring-border hover:bg-card",
                dim(f) && "opacity-45",
              )}
              style={focus === f ? { background: tint(f, 18), color: b(f) } : undefined}
            >
              <span className="size-2 rounded-full" style={{ background: b(f) }} />
              {LABEL[f] ?? f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground sm:ml-auto">
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden>
              <circle cx="6" cy="6" r="4.5" fill="currentColor" />
            </svg>
            tuyo
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="12" height="12" aria-hidden>
              <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            de otros
          </span>
          <span className="flex items-center gap-1.5">
            <Cherry className="size-3.5" />
            cherry-pick
          </span>
        </div>
      </div>

      <div className="graph relative" data-focus={focus ?? undefined}>
        <GraphBody nodes={nodes} segs={segs} width={width} narrow={narrow} />
      </div>
    </section>
  );
}

function jump(hash: string) {
  const el = document.getElementById(`c-${hash}`);
  if (!el) return;
  el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  el.animate([{ backgroundColor: "color-mix(in oklab, var(--primary) 18%, transparent)" }, { backgroundColor: "transparent" }], { duration: 1400, easing: "ease-out", pseudoElement: "::before" });
}

/** Filas y SVG: se renderizan una vez por repo; resaltar una rama es CSS (ver .graph en globals.css). */
const GraphBody = memo(function GraphBody({ nodes, segs, width, narrow }: { nodes: GNode[]; segs: GSeg[]; width: number; narrow: boolean }) {
  const byHash = new Map(nodes.map((n) => [n.hash, n]));
  const g = narrow ? NARROW : WIDE;
  const svgW = g.pad * 2 + (width - 1) * g.lane;
  return (
    <>
        <svg
          aria-hidden
          width={svgW}
          height={nodes.length * g.row}
          className="pointer-events-none absolute top-0 left-0"
        >
          <g fill="none" strokeWidth={narrow ? 2 : 2.5} strokeLinecap="round">
            {segs.map((s, i) => (
              <path key={i} d={segPath(g, s)} stroke={b(s.fam)} data-fam={s.fam} />
            ))}
          </g>
          {nodes.map((n) => (
            <circle
              key={n.hash}
              cx={x(g, n.col)}
              cy={y(g, n.row)}
              r={n.merge ? 3.5 : n.mine ? (narrow ? 4.5 : 5.5) : narrow ? 3.5 : 4.5}
              fill={n.mine || n.merge ? b(n.fam) : "var(--background)"}
              stroke={n.mine || n.merge ? "var(--background)" : b(n.fam)}
              strokeWidth={n.mine || n.merge ? 2.5 : 2}
              data-fam={n.fam}
            />
          ))}
        </svg>

        <div aria-hidden className="pointer-events-none absolute bottom-0 left-0 z-10 h-14 bg-gradient-to-b from-transparent to-background" style={{ width: svgW }} />
        <ol>
          {nodes.map((n) => (
            <li
              key={n.hash}
              id={`c-${n.hash}`}
              style={{ height: g.row, paddingLeft: svgW + 4, containIntrinsicSize: `auto ${g.row}px`, ["--gx" as string]: `${svgW - 4}px` }}
              onMouseEnter={() => markTwins(n.twins, true)}
              onMouseLeave={() => markTwins(n.twins, false)}
              data-fam={n.fam}
              className="relative flex items-center gap-3 pr-2 [content-visibility:auto] before:absolute before:inset-y-0.5 before:right-0 before:left-(--gx) before:-z-10 before:rounded-lg before:transition-colors before:duration-150 hover:before:bg-[color-mix(in_oklab,var(--primary)_7%,transparent)] data-[twin=1]:before:bg-[color-mix(in_oklab,var(--primary)_14%,transparent)]"
            >
              {narrow ? (
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                  <div className="flex min-w-0">
                {n.merge ? (
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <GitMerge className="size-3.5 shrink-0" />
                    <span className="truncate">{n.subject}</span>
                  </span>
                ) : (
                  <span className="min-w-0 truncate text-[14px]">
                    {n.type !== "other" && (
                      <span className="font-semibold" style={{ color: `var(--t-${n.type})` }}>
                        {n.type}
                        {n.scope && <span className="font-normal text-muted-foreground">({n.scope})</span>}{" "}
                      </span>
                    )}
                    {n.subject}
                  </span>
                )}
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 overflow-hidden text-xs text-muted-foreground">
                    <time dateTime={n.at} className="shrink-0 tabular-nums">{when(n.at)}</time>
                {n.refs.map((r) => (
                  <span
                    key={r.name}
                    className="flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-semibold"
                    style={{ background: tint(r.fam), color: b(r.fam) }}
                    title={`Punta de ${r.name}`}
                  >
                    {r.name}
                  </span>
                ))}
                {n.twins.slice(0, 2).map((t) => {
                  const tw = byHash.get(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => jump(t)}
                      title={`El mismo cambio está en ${t.slice(0, 7)}${tw ? ` (${tw.branch})` : ""}. Clic para ir.`}
                      className="press flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-muted-foreground ring-1 ring-border hover:text-foreground"
                    >
                      <Cherry className="size-3" />
                      <span className="max-sm:sr-only">{tw ? tw.branch : t.slice(0, 7)}</span>
                    </button>
                  );
                })}
                  </div>
                </div>
              ) : (
                <>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {n.refs.map((r) => (
                  <span
                    key={r.name}
                    className="flex h-5 shrink-0 items-center rounded-md px-1.5 text-[11px] font-semibold"
                    style={{ background: tint(r.fam), color: b(r.fam) }}
                    title={`Punta de ${r.name}`}
                  >
                    {r.name}
                  </span>
                ))}
                {n.merge ? (
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-sm text-muted-foreground">
                    <GitMerge className="size-3.5 shrink-0" />
                    <span className="truncate">{n.subject}</span>
                  </span>
                ) : (
                  <span className="min-w-0 truncate text-[15px]">
                    {n.type !== "other" && (
                      <span className="font-semibold" style={{ color: `var(--t-${n.type})` }}>
                        {n.type}
                        {n.scope && <span className="font-normal text-muted-foreground">({n.scope})</span>}{" "}
                      </span>
                    )}
                    {n.subject}
                  </span>
                )}
                {n.twins.slice(0, 2).map((t) => {
                  const tw = byHash.get(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => jump(t)}
                      title={`El mismo cambio está en ${t.slice(0, 7)}${tw ? ` (${tw.branch})` : ""}. Clic para ir.`}
                      className="press flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-muted-foreground ring-1 ring-border hover:text-foreground"
                    >
                      <Cherry className="size-3" />
                      <span className="max-sm:sr-only">{tw ? tw.branch : t.slice(0, 7)}</span>
                    </button>
                  );
                })}
              </div>
              <span className="shrink-0 text-xs text-muted-foreground max-sm:hidden">{n.mine ? "tú" : n.author.split(" ")[0]}</span>
              <time dateTime={n.at} title={new Date(n.at).toLocaleString("es")} className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                {when(n.at)}
              </time>
              <code className="w-14 shrink-0 font-mono text-xs text-muted-foreground max-md:hidden">{n.hash.slice(0, 7)}</code>
                </>
              )}
            </li>
          ))}
        </ol>
    </>
  );
});

/** Selector de repo de esta vista: navega a /ramas?repo=. */
export function RepoSelect({ repos, value }: { repos: RepoInfo[]; value: string }) {
  const router = useRouter();
  return <RepoCombobox repos={repos} value={value} className="text-[15px] font-semibold sm:w-80" onChange={(v) => router.push(`/ramas?repo=${encodeURIComponent(v)}`, { scroll: false })} />;
}
