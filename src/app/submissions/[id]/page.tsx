import Link from "next/link";
import { notFound } from "next/navigation";
import { SetupNotice } from "@/components/setup-notice";
import { formatDateTime, formatDuration } from "@/lib/format";
import { getSubmission } from "@/lib/queries";
import type { SubmissionWithAnswers } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let submission: SubmissionWithAnswers | null;
  try {
    submission = await getSubmission(id);
  } catch (error) {
    return <SetupNotice message={(error as Error).message} />;
  }

  if (!submission) notFound();

  const answers = submission.form_answers ?? [];
  const hidden = Object.entries(submission.hidden ?? {});
  const variables = Object.entries(submission.variables ?? {});

  return (
    <div className="space-y-6">
      <Link
        href="/respostas"
        className="text-sm text-muted transition-colors hover:text-ink"
      >
        ← Voltar
      </Link>

      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          {submission.form_title ?? submission.form_id}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Enviado em {formatDateTime(submission.submitted_at)}
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Meta label="Tempo de preenchimento">
          {formatDuration(submission.landed_at, submission.submitted_at)}
        </Meta>
        <Meta label="Recebido pelo webhook">
          {formatDateTime(submission.received_at)}
        </Meta>
        <Meta label="Token da resposta">
          <code className="break-all text-xs">{submission.response_token}</code>
        </Meta>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-surface">
        <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">
          Respostas ({answers.length})
        </h2>

        {answers.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">
            Este envio não trouxe respostas preenchidas.
          </p>
        ) : (
          <dl className="divide-y divide-line">
            {answers.map((answer) => (
              <div key={answer.id} className="px-4 py-3">
                <dt className="text-xs text-muted">
                  {answer.question ?? answer.field_ref ?? answer.field_id}
                </dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm">
                  {answer.answer_text || (
                    <span className="text-muted">— sem resposta —</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {hidden.length > 0 && (
        <KeyValueSection title="Hidden fields" entries={hidden} />
      )}
      {variables.length > 0 && (
        <KeyValueSection title="Variáveis" entries={variables} />
      )}

      <details className="rounded-xl border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Payload cru
        </summary>
        <pre className="overflow-x-auto border-t border-line px-4 py-3 text-xs text-muted">
          {JSON.stringify(submission.raw_payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function KeyValueSection({
  title,
  entries,
}: {
  title: string;
  entries: [string, unknown][];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">{title}</h2>
      <dl className="divide-y divide-line">
        {entries.map(([key, value]) => (
          <div key={key} className="flex gap-4 px-4 py-2">
            <dt className="w-40 shrink-0 truncate text-xs text-muted">{key}</dt>
            <dd className="break-all text-sm">
              {typeof value === "string" ? value : JSON.stringify(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
