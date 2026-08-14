-- ---------------------------------------------------------------------------
-- Schema do dashboard de respostas do Typeform.
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- ---------------------------------------------------------------------------

-- Uma linha por envio de formulário.
create table if not exists public.form_submissions (
  id              uuid primary key default gen_random_uuid(),

  -- event_id é único por entrega do Typeform. É a nossa chave de idempotência:
  -- se o Typeform reenviar o mesmo evento (retry), o insert é ignorado.
  event_id        text not null unique,

  form_id         text not null,
  form_title      text,

  -- token da resposta no Typeform (útil para cruzar com a API deles)
  response_token  text not null,

  landed_at       timestamptz,
  submitted_at    timestamptz not null,

  -- hidden fields e variables calculadas do Typeform
  hidden          jsonb not null default '{}'::jsonb,
  variables       jsonb not null default '{}'::jsonb,

  -- payload cru, na íntegra. Rede de segurança: se o parser errar algo,
  -- ou se você criar uma pergunta nova, o dado original continua aqui.
  raw_payload     jsonb not null,

  received_at     timestamptz not null default now()
);

comment on column public.form_submissions.event_id is
  'ID do evento do Typeform. Unique = idempotência contra reentregas.';

-- Uma linha por pergunta respondida, achatada para facilitar consulta/filtro.
create table if not exists public.form_answers (
  id             bigint generated always as identity primary key,
  submission_id  uuid not null references public.form_submissions(id) on delete cascade,

  field_id       text not null,
  field_ref      text,
  field_type     text not null,

  -- enunciado da pergunta, copiado da definition do payload
  question       text,

  answer_type    text not null,

  -- versão legível da resposta, sempre preenchida (é o que o dashboard mostra)
  answer_text    text,

  -- valor tipado cru (número, array de escolhas, objeto de pagamento, ...)
  answer_value   jsonb,

  -- ordem da pergunta dentro do formulário
  position       int not null
);

create index if not exists form_submissions_submitted_at_idx
  on public.form_submissions (submitted_at desc);

create index if not exists form_submissions_form_id_idx
  on public.form_submissions (form_id);

create index if not exists form_answers_submission_id_idx
  on public.form_answers (submission_id);

create index if not exists form_answers_field_ref_idx
  on public.form_answers (field_ref);

-- Busca textual simples nas respostas (usada pelo campo de busca do dashboard).
create index if not exists form_answers_answer_text_idx
  on public.form_answers using gin (to_tsvector('portuguese', coalesce(answer_text, '')));

-- ---------------------------------------------------------------------------
-- RLS: ligado e SEM policies.
--
-- Isso bloqueia as chaves anon/authenticated por completo — ninguém lê o banco
-- pela API pública do Supabase. A aplicação acessa tudo pelo servidor com a
-- service_role key, que ignora RLS por definição.
--
-- Se um dia você quiser ler direto do browser, crie policies explícitas aqui.
-- ---------------------------------------------------------------------------
alter table public.form_submissions enable row level security;
alter table public.form_answers     enable row level security;
