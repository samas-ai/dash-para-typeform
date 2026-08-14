/**
 * Mostrado quando o dashboard não consegue falar com o Supabase — quase sempre
 * variável de ambiente faltando ou migração não rodada. Melhor do que uma
 * stack trace de 500.
 */
export function SetupNotice({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-6">
      <h2 className="text-base font-semibold">Configuração pendente</h2>
      <p className="mt-2 text-sm text-muted">
        Não consegui ler os dados no Supabase. Confira os passos abaixo:
      </p>

      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-muted">
        <li>
          Rode <code className="text-ink">supabase/migrations/0001_init.sql</code> no
          SQL Editor do seu projeto Supabase.
        </li>
        <li>
          Defina <code className="text-ink">SUPABASE_URL</code> e{" "}
          <code className="text-ink">SUPABASE_SERVICE_ROLE_KEY</code> em{" "}
          <code className="text-ink">.env.local</code> (local) ou nas variáveis de
          ambiente da Vercel (produção).
        </li>
        <li>Reinicie o servidor de desenvolvimento ou refaça o deploy.</li>
      </ol>

      <pre className="mt-4 overflow-x-auto rounded-lg border border-line bg-canvas p-3 text-xs text-muted">
        {message}
      </pre>
    </div>
  );
}
