/**
 * Envia um payload de teste assinado para o endpoint do webhook.
 *
 *   npm run webhook:test
 *   npm run webhook:test -- https://seu-app.vercel.app
 *
 * O secret sai de TYPEFORM_WEBHOOK_SECRET (.env.local ou variável de ambiente).
 * Ao apontar para produção, use o mesmo secret configurado na Vercel.
 */
import crypto from "node:crypto";

// Node 21.7+ carrega .env sem dependência externa.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Sem .env.local: seguimos com o que já estiver no ambiente.
}

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const url = new URL("/api/webhooks/typeform", baseUrl).toString();
const secret = process.env.TYPEFORM_WEBHOOK_SECRET;

if (!secret) {
  console.error(
    "TYPEFORM_WEBHOOK_SECRET não definida.\n" +
      "Copie .env.example para .env.local e preencha o secret.",
  );
  process.exit(1);
}

const now = new Date();
const landed = new Date(now.getTime() - 96_000);

// Mesma forma do payload real do Typeform, com um exemplo de cada tipo comum.
const payload = {
  event_id: `test_${crypto.randomUUID()}`,
  event_type: "form_response",
  form_response: {
    form_id: "TESTFORM",
    token: crypto.randomBytes(16).toString("hex"),
    landed_at: landed.toISOString(),
    submitted_at: now.toISOString(),
    definition: {
      id: "TESTFORM",
      title: "Formulário de teste",
      fields: [
        { id: "f_nome", ref: "nome", type: "short_text", title: "Qual é o seu nome?" },
        { id: "f_email", ref: "email", type: "email", title: "Seu melhor e-mail" },
        {
          id: "f_servico",
          ref: "servico",
          type: "multiple_choice",
          title: "Qual serviço você procura?",
        },
        {
          id: "f_canais",
          ref: "canais",
          type: "multiple_choice",
          title: "Onde você já anuncia?",
        },
        { id: "f_orcamento", ref: "orcamento", type: "number", title: "Orçamento mensal (R$)" },
        { id: "f_urgente", ref: "urgente", type: "yes_no", title: "É urgente?" },
        { id: "f_detalhes", ref: "detalhes", type: "long_text", title: "Conte mais sobre o projeto" },
      ],
    },
    answers: [
      { type: "text", text: "Maria Oliveira", field: { id: "f_nome", type: "short_text", ref: "nome" } },
      { type: "email", email: "maria@exemplo.com.br", field: { id: "f_email", type: "email", ref: "email" } },
      {
        type: "choice",
        choice: { label: "Gestão de tráfego" },
        field: { id: "f_servico", type: "multiple_choice", ref: "servico" },
      },
      {
        type: "choices",
        choices: { labels: ["Instagram", "Google Ads"] },
        field: { id: "f_canais", type: "multiple_choice", ref: "canais" },
      },
      { type: "number", number: 5000, field: { id: "f_orcamento", type: "number", ref: "orcamento" } },
      { type: "boolean", boolean: true, field: { id: "f_urgente", type: "yes_no", ref: "urgente" } },
      {
        type: "text",
        text: "Precisamos escalar as campanhas antes da Black Friday.",
        field: { id: "f_detalhes", type: "long_text", ref: "detalhes" },
      },
    ],
    hidden: { utm_source: "teste-local" },
    variables: [{ key: "score", type: "number", number: 8 }],
  },
};

const body = JSON.stringify(payload);
const signature =
  "sha256=" + crypto.createHmac("sha256", secret).update(body, "utf8").digest("base64");

console.log(`POST ${url}`);

const response = await fetch(url, {
  method: "POST",
  headers: { "content-type": "application/json", "typeform-signature": signature },
  body,
});

const text = await response.text();
console.log(`${response.status} ${response.statusText}`);
console.log(text);

process.exit(response.ok ? 0 : 1);
