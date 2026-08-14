import Link from "next/link";
import { SearchForm } from "@/components/search-form";
import { SetupNotice } from "@/components/setup-notice";
import { StatCard } from "@/components/stat-card";
import { SubmissionCard } from "@/components/submission-card";
import { formatRelative } from "@/lib/format";
import { getStats, listSubmissions, type ListResult, type Stats } from "@/lib/queries";

// As respostas chegam por webhook a qualquer momento: nada de cache estático.
export const dynamic = "force-dynamic";

type SearchParams = { q?: string; page?: string };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, page } = await searchParams;
  const search = q?.trim() || undefined;

  let stats: Stats;
  let result: ListResult;

  try {
    [stats, result] = await Promise.all([
      getStats(),
      listSubmissions({ search, page: Number(page) || 1 }),
    ]);
  } catch (error) {
    return <SetupNotice message={(error as Error).message} />;
  }

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total" value={stats.total} />
        <StatCard label="Últimas 24h" value={stats.last24h} />
        <StatCard label="Últimos 7 dias" value={stats.last7d} />
        <StatCard label="Mais recente" value={formatRelative(stats.latest)} />
      </section>

      <SearchForm value={search} />

      {search && (
        <p className="text-sm text-muted">
          {result.total} {result.total === 1 ? "resultado" : "resultados"} para
          &ldquo;{search}&rdquo;
        </p>
      )}

      {result.submissions.length === 0 ? (
        <EmptyState searching={Boolean(search)} />
      ) : (
        <section className="grid gap-3 sm:grid-cols-2">
          {result.submissions.map((submission) => (
            <SubmissionCard key={submission.id} submission={submission} />
          ))}
        </section>
      )}

      <Pagination page={result.page} pageCount={result.pageCount} search={search} />
    </div>
  );
}

function EmptyState({ searching }: { searching: boolean }) {
  if (searching) {
    return (
      <div className="rounded-xl border border-line bg-surface p-8 text-center text-sm text-muted">
        Nenhuma resposta encontrada para essa busca.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line bg-surface p-8 text-center">
      <p className="text-sm font-medium">Nenhuma resposta ainda</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">
        Aponte o webhook do Typeform para{" "}
        <code className="text-ink">/api/webhooks/typeform</code> e envie uma resposta
        de teste. Ela aparece aqui assim que chegar.
      </p>
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  search,
}: {
  page: number;
  pageCount: number;
  search?: string;
}) {
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (target > 1) params.set("page", String(target));
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  const linkClass =
    "rounded-lg border border-line bg-surface px-3 py-2 text-sm transition-colors hover:border-accent";

  return (
    <nav className="flex items-center justify-between">
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass}>
          ← Anterior
        </Link>
      ) : (
        <span />
      )}

      <span className="text-sm text-muted">
        Página {page} de {pageCount}
      </span>

      {page < pageCount ? (
        <Link href={href(page + 1)} className={linkClass}>
          Próxima →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
