"use client";

import { Popover } from "@base-ui/react/popover";
import { Check, Copy, FolderGit2, Moon, RefreshCw, Search, Sun, X } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { syncSummary } from "@/lib/sync-summary";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { addRepo, removeRepo, saveNote, sync } from "./actions";

const EASE = [0.23, 1, 0.32, 1] as const;

/** Respeta prefers-reduced-motion en toda la app: quita desplazamientos, deja opacidad. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}

/** Entrada de carga: fade + 8px, escalonada por `i`. Solo corre al montar. */
export function FadeIn({ i = 0, className, children }: { i?: number; className?: string; children: React.ReactNode }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: i * 0.06, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Buscador del header. Ctrl+K o "/" para enfocarlo, Enter busca, Esc limpia. */
export function SearchBox({ initial }: { initial: string }) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState(initial);
  const [prev, setPrev] = useState(initial);
  if (initial !== prev) {
    setPrev(initial);
    setQ(initial);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as Element).closest("input, textarea, select, [contenteditable]");
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        ref.current?.focus();
        ref.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <form
      role="search"
      className="relative min-w-0 flex-1 max-sm:order-last max-sm:basis-full sm:max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(q.trim() ? `/?q=${encodeURIComponent(q.trim())}` : "/", { scroll: false });
      }}
    >
      <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={ref}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.preventDefault();
          if (q) {
            setQ("");
            if (initial) router.push("/", { scroll: false });
          } else ref.current?.blur();
        }}
        placeholder="Buscar: permisos, modo oscuro, #142"
        aria-label="Buscar en commits, tareas y notas"
        className="h-10 w-full rounded-full border border-input bg-card pr-4 pl-10 text-sm sm:pr-12 outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border border-border px-1.5 text-[11px] text-muted-foreground sm:block">
        Ctrl K
      </kbd>
    </form>
  );
}

/** Reemplazo de texto con desenfoque: une las dos versiones en vez de mostrar dos bloques cruzándose. */
export function Swap({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={k}
        initial={{ opacity: 0, y: 10, filter: "blur(6px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -6, filter: "blur(4px)", transition: { duration: 0.14 } }}
        transition={{ duration: 0.3, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Pestañas con una píldora que se desliza hasta la activa. */
/** Pestañas de la portada; con href la pestaña lleva a otra página (Ramas) en vez de cambiar ?view. */
export function TabNav({ items, active }: { items: { v: string; label: string; n: number; href?: string }[]; active: string }) {
  return (
    <nav className="mb-4 flex gap-1 rounded-full bg-muted p-1 sm:w-max" aria-label="Secciones">
      {items.map(({ v, label, n, href }) => (
        <Link
          key={v}
          href={href ?? (v ? `/?view=${v}` : "/")}
          scroll={false}
          aria-current={active === v ? "page" : undefined}
          className={cn(
            "press relative flex h-10 flex-1 items-center justify-center gap-2 rounded-full px-4 text-sm font-medium transition-colors duration-200 sm:flex-none",
            active === v ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {active === v && (
            <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-card shadow-sm" transition={{ type: "spring", duration: 0.35, bounce: 0.12 }} />
          )}
          <span className="relative">{label}</span>
          {n > 0 && <span className="relative text-xs text-muted-foreground tabular-nums">{n}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** Cambio entre timeline y foco de mes: sale el anterior, entra el nuevo. */
export function ViewSwitch({ viewKey, children }: { viewKey: string; children: React.ReactNode }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
        transition={{ duration: 0.22, ease: EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Lista que anima altas, bajas y reacomodos al cambiar filtros. */
export function AnimatedList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <ol className={className}>
      <AnimatePresence initial={false} mode="popLayout">
        {children}
      </AnimatePresence>
    </ol>
  );
}

// popLayout mide el elemento que sale: necesita el ref del <li>.
export function AnimatedItem({ ref, className, children }: { ref?: React.Ref<HTMLLIElement>; className?: string; children: React.ReactNode }) {
  return (
    <motion.li
      ref={ref}
      layout="position"
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      {children}
    </motion.li>
  );
}

let syncedOnLoad = false;

export function SyncButton() {
  const [pending, start] = useTransition();
  const run = (quiet: boolean) =>
    start(async () => {
      const res = await sync();
      const { added, updated, errors } = res;
      errors.forEach((e) => toast.error(e));
      if (!quiet || added || updated) toast.success(syncSummary(res));
    });

  useEffect(() => {
    if (syncedOnLoad) return;
    syncedOnLoad = true;
    run(true);
  }, []);

  return (
    <Button variant="outline" className="press h-10 gap-2 max-sm:w-10" aria-label="Sincronizar" disabled={pending} onClick={() => run(false)}>
      <RefreshCw className={pending ? "animate-spin" : ""} />
      <span className="hidden sm:inline">{pending ? "Sincronizando" : "Sincronizar"}</span>
    </Button>
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <Button variant="ghost" size="icon" className="press size-10" aria-label="Cambiar tema" onClick={() => setTheme(dark ? "light" : "dark")}>
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="ghost"
      className="press h-10 gap-2 text-muted-foreground hover:text-foreground"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check /> : <Copy />}
      {done ? "Copiado" : label}
    </Button>
  );
}

/** Nota del día: cerrada muestra el texto (o "+ Nota"); al tocarla se edita y se guarda al salir. */
export function NoteEditor({ day, initial }: { day: string; initial: string }) {
  const saved = useRef(initial);
  const [value, setValue] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [, start] = useTransition();

  if (!editing)
    return value ? (
      <button
        onClick={() => setEditing(true)}
        className="block w-full cursor-pointer rounded-lg border-l-2 border-primary/40 bg-primary/5 px-3 py-2 text-left text-sm whitespace-pre-wrap transition-colors hover:bg-primary/10"
        aria-label={`Editar la nota del ${day}`}
      >
        {value}
      </button>
    ) : (
      <button onClick={() => setEditing(true)} className="h-8 cursor-pointer rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground">
        + Nota
      </button>
    );

  return (
    <Textarea
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
      onBlur={() => {
        setEditing(false);
        if (value === saved.current) return;
        saved.current = value;
        start(async () => {
          await saveNote(day, value);
          toast.success(value.trim() ? "Nota guardada" : "Nota borrada");
        });
      }}
      placeholder="Reuniones, tickets de QA, lo que no quedó en un commit"
      aria-label={`Notas del ${day}`}
      className="min-h-16 resize-none bg-card text-sm field-sizing-content"
    />
  );
}

const baseName = (p: string) => p.split(/[\\/]/).filter(Boolean).at(-1) ?? p;

/** Lista con filtro y scroll propio: con 5 o 50 repos el popover mide lo mismo. */
export function RepoList({ paths, root }: { paths: string[]; root: string }) {
  const [pending, start] = useTransition();
  const [path, setPath] = useState("");
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/[\s-_]+/).filter(Boolean);
  const shown = paths.filter((p) => words.every((w) => baseName(p).toLowerCase().includes(w)));
  return (
    <div>
      {paths.length > 5 && (
        <div className="relative px-4 pb-2">
          <Search className="pointer-events-none absolute top-1/2 left-7 size-4 -translate-y-[calc(50%+4px)] text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Filtrar ${paths.length} repos`}
            aria-label="Filtrar repositorios por nombre"
            className="h-10 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      )}
      <ul className="max-h-[min(20rem,45dvh)] overflow-y-auto overscroll-contain px-2">
        {shown.map((p) => (
          <li key={p} className="group flex items-center justify-between gap-3 rounded-lg py-1.5 pr-1 pl-2 hover:bg-accent">
            <span className="min-w-0" title={p}>
              <span className="block truncate text-sm font-medium">{baseName(p)}</span>
              <span className="block truncate font-mono text-[11px] text-muted-foreground">{p}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 text-muted-foreground hover:text-destructive"
              aria-label={`Quitar ${baseName(p)}`}
              disabled={pending}
              onClick={() => start(() => removeRepo(p))}
            >
              <X />
            </Button>
          </li>
        ))}
        {!shown.length && <li className="px-2 py-6 text-center text-sm text-muted-foreground">Ningún repo con «{q}».</li>}
      </ul>
      <form
        className="mt-2 flex gap-2 border-t border-border px-4 pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const { error } = await addRepo(path);
            if (error) return void toast.error(error);
            setPath("");
            toast.success("Repositorio agregado. Sincroniza para traer sus commits.");
          });
        }}
      >
        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder={`${root}${root.includes("\\") ? "\\" : "/"}mi-repo`}
          aria-label="Ruta del repositorio"
          className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 font-mono text-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button className="press h-10" disabled={pending || !path.trim()}>
          Agregar
        </Button>
      </form>
    </div>
  );
}

/** Repos registrados en un popover del header: se gestionan sin bajar hasta el final de la página. */
export function RepoMenu({ paths, root }: { paths: string[]; root: string }) {
  return (
    <Popover.Root>
      <Popover.Trigger
        aria-label={`Repositorios (${paths.length})`}
        title="Repositorios"
        className="press relative flex size-10 cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:bg-accent data-[popup-open]:text-foreground"
      >
        <FolderGit2 className="size-[18px]" />
        <span className="absolute top-1 right-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] leading-4 font-semibold text-primary-foreground tabular-nums">
          {paths.length}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        {/* Velo leve: separa el popover del fondo, que tiene casi el mismo tono. */}
        <Popover.Backdrop className="fixed inset-0 z-40 bg-[color-mix(in_oklab,var(--foreground)_14%,transparent)] transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Popover.Positioner sideOffset={8} align="end" collisionPadding={16} className="z-50">
          <Popover.Popup className="w-[min(28rem,calc(100vw-2rem))] origin-(--transform-origin) rounded-2xl bg-popover pb-4 text-popover-foreground shadow-[0_24px_64px_-16px_color-mix(in_oklab,var(--foreground)_45%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--foreground)_14%,transparent)] transition-[opacity,transform] duration-150 ease-(--ease-out) data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0">
            <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
              <Popover.Title className="font-display text-lg font-semibold tracking-tight">Repositorios</Popover.Title>
              <span className="text-sm text-muted-foreground tabular-nums">{paths.length}</span>
            </div>
            <Popover.Description className="px-4 pt-0.5 pb-3 text-xs text-muted-foreground">Cuentan los repos dentro de <span className="font-mono">{root}</span> (SHIPLOG_ROOT).</Popover.Description>
            <RepoList paths={paths} root={root} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
