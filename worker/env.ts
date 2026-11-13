export interface Env {
  ANALYSIS_QUEUE: Queue<AnalysisMessage>;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  ANTHROPIC_API_KEY: string;
  PORTAL_URL: string;
  /** Opcional: sem ele, o e-mail de devolutiva liberada não é enviado. */
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

export interface AnalysisMessage {
  submissionId: string;
}

/** Erro que não adianta tentar de novo (material ilegível, link privado…). */
export class PermanentError extends Error {}
