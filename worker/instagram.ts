import Anthropic from '@anthropic-ai/sdk';
import SKILL from '../agentes/analise-instagram/SKILL.md';
import type { Env } from './env';
import { userClient, type Caller } from './supabase';

/** Análise de Instagram (skill analise-instagram-rcn). Só a equipe gera; o rascunho é revisado antes de liberar. */
const MODEL = 'claude-opus-5-5';
const MAX_PRINTS = 12;
const SKILL_BODY = SKILL.replace(/^---[\s\S]*?---\s*/, '').trim();

const PORTAL = `<contexto_do_portal>
Você está no painel da equipe RCN (Suporte RCN), dentro do Portal RCN. Aqui você NÃO tem navegador nem acesso ao Instagram: trabalhe só com os prints enviados e os dados do aluno abaixo. Ignore as instruções de abrir o perfil, clicar em "mais", testar o link ou ver a data do último post se isso não aparecer nos prints.
- Avalie apenas o que está visível nos prints. Não invente: se algo não aparece (link da bio, legendas, hashtags, se há story ativo, data do último post), não afirme nada sobre isso.
- Depois do passo a passo, inclua a seção "**Não deu para conferir pelos prints**" com o que a equipe deve checar manualmente (ex.: se o link do WhatsApp abre e tem o 55, legendas e hashtags dos Reels, frequência de stories). Omita a seção se tudo foi conferido.
- Responda só com a devolutiva em Markdown, no formato da skill, começando pelo título "### Instagram — @perfil (Nome)". Nada antes nem depois.
</contexto_do_portal>`;

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

/**
 * POST /api/agents/instagram  { studentId, prints: string[], note? }  (só equipe)
 * Responde em SSE: "delta" (texto), "done" { reviewId } ou "error".
 */
export async function instagramReview(req: Request, env: Env, caller: Caller, ctx: ExecutionContext): Promise<Response> {
  if (caller.role !== 'staff') return json({ error: 'Sem permissão' }, 403);
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'A análise com IA ainda não foi ligada. Falta configurar a chave de IA do portal.' }, 503);
  const body = (await req.json().catch(() => ({}))) as { studentId?: unknown; prints?: unknown; note?: unknown };
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const prints = Array.isArray(body.prints) ? body.prints.filter((x): x is string => typeof x === 'string').slice(0, MAX_PRINTS) : [];
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : '';
  if (!/^[0-9a-f-]{36}$/.test(studentId)) return json({ error: 'Aluno inválido.' }, 400);
  if (!prints.length) return json({ error: 'Escolha pelo menos um print do perfil.' }, 400);
  if (prints.some((p) => !p.startsWith(`${studentId}/`))) return json({ error: 'Print inválido.' }, 400);

  const supa = userClient(env, caller.jwt);
  const { data: prof } = await supa.from('profiles').select('full_name, studio, city, group_name, instagram').eq('id', studentId).maybeSingle();
  if (!prof) return json({ error: 'Aluno não encontrado.' }, 404);

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const [i, path] of prints.entries()) {
    const { data } = await supa.storage.from('files').download(path);
    if (!data) continue;
    const type = data.type === 'image/png' || data.type === 'image/webp' || data.type === 'image/gif' ? data.type : 'image/jpeg';
    content.push({ type: 'text', text: `Print ${i + 1}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: type, data: Buffer.from(await data.arrayBuffer()).toString('base64') } });
  }
  if (!content.length) return json({ error: 'Não deu para abrir os prints escolhidos.' }, 400);
  content.push({
    type: 'text',
    text:
      `<dados_do_aluno>\nNome: ${prof.full_name}${prof.studio ? `\nStudio: ${prof.studio}` : ''}${prof.city ? `\nCidade: ${prof.city}` : ''}${prof.group_name ? `\nGrupo: ${prof.group_name}` : ''}` +
      `\nInstagram informado no portal: ${prof.instagram || '(não informado)'}\n</dados_do_aluno>` +
      (note ? `\n<observacao_da_equipe>\n${note}\n</observacao_da_equipe>` : '') +
      `\n\nAnalise o Instagram deste aluno a partir dos ${content.filter((c) => c.type === 'image').length} prints acima e escreva a devolutiva.`,
  });

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  let open = true;
  const send = async (event: string, data: unknown) => {
    if (!open) return;
    try {
      await writer.write(enc.encode(sse(event, data)));
    } catch {
      open = false; // a tela foi fechada: a análise continua e fica salva como rascunho
    }
  };

  const run = async () => {
    let text = '';
    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'high' },
        system: [{ type: 'text', text: `${SKILL_BODY}\n\n${PORTAL}`, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content }],
      });
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          text += ev.delta.text;
          await send('delta', { t: ev.delta.text });
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal' || !text.trim()) {
        await send('error', { error: 'A IA não conseguiu analisar esses prints. Tente com outros prints ou escreva a devolutiva à mão.' });
        return;
      }
      const { data: saved } = await supa
        .from('instagram_reviews')
        .insert({ student_id: studentId, content: text.trim(), prints, note, usage: final.usage as unknown as Record<string, unknown> })
        .select('id')
        .single();
      await send('done', { reviewId: saved?.id ?? null });
    } catch (e) {
      console.error('instagram', e);
      if (text.trim()) await supa.from('instagram_reviews').insert({ student_id: studentId, content: text.trim() + '\n\n_(análise interrompida: revise antes de liberar)_', prints, note });
      const msg = e instanceof Anthropic.RateLimitError ? 'Muita demanda na IA agora. Tente de novo em um minuto.' : 'Não deu para gerar a análise. Tente de novo.';
      await send('error', { error: msg });
    } finally {
      if (open) await writer.close().catch(() => undefined);
    }
  };
  ctx.waitUntil(run());
  return new Response(readable, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform' } });
}
