import Link from "next/link";

/**
 * Form GET puro: a busca vira ?q= na URL, o que mantém o resultado
 * compartilhável e funciona sem JavaScript no cliente.
 */
export function SearchForm({ value }: { value?: string }) {
  return (
    <form className="flex gap-2" action="/respostas" method="get">
      <input
        type="search"
        name="q"
        defaultValue={value ?? ""}
        placeholder="Buscar por resposta, token ou event id…"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted focus:border-accent"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium transition-colors hover:border-accent"
      >
        Buscar
      </button>
      {value && (
        <Link
          href="/respostas"
          className="shrink-0 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-ink"
        >
          Limpar
        </Link>
      )}
    </form>
  );
}
