import { getSupabaseAdmin } from "@/lib/supabase";

export const PERIODS = {
  "7d": { label: "7 dias", days: 7 },
  "30d": { label: "30 dias", days: 30 },
  "90d": { label: "90 dias", days: 90 },
  all: { label: "Tudo", days: null },
} as const;

export type Period = keyof typeof PERIODS;

export function isPeriod(value: string | undefined): value is Period {
  return value != null && value in PERIODS;
}

/**
 * Teto de linhas por consulta. A agregação roda em JS, não em SQL — escolha
 * consciente: o volume de um formulário de captação cabe folgado aqui e evita
 * manter funções RPC no banco. Se este teto for atingido, a página avisa em vez
 * de mostrar um número errado silenciosamente.
 */
const MAX_ROWS = 5000;

/** Respostas de escolha/booleano viram contagem por opção. */
const CATEGORICAL = new Set(["choice", "choices", "boolean"]);

/** Campos numéricos com escala fixa: a distribuição importa mais que a média. */
const ORDINAL_FIELDS = new Set(["opinion_scale", "rating", "nps"]);

type AnswerRow = {
  field_id: string;
  field_ref: string | null;
  field_type: string;
  question: string | null;
  answer_type: string;
  answer_text: string | null;
  answer_value: unknown;
  position: number;
};

type SubmissionRow = {
  id: string;
  form_id: string;
  form_title: string | null;
  submitted_at: string;
  landed_at: string | null;
  form_answers: AnswerRow[];
};

export type CategoricalAggregate = {
  kind: "categorical";
  fieldId: string;
  question: string;
  answered: number;
  options: { label: string; count: number }[];
};

export type NumericAggregate = {
  kind: "numeric";
  fieldId: string;
  question: string;
  answered: number;
  average: number;
  median: number;
  min: number;
  max: number;
  /** Preenchido só para escalas fixas (nota, NPS), onde a distribuição é o dado. */
  distribution: { label: string; count: number }[] | null;
};

export type TextAggregate = {
  kind: "text";
  fieldId: string;
  question: string;
  answered: number;
  samples: string[];
};

export type QuestionAggregate =
  | CategoricalAggregate
  | NumericAggregate
  | TextAggregate;

export type Analytics = {
  totalSubmissions: number;
  timeline: { day: string; count: number }[];
  questions: QuestionAggregate[];
  forms: { formId: string; title: string; count: number }[];
  medianCompletionSeconds: number | null;
  truncated: boolean;
};

// Chave de dia no fuso de São Paulo. en-CA formata como YYYY-MM-DD.
const dayKeyFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const dayKey = (iso: string) => dayKeyFormat.format(new Date(iso));

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Preenche os dias sem envio com zero.
 *
 * Sem isso a linha do tempo liga dois picos por cima de um vale, sugerindo um
 * fluxo constante que não existiu.
 */
function buildTimeline(
  submissions: SubmissionRow[],
  days: number | null,
): { day: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const submission of submissions) {
    const key = dayKey(submission.submitted_at);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  if (counts.size === 0) return [];

  // Para "Tudo", o eixo começa no primeiro envio registrado.
  const span =
    days ??
    Math.max(
      1,
      Math.round(
        (Date.now() - new Date(submissions[0].submitted_at).getTime()) / 86_400_000,
      ) + 1,
    );

  const timeline: { day: string; count: number }[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const key = dayKeyFormat.format(new Date(Date.now() - i * 86_400_000));
    timeline.push({ day: key, count: counts.get(key) ?? 0 });
  }

  return timeline;
}

/** Agrupa as respostas por pergunta e escolhe a agregação conforme o tipo. */
function buildQuestions(submissions: SubmissionRow[]): QuestionAggregate[] {
  type Bucket = { meta: AnswerRow; answers: AnswerRow[] };
  const buckets = new Map<string, Bucket>();

  for (const submission of submissions) {
    for (const answer of submission.form_answers ?? []) {
      let bucket = buckets.get(answer.field_id);
      if (!bucket) {
        bucket = { meta: answer, answers: [] };
        buckets.set(answer.field_id, bucket);
      }
      bucket.answers.push(answer);
    }
  }

  const ordered = [...buckets.values()].sort(
    (a, b) => a.meta.position - b.meta.position,
  );

  return ordered.map(({ meta, answers }): QuestionAggregate => {
    const question = meta.question ?? meta.field_ref ?? meta.field_id;
    const filled = answers.filter((a) => a.answer_text);

    if (CATEGORICAL.has(meta.answer_type)) {
      const counts = new Map<string, number>();

      for (const answer of filled) {
        // "choices" guarda várias seleções num texto só; cada uma conta.
        const labels =
          answer.answer_type === "choices"
            ? (answer.answer_text as string).split(", ").filter(Boolean)
            : [answer.answer_text as string];

        for (const label of labels) {
          counts.set(label, (counts.get(label) ?? 0) + 1);
        }
      }

      return {
        kind: "categorical",
        fieldId: meta.field_id,
        question,
        answered: filled.length,
        options: [...counts.entries()]
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count),
      };
    }

    if (meta.answer_type === "number") {
      const values = filled
        .map((a) => Number(a.answer_value ?? a.answer_text))
        .filter((n) => Number.isFinite(n))
        .sort((a, b) => a - b);

      if (values.length === 0) {
        return {
          kind: "text",
          fieldId: meta.field_id,
          question,
          answered: 0,
          samples: [],
        };
      }

      // Escala fixa (nota de 1 a 5, NPS): mostrar a distribuição, não só a média.
      let distribution: { label: string; count: number }[] | null = null;
      if (ORDINAL_FIELDS.has(meta.field_type)) {
        const counts = new Map<number, number>();
        for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
        distribution = [...counts.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([value, count]) => ({ label: String(value), count }));
      }

      const sum = values.reduce((acc, n) => acc + n, 0);

      return {
        kind: "numeric",
        fieldId: meta.field_id,
        question,
        answered: values.length,
        average: sum / values.length,
        median: median(values),
        min: values[0],
        max: values[values.length - 1],
        distribution,
      };
    }

    return {
      kind: "text",
      fieldId: meta.field_id,
      question,
      answered: filled.length,
      samples: filled
        .slice(-3)
        .reverse()
        .map((a) => a.answer_text as string),
    };
  });
}

/**
 * Formulários disponíveis para o filtro, do mais movimentado para o menos.
 *
 * Query própria, de propósito: a lista precisa ignorar o filtro atual, senão
 * ao escolher um formulário os outros sumiriam do filtro e não haveria como
 * voltar. A ordem também define o formulário aberto por padrão na página.
 */
export async function getFormOptions(): Promise<
  { formId: string; title: string; count: number }[]
> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("form_submissions")
    .select("form_id, form_title")
    .limit(MAX_ROWS);

  if (error) throw new Error(`Falha ao listar formulários: ${error.message}`);

  const forms = new Map<string, { title: string; count: number }>();
  for (const row of data ?? []) {
    const id = row.form_id as string;
    const entry = forms.get(id) ?? {
      title: (row.form_title as string) ?? id,
      count: 0,
    };
    entry.count += 1;
    forms.set(id, entry);
  }

  return [...forms.entries()]
    .map(([formId, { title, count }]) => ({ formId, title, count }))
    .sort((a, b) => b.count - a.count);
}

export async function getAnalytics(options: {
  period: Period;
  formId?: string;
}): Promise<Analytics> {
  const supabase = getSupabaseAdmin();
  const { days } = PERIODS[options.period];

  let query = supabase
    .from("form_submissions")
    .select(
      "id, form_id, form_title, submitted_at, landed_at, " +
        "form_answers(field_id, field_ref, field_type, question, answer_type, answer_text, answer_value, position)",
    )
    .order("submitted_at", { ascending: true })
    .limit(MAX_ROWS);

  if (days !== null) {
    query = query.gte(
      "submitted_at",
      new Date(Date.now() - days * 86_400_000).toISOString(),
    );
  }
  if (options.formId) query = query.eq("form_id", options.formId);

  const { data, error } = await query;
  if (error) throw new Error(`Falha ao carregar a análise: ${error.message}`);

  // Sem tipos gerados do banco, o supabase-js não consegue inferir o formato de
  // um select com relação embutida — daí a conversão passando por unknown.
  const submissions = (data ?? []) as unknown as SubmissionRow[];

  // Contagem por formulário: alimenta o filtro, então ignora o filtro atual.
  const formCounts = new Map<string, { title: string; count: number }>();
  for (const submission of submissions) {
    const entry = formCounts.get(submission.form_id) ?? {
      title: submission.form_title ?? submission.form_id,
      count: 0,
    };
    entry.count += 1;
    formCounts.set(submission.form_id, entry);
  }

  const durations = submissions
    .filter((s) => s.landed_at)
    .map(
      (s) =>
        (new Date(s.submitted_at).getTime() - new Date(s.landed_at!).getTime()) / 1000,
    )
    .filter((seconds) => seconds > 0)
    .sort((a, b) => a - b);

  return {
    totalSubmissions: submissions.length,
    timeline: buildTimeline(submissions, days),
    questions: buildQuestions(submissions),
    forms: [...formCounts.entries()]
      .map(([formId, { title, count }]) => ({ formId, title, count }))
      .sort((a, b) => b.count - a.count),
    medianCompletionSeconds: durations.length > 0 ? median(durations) : null,
    truncated: submissions.length >= MAX_ROWS,
  };
}
