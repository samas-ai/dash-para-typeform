# Dashboard de respostas do Typeform

Recebe o payload do webhook do Typeform, grava no Supabase e mostra as respostas
num dashboard. Next.js 15 (App Router) + Supabase, pronto para deploy na Vercel.

- `POST /api/webhooks/typeform` — endpoint que o Typeform chama
- `/` — análise: gráficos agregados por pergunta, com filtro de período e formulário
- `/respostas` — lista de respostas, com busca e paginação
- `/submissions/[id]` — detalhe de um envio, incluindo o payload cru

---

## 1. Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor**, cole o conteúdo de
   [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) e execute.
3. Em **Project Settings → API**, copie:
   - **Project URL** → `SUPABASE_URL`
   - **service_role** (em Project API keys) → `SUPABASE_SERVICE_ROLE_KEY`

> A `service_role` key ignora o RLS. Ela só é usada no servidor e nunca pode ser
> exposta ao navegador — por isso o nome da variável não tem o prefixo
> `NEXT_PUBLIC_`. Se ela vazar, revogue em Project Settings → API.

## 2. Rodar local

O arquivo `.env.local` já foi criado com um `TYPEFORM_WEBHOOK_SECRET` gerado.
Preencha as duas variáveis do Supabase e suba o servidor:

```bash
npm run dev
```

Em outro terminal, envie um envio de teste assinado (não precisa do Typeform):

```bash
npm run webhook:test
```

O script monta um payload no mesmo formato do Typeform, assina com o secret do
`.env.local` e faz o POST. Se der `200`, abra
<http://localhost:3000/respostas> e a resposta estará lá.

## 3. Deploy na Vercel

```bash
npx vercel
```

Ou conecte o repositório em [vercel.com/new](https://vercel.com/new) — o Next.js
é detectado sozinho, sem configuração extra de build.

Em **Project Settings → Environment Variables**, cadastre as três variáveis para
os ambientes Production e Preview:

| Variável | Valor |
| --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `TYPEFORM_WEBHOOK_SECRET` | um secret novo, só para produção |

Gere o secret de produção com:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Redeploy depois de cadastrar as variáveis — a Vercel só injeta env vars em builds
novos.

## 4. Typeform

No seu formulário, vá em **Connect → Webhooks → Add a webhook**:

- **Endpoint**: `https://SEU-APP.vercel.app/api/webhooks/typeform`
- **Secret**: o mesmo valor de `TYPEFORM_WEBHOOK_SECRET` em produção

Salve, ative o webhook e envie uma resposta de teste no formulário. Ela deve
aparecer no dashboard em segundos.

O webhook é configurado **por formulário**, não por conta: cada formulário que
você quiser acompanhar precisa do seu próprio cadastro de endpoint e secret. O
dashboard lida com vários — o filtro de formulário aparece sozinho a partir do
segundo.

Para conferir contra produção sem preencher o formulário:

```bash
npm run webhook:test -- https://SEU-APP.vercel.app
```

(use o secret de produção no `.env.local` ao rodar isso)

---

## Como os dados são guardados

Duas tabelas:

- **`form_submissions`** — uma linha por envio. Guarda os metadados e o
  `raw_payload` completo em `jsonb`. Se você criar uma pergunta nova no Typeform,
  nada quebra: o dado bruto está sempre lá.
- **`form_answers`** — uma linha por pergunta respondida, achatada. Tem o
  `answer_text` legível (é o que o dashboard mostra) e o `answer_value` tipado.

Consultar uma pergunta específica fica direto, usando o `ref` que você definiu no
Typeform:

```sql
select s.submitted_at, a.answer_text
from form_answers a
join form_submissions s on s.id = a.submission_id
where a.field_ref = 'email'
order by s.submitted_at desc;
```

## A página de análise

Cada tipo de pergunta ganha a forma que corresponde ao que se pode concluir dela:

| Tipo no Typeform | O que aparece |
| --- | --- |
| Múltipla escolha, dropdown, sim/não | barras de frequência, ordenadas da mais escolhida |
| Escala de opinião, nota, NPS | média/mediana/mín/máx **e** a distribuição, na ordem da escala |
| Número | média, mediana, mínimo e máximo |
| Texto, e-mail, telefone | quantas pessoas responderam e as últimas respostas |

A seleção múltipla conta cada opção marcada, então os percentuais somam mais de
100% — o denominador é "quantas pessoas responderam a pergunta", não "quantas
marcações houve".

**A análise por pergunta é sempre de um formulário só.** Formulários diferentes
têm perguntas diferentes; somar tudo faria a mesma pergunta aparecer uma vez por
formulário. A página abre já filtrada no formulário com mais envios, e a opção
"Todos" mostra apenas o que dá para comparar entre formulários (o volume).

Os gráficos são SVG e HTML gerados no servidor — sem biblioteca de charts e sem
JavaScript no cliente. Todos usam **uma cor só**: o que o leitor faz aqui é
comparar tamanhos, e nesse caso pintar cada barra de uma cor gastaria o canal de
cor repetindo o que o comprimento já diz (além de criar um problema de
daltonismo à toa). Todo valor também aparece escrito, e a linha do tempo tem uma
versão em tabela, então nada depende de enxergar cor ou de passar o mouse.

## Detalhes de implementação

**Assinatura.** O endpoint valida o header `Typeform-Signature`
(HMAC-SHA256 do corpo, em base64) com `crypto.timingSafeEqual`. O corpo é lido
como texto cru, nunca com `req.json()` — reserializar o JSON mudaria o hash.
Sem `TYPEFORM_WEBHOOK_SECRET` configurada o endpoint recusa tudo com 500, em vez
de aceitar requisições não verificadas.

**Idempotência.** `event_id` é `unique`. Se o Typeform reentregar o mesmo evento,
o insert falha com `23505` e respondemos `200 {duplicate: true}` — sem linha
duplicada.

**Códigos de resposta.** O Typeform reentrega em 5xx e desiste em 4xx. Erro de
banco devolve 500 (queremos o retry); payload malformado devolve 400 (reentregar
não resolveria). Se a gravação das respostas falhar depois da submission, a
submission órfã é apagada para que o retry reprocesse o evento inteiro.

**Acesso.** O dashboard é público, mas o RLS está ligado sem policies: as chaves
`anon`/`authenticated` não leem nada pela API do Supabase. Todo acesso passa pelo
servidor. Para fechar o dashboard depois, adicione um `middleware.ts` na raiz —
o resto do código não muda.
