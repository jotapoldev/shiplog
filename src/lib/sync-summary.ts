// Sin imports de servidor: lo usan el botón (cliente) y la CLI.
/** "3 commits nuevos, 12 actualizados" para el botón y la CLI. */
export const syncSummary = ({ added, updated }: { added: number; updated: number }) =>
  [added && `${added} ${added === 1 ? "commit nuevo" : "commits nuevos"}`, updated && `${updated} ${updated === 1 ? "actualizado" : "actualizados"} (ramas)`]
    .filter(Boolean)
    .join(", ") || "Todo al día";
