import Link from "next/link";
import { BarList, TimelineChart } from "@/components/charts";
import { SetupNotice } from "@/components/setup-notice";
import { StatCard } from "@/components/stat-card";
import {
  getAnalytics,
  getFormOptions,
  isPeriod,
  PERIODS,
  type Analytics,
  type Period,
  type QuestionAggregate,
} from "@/lib/analytics";

export const dynamic = "force-dynamic";

/** Valor do filtro que significa "não filtrar por formulário". */
const ALL_FORMS = "todos";

type SearchParams = { periodo?: string; form?: string };

export default async function AnalisePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const period: Period = isPeriod(params.periodo) ? params.periodo : "30d";

  let formOptions: { formId: string; title: string; count: number }[];
  try {
    formOptions = await getFormOptions();
  } catch (error) {
    return <SetupNotice message={(error as Error).message} />;
  }

  /**
   * Cada formulário tem o seu próprio conjunto de perguntas, então somar as
   * respostas de formulários diferentes não produz nada legível — a mesma
   * pergunta apareceria uma vez por formulário. Por isso a página abre já
   * filtrada no formulário mais movimentado, e a visão "Todos" mostra só o que
   * faz sentido comparar entre formulários (volume), sem o detalhe por pergunta.
   */
  const selectedForm =
    params.form === ALL_FORMS ? null : (params.form ?? formOptions[0]?.formId ?? null);

  let analytics: Analytics;
  try {
    analytics = await getAnalytics({
      period,
      formId: selectedForm ?? undefined,
    });
  } catch (error) {
    return <SetupNotice message={(error as Error).message} />;
  }

  const buildHref = (next: Partial<{ periodo: Period; form: string }>) => {
    const query = new URLSearchParams();
    const nextPeriod = next.periodo ?? period;
    const nextForm = next.form ?? params.form;

    if (nextPeriod !== "30d") query.set("periodo", nextPeriod);
    if (nextForm) query.set("form", nextForm);

    const string = query.toString();
    return string ? `/analise?${string}` : "/analise";
  };

  const currentTitle = formOptions.find(
    (form) => form.formId === selectedForm,
  )?.title;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Análise</h1>
          {currentTitle && (
            <p className="mt-0.5 text-sm text-muted">{currentTitle}</p>
          )}
        </div>
        <Link
          href="/"
          className="shrink-0 text-sm text-muted transition-colors hover:text-ink"
        >
          Ver respostas →
        </Link>
      </div>

      {/* Uma linha de filtros acima de tudo que eles afetam — nunca um filtro
          dentro de um card de gráfico. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Filter
          label="Período"
          options={Object.entries(PERIODS).map(([key, { label }]) => ({
            key,
            label,
            href: buildHref({ periodo: key as Period }),
            active: key === period,
          }))}
        />

        {formOptions.length > 1 && (
          <Filter
            label="Formulário"
            options={[
              ...formOptions.map((form) => ({
                key: form.formId,
                label: form.title,
                href: buildHref({ form: form.formId }),
                active: selectedForm === form.formId,
              })),
              {
                key: ALL_FORMS,
                label: "Todos",
                href: buildHref({ form: ALL_FORMS }),
                active: selectedForm === null,
              },
            ]}
          />
        )}
      </div>

      {analytics.truncated && (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
          Mostrando os 5.000 envios mais recentes do período. Os números abaixo
          consideram só esse recorte.
        </p>
      )}

      {analytics.totalSubmissions === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-8 text-center">
          <p className="text-sm font-medium">Nenhum envio neste período</p>
          <p className="mt-2 text-sm text-muted">
            Escolha um período maior ou aguarde as próximas respostas.
          </p>
        </div>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatCard label="Envios no período" value={analytics.totalSubmissions} />
            <StatCard
              label="Tempo mediano"
              value={formatSeconds(analytics.medianCompletionSeconds)}
            />
            <StatCard
              label={selectedForm ? "Perguntas" : "Formulários"}
              value={
                selectedForm ? analytics.questions.length : analytics.forms.length
              }
            />
          </section>

          <Card title="Envios por dia">
            <TimelineChart data={analytics.timeline} />
          </Card>

          {selectedForm === null ? (
            <Card title="Envios por formulário">
              <BarList
                items={analytics.forms.map((form) => ({
                  label: form.title,
                  count: form.count,
                }))}
                total={analytics.totalSubmissions}
              />
              <p className="mt-4 text-xs text-muted">
                Escolha um formulário no filtro acima para ver o detalhe por
                pergunta.
              </p>
            </Card>
          ) : (
            analytics.questions.map((question) => (
              <QuestionCard
                key={question.fieldId}
                question={question}
                totalSubmissions={analytics.totalSubmissions}
              />
            ))
          )}
        </>
      )}
    </div>
  );
}

function Filter({
  label,
  options,
}: {
  label: string;
  options: { key: string; label: string; href: string; active: boolean }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <div className="flex flex-wrap gap-1">
        {options.map((option) => (
          <Link
            key={option.key}
            href={option.href}
            aria-current={option.active ? "page" : undefined}
            className={
              option.active
                ? "rounded-lg border border-accent bg-surface px-2.5 py-1 text-sm font-medium"
                : "rounded-lg border border-line bg-surface px-2.5 py-1 text-sm text-muted transition-colors hover:text-ink"
            }
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function QuestionCard({
  question,
  totalSubmissions,
}: {
  question: QuestionAggregate;
  totalSubmissions: number;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-semibold">{question.question}</h2>
        <span className="shrink-0 text-xs text-muted">
          {question.answered} de {totalSubmissions} responderam
        </span>
      </div>

      <div className="mt-4">
        {question.kind === "categorical" && (
          <BarList items={question.options} total={question.answered} />
        )}

        {question.kind === "numeric" && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Média" value={formatNumber(question.average)} />
              <StatCard label="Mediana" value={formatNumber(question.median)} />
              <StatCard label="Mínimo" value={formatNumber(question.min)} />
              <StatCard label="Máximo" value={formatNumber(question.max)} />
            </div>

            {question.distribution && (
              <BarList items={question.distribution} total={question.answered} />
            )}
          </div>
        )}

        {question.kind === "text" && (
          <TextAnswers samples={question.samples} answered={question.answered} />
        )}
      </div>
    </section>
  );
}

/**
 * Resposta aberta não agrega em gráfico — contar frases distintas só produziria
 * uma barra de tamanho 1 por pessoa. Mostramos as últimas como amostra.
 */
function TextAnswers({
  samples,
  answered,
}: {
  samples: string[];
  answered: number;
}) {
  if (samples.length === 0) {
    return <p className="text-sm text-muted">Sem respostas no período.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted">Últimas respostas</p>
      <ul className="space-y-2">
        {samples.map((sample, i) => (
          <li key={i} className="border-l-2 border-line pl-3 text-sm text-ink/90">
            {sample}
          </li>
        ))}
      </ul>
      {answered > samples.length && (
        <p className="text-xs text-muted">
          + {answered - samples.length} outras — veja em{" "}
          <Link href="/" className="underline">
            respostas
          </Link>
          .
        </p>
      )}
    </div>
  );
}

const decimalFormat = new Intl.NumberFormat("pt-BR", {
  maximumFractionDigits: 1,
});

function formatNumber(value: number): string {
  return decimalFormat.format(value);
}

function formatSeconds(seconds: number | null): string {
  if (seconds == null) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;

  return `${Math.floor(minutes / 60)}h ${minutes % 60}min`;
}
