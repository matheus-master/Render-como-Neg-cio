import type { Feedback } from '../shared/domain';
import { markFailed, processSubmission } from './analyze';
import { notifyReleased } from './email';
import { PermanentError, type AnalysisMessage, type Env } from './env';
import { fetchLink } from './material';
import { adminClient, getCaller, userClient } from './supabase';

/** Depois disso em "analise", o envio vai para revisão sem rascunho (a equipe assume). */
const ANALYSIS_TIMEOUT_MIN = 15;
const MAX_QUEUE_ATTEMPTS = 3;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await api(req, url, env, ctx);
    } catch (e) {
      console.error('api error', e);
      return json({ error: 'Erro interno' }, 500);
    }
  },

  async queue(batch: MessageBatch<AnalysisMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      const id = msg.body.submissionId;
      await adminClient(env).from('feedbacks').update({ ai_attempts: msg.attempts }).eq('submission_id', id);
      try {
        await processSubmission(env, id);
        msg.ack();
      } catch (e) {
        const err = e as Error;
        console.error('analysis failed', id, msg.attempts, err.message);
        if (err instanceof PermanentError || msg.attempts >= MAX_QUEUE_ATTEMPTS) {
          await markFailed(env, id, err.message);
          msg.ack();
        } else {
          msg.retry({ delaySeconds: 30 * msg.attempts });
        }
      }
    }
  },

  async scheduled(_ctrl: ScheduledController, env: Env): Promise<void> {
    const supa = adminClient(env);
    // 1) Envios que nunca entraram na fila (o app caiu entre o insert e o pedido de análise).
    const { data: orphan } = await supa
      .from('submissions')
      .select('id, feedbacks!inner(ai_status)')
      .eq('status', 'analise')
      .eq('feedbacks.ai_status', 'pending')
      .lt('created_at', new Date(Date.now() - 2 * 60_000).toISOString());
    for (const s of orphan || []) await enqueue(env, s.id);
    // 2) Análises que passaram do tempo.
    const { data: stale } = await supa
      .from('submissions')
      .select('id')
      .eq('status', 'analise')
      .lt('created_at', new Date(Date.now() - ANALYSIS_TIMEOUT_MIN * 60_000).toISOString());
    for (const s of stale || []) await markFailed(env, s.id, 'A análise passou do tempo limite');
  },
} satisfies ExportedHandler<Env, AnalysisMessage>;

async function enqueue(env: Env, submissionId: string) {
  await adminClient(env).from('feedbacks').update({ ai_status: 'queued', ai_error: null }).eq('submission_id', submissionId);
  await env.ANALYSIS_QUEUE.send({ submissionId });
}

async function api(req: Request, url: URL, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (url.pathname === '/api/health') return json({ ok: true });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const caller = await getCaller(env, req);
  if (!caller) return json({ error: 'Sessão expirada. Entre de novo.' }, 401);

  // POST /api/check-link  { url }
  if (url.pathname === '/api/check-link') {
    const { url: link } = (await req.json()) as { url?: string };
    if (!link) return json({ ok: false, private: false, reason: 'Cole um link.' });
    const r = await fetchLink(link);
    return json(r.ok ? { ok: true } : { ok: false, private: r.private, reason: r.reason });
  }

  const m = url.pathname.match(/^\/api\/submissions\/([0-9a-f-]{36})\/(analyze|release)$/);
  if (!m) return json({ error: 'Não encontrado' }, 404);
  const [, id, action] = m;
  const supa = adminClient(env);
  const { data: sub } = await supa.from('submissions').select('id, student_id, status, feedbacks(ai_status)').eq('id', id).single();
  if (!sub) return json({ error: 'Envio não encontrado' }, 404);
  const fb = sub.feedbacks as unknown as { ai_status: string };

  // POST /api/submissions/:id/analyze  · aluno (logo após enviar) ou equipe ("Gerar de novo")
  if (action === 'analyze') {
    const isOwner = sub.student_id === caller.id;
    if (caller.role !== 'staff') {
      if (!isOwner) return json({ error: 'Sem permissão' }, 403);
      if (sub.status !== 'analise' || fb.ai_status !== 'pending') return json({ ok: true, already: true });
    } else {
      if (sub.status === 'pronta') return json({ error: 'Esta devolutiva já foi liberada' }, 409);
      if (fb.ai_status === 'queued') return json({ ok: true, already: true });
    }
    await enqueue(env, id);
    return json({ ok: true });
  }

  // POST /api/submissions/:id/release  { draft }  · só equipe
  if (caller.role !== 'staff') return json({ error: 'Sem permissão' }, 403);
  const { draft } = (await req.json()) as { draft?: Feedback };
  if (!draft || !['ok', 'aj', 're'].includes(draft.verdict)) return json({ error: 'Escolha um veredito antes de liberar.' }, 400);
  const clean: Feedback = {
    verdict: draft.verdict,
    sum: (draft.sum || '').trim(),
    strong: (draft.strong || []).map((s) => s.trim()).filter(Boolean),
    pts: (draft.pts || []).map((p) => ({ t: p.t.trim(), d: p.d.trim(), s: p.s.trim() })).filter((p) => p.t),
    steps: (draft.steps || []).map((s) => s.trim()).filter(Boolean),
  };
  if (!clean.sum) return json({ error: 'Escreva o resumo antes de liberar.' }, 400);
  // RPC com o JWT de quem revisou: auth.uid() vira reviewer_id (a devolutiva sai assinada por essa pessoa).
  const { error } = await userClient(env, caller.jwt).rpc('release_feedback', { p_submission: id, p_draft: clean });
  if (error) return json({ error: error.message }, 400);
  ctx.waitUntil(notifyReleased(env, id).catch((e) => console.error('email', e)));
  return json({ ok: true });
}
