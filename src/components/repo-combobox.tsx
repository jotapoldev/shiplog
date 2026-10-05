"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { fmt } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type RepoInfo = { name: string; n: number; last: string | null };

const norm = (t: string) => t.toLowerCase().replace(/[-_/]+/g, " ");
const when = (at: string) => fmt(at.slice(0, 10), { day: "numeric", month: "short" });

/**
 * Selector de repo con búsqueda, el mismo en toda la app. Busca por partes del nombre sin importar guiones.
 * Con `allLabel`, la primera opción ("" = todos) quita el filtro.
 */
export function RepoCombobox({
  repos,
  value,
  onChange,
  allLabel,
  className,
}: {
  repos: RepoInfo[];
  value: string;
  onChange: (repo: string) => void;
  allLabel?: string;
  className?: string;
}) {
  const byName = new Map(repos.map((r) => [r.name, r]));
  const items = allLabel ? ["", ...repos.map((r) => r.name)] : repos.map((r) => r.name);
  const labelOf = (v: string) => v || allLabel || "";
  const total = repos.reduce((s, r) => s + r.n, 0);

  return (
    <Combobox.Root
      items={items}
      value={value}
      autoHighlight
      itemToStringLabel={labelOf}
      onValueChange={(v) => v !== null && v !== value && onChange(v)}
      filter={(item: string, q: string) => norm(q).split(" ").filter(Boolean).every((w) => norm(labelOf(item)).includes(w))}
    >
      <Combobox.Trigger
        aria-label="Repositorio"
        className={cn(
          "press flex h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-full border border-input bg-card pr-3 pl-4 text-left text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-[popup-open]:border-ring",
          allLabel && value && "border-primary/40 text-primary",
          className,
        )}
      >
        <span className="truncate">{labelOf(value)}</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner sideOffset={6} align="start" collisionPadding={16} className="z-50">
          <Combobox.Popup className="w-[max(var(--anchor-width),20rem)] max-w-[calc(100vw-2rem)] origin-(--transform-origin) overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-[0_24px_64px_-16px_color-mix(in_oklab,var(--foreground)_40%,transparent)] ring-1 ring-[color-mix(in_oklab,var(--foreground)_14%,transparent)] transition-[opacity,transform] duration-150 ease-(--ease-out) data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0">
            <div className="flex items-center gap-2 border-b border-border px-3">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <Combobox.Input placeholder="Buscar repo por nombre" className="h-11 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground" />
            </div>
            <Combobox.Empty className="px-4 py-6 text-center text-sm text-muted-foreground empty:hidden">Ningún repo coincide. Prueba con otra parte del nombre.</Combobox.Empty>
            <Combobox.List className="max-h-[min(22rem,60dvh)] overflow-y-auto overscroll-contain p-1.5 empty:p-0">
              {(name: string) => {
                const r = byName.get(name);
                const meta = !name ? `${repos.length} repos, ${total} commits tuyos` : r?.n ? `${r.n} commits tuyos, último el ${when(r.last!)}` : "Sin commits sincronizados";
                return (
                  <Combobox.Item
                    key={name || "·todos"}
                    value={name}
                    className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-2.5 rounded-lg px-2.5 py-2 outline-none select-none data-[highlighted]:bg-accent"
                  >
                    <Combobox.ItemIndicator className="col-start-1">
                      <Check className="size-4 text-primary" />
                    </Combobox.ItemIndicator>
                    <span className="col-start-2 truncate text-[15px] font-medium">{labelOf(name)}</span>
                    <span className="col-start-2 text-xs text-muted-foreground">{meta}</span>
                  </Combobox.Item>
                );
              }}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
