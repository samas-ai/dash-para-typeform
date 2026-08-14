/** Linha da tabela public.form_submissions. */
export type Submission = {
  id: string;
  event_id: string;
  form_id: string;
  form_title: string | null;
  response_token: string;
  landed_at: string | null;
  submitted_at: string;
  hidden: Record<string, unknown>;
  variables: Record<string, unknown>;
  raw_payload: unknown;
  received_at: string;
};

/** Linha da tabela public.form_answers. */
export type Answer = {
  id: number;
  submission_id: string;
  field_id: string;
  field_ref: string | null;
  field_type: string;
  question: string | null;
  answer_type: string;
  answer_text: string | null;
  answer_value: unknown;
  position: number;
};

/** Submission com as respostas já carregadas, do jeito que o dashboard usa. */
export type SubmissionWithAnswers = Submission & {
  form_answers: Answer[];
};
