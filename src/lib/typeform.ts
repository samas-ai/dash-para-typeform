import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Formato do payload que o Typeform envia.
// Referência: https://www.typeform.com/developers/webhooks/example-payload/
// ---------------------------------------------------------------------------

type TypeformField = {
  id: string;
  ref?: string;
  type: string;
  title?: string;
};

type TypeformChoice = { label?: string; other?: string };
type TypeformChoices = { labels?: string[]; other?: string };
type TypeformPayment = { amount?: string; last4?: string; name?: string };

type TypeformAnswer = {
  type: string;
  field: TypeformField;
  text?: string;
  email?: string;
  url?: string;
  file_url?: string;
  phone_number?: string;
  date?: string;
  number?: number;
  boolean?: boolean;
  choice?: TypeformChoice;
  choices?: TypeformChoices;
  payment?: TypeformPayment;
};

type TypeformVariable = {
  key: string;
  type: string;
  text?: string;
  number?: number;
};

export type TypeformWebhookPayload = {
  event_id: string;
  event_type: string;
  form_response: {
    form_id: string;
    token: string;
    landed_at?: string;
    submitted_at: string;
    definition?: { id: string; title?: string; fields?: TypeformField[] };
    answers?: TypeformAnswer[] | null;
    hidden?: Record<string, unknown>;
    variables?: TypeformVariable[];
  };
};

// ---------------------------------------------------------------------------
// Assinatura
// ---------------------------------------------------------------------------

/**
 * Confere o header `Typeform-Signature`, que vem no formato
 * `sha256=<base64 do HMAC-SHA256 do corpo cru da requisição>`.
 *
 * O HMAC tem que ser calculado sobre os BYTES EXATOS recebidos — por isso o
 * route handler lê `await req.text()` e nunca `await req.json()`. Qualquer
 * reserialização muda o hash e a validação falha.
 */
export function verifyTypeformSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);

  // timingSafeEqual exige buffers do mesmo tamanho, senão lança.
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}

/** Gera a assinatura de um corpo — usado pelo script de teste local. */
export function signPayload(rawBody: string, secret: string): string {
  return (
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64")
  );
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** Converte uma resposta tipada do Typeform em texto legível. */
function answerToText(answer: TypeformAnswer): string {
  switch (answer.type) {
    case "text":
      return answer.text ?? "";
    case "email":
      return answer.email ?? "";
    case "url":
      return answer.url ?? "";
    case "file_url":
      return answer.file_url ?? "";
    case "phone_number":
      return answer.phone_number ?? "";
    case "date":
      return answer.date ?? "";
    case "number":
      return answer.number != null ? String(answer.number) : "";
    case "boolean":
      return answer.boolean ? "Sim" : "Não";
    case "choice":
      return answer.choice?.label ?? answer.choice?.other ?? "";
    case "choices": {
      const labels = answer.choices?.labels ?? [];
      const other = answer.choices?.other;
      return [...labels, ...(other ? [other] : [])].join(", ");
    }
    case "payment": {
      const p = answer.payment ?? {};
      const parts = [p.amount, p.name, p.last4 ? `final ${p.last4}` : null];
      return parts.filter(Boolean).join(" — ");
    }
    default:
      // Tipo novo que o Typeform lançou depois deste código: não perde o dado.
      return JSON.stringify(answer[answer.type as keyof TypeformAnswer] ?? answer);
  }
}

/** Extrai o valor cru tipado, que vai para a coluna jsonb answer_value. */
function answerToValue(answer: TypeformAnswer): unknown {
  const key = answer.type as keyof TypeformAnswer;
  return answer[key] ?? null;
}

/**
 * Verificação de forma do payload. Sem dependência de schema externo: só
 * confere o que o insert realmente precisa.
 */
export function isValidPayload(value: unknown): value is TypeformWebhookPayload {
  if (typeof value !== "object" || value === null) return false;

  const p = value as Record<string, unknown>;
  if (typeof p.event_id !== "string" || !p.event_id) return false;

  const fr = p.form_response;
  if (typeof fr !== "object" || fr === null) return false;

  const r = fr as Record<string, unknown>;
  return (
    typeof r.form_id === "string" &&
    typeof r.token === "string" &&
    typeof r.submitted_at === "string"
  );
}

export type ParsedSubmission = {
  submission: {
    event_id: string;
    form_id: string;
    form_title: string | null;
    response_token: string;
    landed_at: string | null;
    submitted_at: string;
    hidden: Record<string, unknown>;
    variables: Record<string, unknown>;
    raw_payload: unknown;
  };
  answers: Array<{
    field_id: string;
    field_ref: string | null;
    field_type: string;
    question: string | null;
    answer_type: string;
    answer_text: string;
    answer_value: unknown;
    position: number;
  }>;
};

/** Achata o payload nas duas linhas/tabelas que o banco espera. */
export function parsePayload(payload: TypeformWebhookPayload): ParsedSubmission {
  const fr = payload.form_response;
  const fields = fr.definition?.fields ?? [];

  // O enunciado da pergunta e a ordem vivem na definition, não na answer.
  const fieldIndex = new Map<string, { field: TypeformField; position: number }>();
  fields.forEach((field, position) => fieldIndex.set(field.id, { field, position }));

  // variables vem como array [{key, type, number|text}]; vira objeto chave→valor.
  const variables: Record<string, unknown> = {};
  for (const v of fr.variables ?? []) {
    variables[v.key] = v.type === "number" ? v.number : v.text;
  }

  const answers = (fr.answers ?? []).map((answer, i) => {
    const match = fieldIndex.get(answer.field?.id);

    return {
      field_id: answer.field?.id ?? `unknown_${i}`,
      field_ref: answer.field?.ref ?? match?.field.ref ?? null,
      field_type: answer.field?.type ?? match?.field.type ?? answer.type,
      question: match?.field.title ?? null,
      answer_type: answer.type,
      answer_text: answerToText(answer),
      answer_value: answerToValue(answer),
      // Campo fora da definition (raro) vai para o fim, preservando a ordem.
      position: match?.position ?? fields.length + i,
    };
  });

  return {
    submission: {
      event_id: payload.event_id,
      form_id: fr.form_id,
      form_title: fr.definition?.title ?? null,
      response_token: fr.token,
      landed_at: fr.landed_at ?? null,
      submitted_at: fr.submitted_at,
      hidden: fr.hidden ?? {},
      variables,
      raw_payload: payload,
    },
    answers,
  };
}
