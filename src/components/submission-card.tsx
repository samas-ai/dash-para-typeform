import Link from "next/link";
import { formatDateTime, formatRelative } from "@/lib/format";
import type { SubmissionWithAnswers } from "@/lib/types";

const PREVIEW_ANSWERS = 3;

export function SubmissionCard({
  submission,
}: {
  submission: SubmissionWithAnswers;
}) {
  const answers = submission.form_answers ?? [];
  const preview = answers.filter((a) => a.answer_text).slice(0, PREVIEW_ANSWERS);
  const hiddenCount = answers.length - preview.length;

  return (
    <Link
      href={`/submissions/${submission.id}`}
      className="block rounded-xl border border-line bg-surface p-4 transition-colors hover:border-accent"
    >
      <div className="flex items-baseline justify-between gap-4">
        <span className="truncate text-sm font-medium">
          {submission.form_title ?? submission.form_id}
        </span>
        <span
          className="shrink-0 text-xs text-muted"
          title={formatDateTime(submission.submitted_at)}
        >
          {formatRelative(submission.submitted_at)}
        </span>
      </div>

      {preview.length > 0 ? (
        <dl className="mt-3 space-y-2">
          {preview.map((answer) => (
            <div key={answer.id}>
              <dt className="truncate text-xs text-muted">
                {answer.question ?? answer.field_ref ?? answer.field_id}
              </dt>
              <dd className="line-clamp-2 text-sm">{answer.answer_text}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted">Envio sem respostas preenchidas.</p>
      )}

      {hiddenCount > 0 && (
        <p className="mt-3 text-xs text-muted">
          + {hiddenCount} {hiddenCount === 1 ? "resposta" : "respostas"}
        </p>
      )}
    </Link>
  );
}
