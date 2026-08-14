import { getSupabaseAdmin } from "@/lib/supabase";
import type { SubmissionWithAnswers } from "@/lib/types";

export const PAGE_SIZE = 25;

/**
 * Descobre quais submissions casam com o termo buscado.
 *
 * Feito em duas etapas de propósito: filtrar direto na relação embutida
 * (`form_answers!inner`) faria o PostgREST devolver só as respostas que casam,
 * e o card da lista precisa de todas. Então primeiro pegamos os ids, depois
 * carregamos as submissions inteiras.
 *
 * MATCH_LIMIT existe para a query não explodir em bases grandes; ao bater o
 * teto a busca vira "as N submissions mais recentes que casam".
 */
const MATCH_LIMIT = 2000;

async function findMatchingIds(term: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  const pattern = `%${term}%`;

  const [byAnswer, byToken] = await Promise.all([
    supabase
      .from("form_answers")
      .select("submission_id")
      .ilike("answer_text", pattern)
      .limit(MATCH_LIMIT),
    supabase
      .from("form_submissions")
      .select("id")
      .or(`response_token.ilike.${pattern},event_id.ilike.${pattern}`)
      .limit(MATCH_LIMIT),
  ]);

  const ids = new Set<string>();
  for (const row of byAnswer.data ?? []) ids.add(row.submission_id as string);
  for (const row of byToken.data ?? []) ids.add(row.id as string);

  return [...ids];
}

export type ListResult = {
  submissions: SubmissionWithAnswers[];
  total: number;
  page: number;
  pageCount: number;
};

export async function listSubmissions(options: {
  search?: string;
  page?: number;
}): Promise<ListResult> {
  const supabase = getSupabaseAdmin();
  const page = Math.max(1, options.page ?? 1);
  const search = options.search?.trim();

  let matchingIds: string[] | null = null;
  if (search) {
    matchingIds = await findMatchingIds(search);

    // Nenhum resultado: evita uma query com `.in("id", [])`.
    if (matchingIds.length === 0) {
      return { submissions: [], total: 0, page: 1, pageCount: 1 };
    }
  }

  const from = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("form_submissions")
    .select("*, form_answers(*)", { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  if (matchingIds) query = query.in("id", matchingIds);

  const { data, error, count } = await query;
  if (error) throw new Error(`Falha ao listar respostas: ${error.message}`);

  const submissions = (data ?? []) as SubmissionWithAnswers[];
  for (const submission of submissions) {
    submission.form_answers?.sort((a, b) => a.position - b.position);
  }

  const total = count ?? 0;

  return {
    submissions,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getSubmission(
  id: string,
): Promise<SubmissionWithAnswers | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("form_submissions")
    .select("*, form_answers(*)")
    .eq("id", id)
    .maybeSingle();

  // 22P02 = invalid_text_representation: o id da URL não é um uuid válido.
  if (error && error.code !== "22P02") {
    throw new Error(`Falha ao carregar resposta: ${error.message}`);
  }
  if (!data) return null;

  const submission = data as SubmissionWithAnswers;
  submission.form_answers?.sort((a, b) => a.position - b.position);
  return submission;
}

export type Stats = {
  total: number;
  last24h: number;
  last7d: number;
  latest: string | null;
};

export async function getStats(): Promise<Stats> {
  const supabase = getSupabaseAdmin();

  const now = Date.now();
  const since = (ms: number) => new Date(now - ms).toISOString();
  const head = { count: "exact" as const, head: true };

  const [total, last24h, last7d, latest] = await Promise.all([
    supabase.from("form_submissions").select("id", head),
    supabase
      .from("form_submissions")
      .select("id", head)
      .gte("submitted_at", since(24 * 60 * 60 * 1000)),
    supabase
      .from("form_submissions")
      .select("id", head)
      .gte("submitted_at", since(7 * 24 * 60 * 60 * 1000)),
    supabase
      .from("form_submissions")
      .select("submitted_at")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    total: total.count ?? 0,
    last24h: last24h.count ?? 0,
    last7d: last7d.count ?? 0,
    latest: (latest.data?.submitted_at as string | undefined) ?? null,
  };
}
