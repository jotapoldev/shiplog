"use client";

import { ArrowDown, ArrowUp, Check, ChevronDown, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setTrackedBranches } from "../actions";

/**
 * Qué ramas de origin sigue este repo y en qué orden de ambiente (de develop hacia producción).
 * Lo elegido manda en la ruta de ambientes, en los cuadritos de cada commit y en la tarjeta de la portada.
 */
export function BranchPicker({ path, available, tracked, custom }: { path: string; available: string[]; tracked: string[]; custom: boolean }) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState(tracked);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const dirty = sel.join() !== tracked.join();
  const rest = available.filter((b) => !sel.includes(b) && b.toLowerCase().includes(q.trim().toLowerCase())).sort();

  const move = (i: number, d: -1 | 1) => setSel((s) => {
    const n = [...s];
    [n[i], n[i + d]] = [n[i + d], n[i]];
    return n;
  });
  const save = (branches: string[] | null) =>
    start(async () => {
      const error = await setTrackedBranches(path, branches);
      if (error) toast.error(error);
      else {
        toast.success(branches ? `Siguiendo ${branches.length} ${branches.length === 1 ? "rama" : "ramas"}.` : "Volviste a las ramas por defecto.");
        setOpen(false);
      }
    });

  return (
    <div className="mt-8 rounded-2xl bg-card ring-1 ring-border">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-14 w-full items-center justify-between gap-3 px-4 text-left">
        <span>
          <span className="font-semibold">Ramas que sigo</span>
          <span className="ml-2 text-sm text-muted-foreground">
            {tracked.length} de {available.length} · {tracked.join(" → ") || "ninguna"}
          </span>
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="grid gap-4 border-t border-border p-4 sm:grid-cols-2">
          <section>
            <p className="text-sm font-medium">Orden de ambientes</p>
            <p className="text-xs text-muted-foreground">De la primera a la que va a producción.</p>
            <ol className="mt-2 grid gap-1">
              {sel.map((b, i) => (
                <li key={b} className="flex h-10 items-center gap-1 rounded-lg bg-muted/60 pr-1 pl-3 text-sm">
                  <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="flex-1 truncate font-mono">{b}</span>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Subir ${b}`} disabled={!i} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon" className="size-8" aria-label={`Bajar ${b}`} disabled={i === sel.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-8 text-muted-foreground" onClick={() => setSel((s) => s.filter((x) => x !== b))}>
                    Quitar
                  </Button>
                </li>
              ))}
              {!sel.length && <li className="text-sm text-muted-foreground">Elige al menos una rama de la lista.</li>}
            </ol>
          </section>

          <section>
            <label className="flex h-10 items-center gap-2 rounded-lg px-3 ring-1 ring-border focus-within:ring-primary">
              <Search className="size-4 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar rama en origin…" className="flex-1 bg-transparent text-sm outline-none" />
            </label>
            <ul className="mt-2 max-h-64 overflow-y-auto">
              {rest.map((b) => (
                <li key={b}>
                  <button type="button" onClick={() => setSel((s) => [...s, b])} className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-muted/70">
                    <span className="grid size-4 place-items-center rounded ring-1 ring-border" />
                    <span className="truncate font-mono">{b}</span>
                  </button>
                </li>
              ))}
              {!rest.length && <li className="px-3 py-2 text-sm text-muted-foreground">{q ? `Ninguna rama con «${q}».` : "Ya sigues todas las ramas."}</li>}
            </ul>
          </section>

          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            {custom && (
              <Button variant="ghost" className="h-10" disabled={pending} onClick={() => save(null)}>
                Usar las por defecto
              </Button>
            )}
            <Button className="h-10 gap-2" disabled={pending || !dirty || !sel.length} onClick={() => save(sel)}>
              <Check />
              {pending ? "Guardando…" : "Guardar y sincronizar"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
