import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  isValidPayload,
  parsePayload,
  verifyTypeformSignature,
} from "@/lib/typeform";

// crypto.timingSafeEqual precisa do runtime Node, não do Edge.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/typeform
 *
 * Códigos de resposta importam: o Typeform reentrega em 5xx e desiste em 4xx.
 * Por isso erro de banco devolve 500 (queremos o retry) e payload malformado
 * devolve 400 (reentregar não vai consertar).
 */
export async function POST(request: Request) {
  const secret = process.env.TYPEFORM_WEBHOOK_SECRET;

  if (!secret) {
    // Sem secret não há como distinguir o Typeform de qualquer um na internet.
    // Falhar fechado é melhor do que aceitar tudo.
    console.error("[typeform-webhook] TYPEFORM_WEBHOOK_SECRET não configurada");
    return NextResponse.json(
      { error: "webhook secret não configurada no servidor" },
      { status: 500 },
    );
  }

  // Corpo cru: o HMAC é sobre os bytes exatos recebidos.
  const rawBody = await request.text();
  const signature = request.headers.get("typeform-signature");

  if (!verifyTypeformSignature(rawBody, signature, secret)) {
    console.warn("[typeform-webhook] assinatura inválida");
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  if (!isValidPayload(payload)) {
    return NextResponse.json(
      { error: "payload não parece um form_response do Typeform" },
      { status: 400 },
    );
  }

  // Hoje o Typeform só dispara form_response, mas se surgir outro tipo de
  // evento respondemos 200 para não gerar retry infinito.
  if (payload.event_type && payload.event_type !== "form_response") {
    return NextResponse.json({ ok: true, ignored: payload.event_type });
  }

  const { submission, answers } = parsePayload(payload);

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    // Env var do Supabase faltando. 500 é o certo: o dado é válido e o retry
    // do Typeform vai funcionar assim que a configuração for corrigida.
    console.error("[typeform-webhook]", (error as Error).message);
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }

  const { data: inserted, error: submissionError } = await supabase
    .from("form_submissions")
    .insert(submission)
    .select("id")
    .single();

  if (submissionError) {
    // 23505 = unique_violation em event_id. É uma reentrega do mesmo evento:
    // já gravamos antes, então confirmamos com 200 e paramos por aqui.
    if (submissionError.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    console.error("[typeform-webhook] falha ao gravar submission", submissionError);
    return NextResponse.json({ error: "falha ao gravar" }, { status: 500 });
  }

  if (answers.length > 0) {
    const { error: answersError } = await supabase.from("form_answers").insert(
      answers.map((answer) => ({ ...answer, submission_id: inserted.id })),
    );

    if (answersError) {
      // Sem transação entre os dois inserts: apagamos a submission órfã para
      // que o retry do Typeform consiga reprocessar o evento do zero.
      console.error("[typeform-webhook] falha ao gravar respostas", answersError);
      await supabase.from("form_submissions").delete().eq("id", inserted.id);
      return NextResponse.json({ error: "falha ao gravar respostas" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, id: inserted.id, answers: answers.length });
}
