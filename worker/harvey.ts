import Anthropic from '@anthropic-ai/sdk';
import SKILL from '../agentes/harvey/SKILL.md';
import type { Env } from './env';
import { userClient, type Caller } from './supabase';

/** Agente Harvey: consultor comercial do aluno. A skill (agentes/harvey/SKILL.md) é o prompt de sistema. */
const MODEL = 'claude-opus-5-5';
const HISTORY = 30; // mensagens da conversa enviadas a cada pergunta
const MAX_IMAGES = 4;
const MAX_TEXT = 8000;

const SKILL_BODY = SKILL.replace(/^---[\s\S]*?---\s*/, '').trim();

const PORTAL = `<contexto_do_portal>
Você está dentro do Portal do Aluno da mentoria Render como Negócio, conversando com um aluno (artista 3D ou studio de visualização arquitetônica).
- O aluno pode anexar prints de conversas com clientes (WhatsApp, Instagram, e-mail). Leia o print com atenção: quem é o cliente, o que foi dito por cada lado, em que etapa a venda está.
- Os dados em <dados_do_aluno> vêm dos relatórios quinzenais que o próprio aluno preencheu no portal. Use-os no modo Diretor e no planejamento, sempre citando o período. Eles não são um CRM nem uma lista de oportunidades. Se faltar dado, peça.
- A conversa fica salva no histórico do aluno no portal, mas não existe CRM estruturado aqui: quando montar fichas ou tabelas de CRM, diga que ele pode copiar para o controle dele. Nunca diga que registrou algo num CRM.
- Formatação: Markdown simples (títulos curtos, listas, negrito; tabelas quando ajudarem). Toda mensagem pronta para enviar ao cliente vai em bloco de citação (linhas começando com "> "), para o aluno copiar com um toque.
- Seja objetivo. No modo Consultor, vá direto ao ponto. Aprofunde no Estrategista, no Diretor ou quando o aluno pedir.
</contexto_do_portal>`;

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

type Supa = ReturnType<typeof userClient>;

/** Hoje (Brasília) à meia-noite, em ISO. */
const todayStartIso = () => {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return new Date(`${d}T00:00:00-03:00`).toISOString();
};

/** Números e contexto do aluno, tirados do que ele mesmo registrou no portal. */
async function studentData(supa: Supa, studentId: string): Promise<string> {
  const [prof, reps, plans] = await Promise.all([
    supa.from('profiles').select('full_name, studio, city, group_name').eq('id', studentId).maybeSingle(),
    supa
      .from('reports')
      .select('period_start, period_end, executed, leads, contacts, responses, appointments, meetings, proposals, closed, revenue, wins, struggles, next_focus')
      .eq('student_id', studentId)
      .order('period_end', { ascending: false })
      .limit(6),
    supa.from('action_plans').select('title, archived, items:action_items(text, done_at, position)').eq('student_id', studentId).eq('archived', false),
  ]);
  const p = prof.data;
  const lines: string[] = ['<dados_do_aluno>'];
  if (p) lines.push(`Aluno: ${p.full_name}${p.studio ? ` · studio ${p.studio}` : ''}${p.city ? ` · ${p.city}` : ''}${p.group_name ? ` · grupo ${p.group_name}` : ''}`);
  const r = reps.data || [];
  if (!r.length) lines.push('Relatórios quinzenais: nenhum enviado ainda.');
  else {
    lines.push('Relatórios quinzenais (mais recente primeiro; números da quinzena, informados pelo aluno):');
    for (const x of r) {
      lines.push(
        `- ${x.period_start} a ${x.period_end}: faturamento R$ ${Number(x.revenue).toLocaleString('pt-BR')} · leads ${x.leads} · contatos ${x.contacts} · respostas ${x.responses} · agendamentos ${x.appointments} · reuniões ${x.meetings} · propostas ${x.proposals} · fechados ${x.closed}` +
          (x.executed ? '' : ' · não conseguiu executar nesta quinzena') +
          (x.wins ? ` · conquista: ${x.wins}` : '') +
          (x.struggles ? ` · dificuldade: ${x.struggles}` : '') +
          (x.next_focus ? ` · combinado: ${x.next_focus}` : ''),
      );
    }
  }
  for (const pl of plans.data || []) {
    const items = [...((pl.items as { text: string; done_at: string | null; position: number }[]) || [])].sort((a, b) => a.position - b.position);
    if (items.length) lines.push(`Plano de ação "${pl.title}": ` + items.map((i) => `${i.done_at ? '[feito]' : '[pendente]'} ${i.text}`).join('; '));
  }
  lines.push('</dados_do_aluno>');
  return lines.join('\n');
}

async function imageBlock(supa: Supa, path: string): Promise<Anthropic.Beta.BetaImageBlockParam | null> {
  const { data } = await supa.storage.from('files').download(path);
  if (!data) return null;
  const type = data.type === 'image/png' || data.type === 'image/webp' || data.type === 'image/gif' ? data.type : 'image/jpeg';
  return { type: 'image', source: { type: 'base64', media_type: type, data: Buffer.from(await data.arrayBuffer()).toString('base64') } };
}

/**
 * POST /api/agents/harvey  { threadId?, text, images? }
 * Responde em SSE: "thread" (id da conversa), "delta" (texto), "done" ou "error".
 */
export async function harveyChat(req: Request, env: Env, caller: Caller, ctx: ExecutionContext): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'O Harvey ainda não foi ligado. Falta configurar a chave de IA do portal.' }, 503);
  const body = (await req.json().catch(() => ({}))) as { threadId?: unknown; text?: unknown; images?: unknown };
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, MAX_TEXT) : '';
  const images = Array.isArray(body.images) ? body.images.filter((x): x is string => typeof x === 'string').slice(0, MAX_IMAGES) : [];
  if (!text && !images.length) return json({ error: 'Escreva uma mensagem ou anexe um print.' }, 400);
  if (images.some((p) => !p.startsWith(`${caller.id}/harvey/`))) return json({ error: 'Imagem inválida.' }, 400);

  const supa = userClient(env, caller.jwt);
  if (caller.role === 'aluno') {
    const { data: active } = await supa.rpc('access_active');
    if (active === false) return json({ error: 'Sua mentoria terminou. Para voltar a usar o Harvey, fale com a equipe RCN sobre a renovação.' }, 403);
  }

  // Limite diário de mensagens por aluno (custo sob controle).
  const [{ data: lim }, { count }] = await Promise.all([
    supa.from('settings').select('value').eq('key', 'harvey_daily_limit').maybeSingle(),
    supa
      .from('agent_messages')
      .select('id, agent_threads!inner(student_id)', { count: 'exact', head: true })
      .eq('role', 'user')
      .eq('agent_threads.student_id', caller.id)
      .gte('created_at', todayStartIso()),
  ]);
  const limit = Number(lim?.value) || 60;
  if ((count ?? 0) >= limit) return json({ error: `Você chegou ao limite de ${limit} mensagens por dia com o Harvey. Amanhã ele volta.` }, 429);

  // Conversa: existente (do próprio aluno) ou nova.
  let threadId = typeof body.threadId === 'string' ? body.threadId : '';
  if (threadId) {
    const { data: t } = await supa.from('agent_threads').select('id, student_id').eq('id', threadId).maybeSingle();
    if (!t || t.student_id !== caller.id) return json({ error: 'Conversa não encontrada.' }, 404);
  } else {
    const title = (text.replace(/^\/[a-z-]+\s*/i, '') || 'Análise de print').replace(/\s+/g, ' ').slice(0, 70);
    const { data: t, error } = await supa.from('agent_threads').insert({ student_id: caller.id, agent: 'harvey', title }).select('id').single();
    if (error || !t) return json({ error: 'Não deu para abrir a conversa.' }, 500);
    threadId = t.id;
  }
  const ins = await supa.from('agent_messages').insert({ thread_id: threadId, role: 'user', content: text, images });
  if (ins.error) return json({ error: 'Não deu para salvar sua mensagem.' }, 500);

  const { data: hist } = await supa
    .from('agent_messages')
    .select('role, content, images')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: false })
    .limit(HISTORY);
  const rows = (hist || []).reverse();
  while (rows.length && rows[0]!.role !== 'user') rows.shift();

  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const [i, m] of rows.entries()) {
    const last = i === rows.length - 1;
    if (m.role === 'assistant') {
      messages.push({ role: 'assistant', content: m.content || '(sem resposta)' });
      continue;
    }
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (last) {
      for (const path of m.images as string[]) {
        const img = await imageBlock(supa, path);
        if (img) content.push(img);
      }
    } else if ((m.images as string[]).length) {
      content.push({ type: 'text', text: `[O aluno enviou ${(m.images as string[]).length} print(s) nesta mensagem.]` });
    }
    content.push({ type: 'text', text: m.content || (last ? 'Analise o print que enviei.' : '(print)') });
    messages.push({ role: 'user', content });
  }

  const system: Anthropic.Beta.BetaTextBlockParam[] = [
    { type: 'text', text: `${SKILL_BODY}\n\n${PORTAL}`, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: await studentData(supa, caller.id) },
  ];

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const enc = new TextEncoder();
  let open = true;
  const send = async (event: string, data: unknown) => {
    if (!open) return;
    try {
      await writer.write(enc.encode(sse(event, data)));
    } catch {
      open = false; // o aluno fechou a tela: a resposta continua e é salva mesmo assim
    }
  };

  const run = async () => {
    await send('thread', { threadId });
    let answer = '';
    try {
      const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}) });
      const stream = client.beta.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system,
        messages,
      });
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          answer += ev.delta.text;
          await send('delta', { t: ev.delta.text });
        }
      }
      const final = await stream.finalMessage();
      if (final.stop_reason === 'refusal') {
        const note = '\n\nNão consigo ajudar com esse pedido. Me conte de outro jeito o que você precisa na venda.';
        answer += note;
        await send('delta', { t: note });
      }
      const saved = await supa
        .from('agent_messages')
        .insert({ thread_id: threadId, role: 'assistant', content: answer, usage: final.usage as unknown as Record<string, unknown> })
        .select('id')
        .single();
      await supa.from('agent_threads').update({ updated_at: new Date().toISOString() }).eq('id', threadId);
      await send('done', { threadId, messageId: saved.data?.id ?? null });
    } catch (e) {
      console.error('harvey', e);
      const msg =
        e instanceof Anthropic.RateLimitError
          ? 'O Harvey está com muita demanda agora. Tente de novo em um minuto.'
          : e instanceof Anthropic.APIError && (e.status ?? 0) >= 500
            ? 'O serviço de IA está instável agora. Tente de novo em instantes.'
            : 'Não deu para gerar a resposta. Tente de novo.';
      if (answer) await supa.from('agent_messages').insert({ thread_id: threadId, role: 'assistant', content: answer + '\n\n_(resposta interrompida)_' });
      await send('error', { error: msg, threadId });
    } finally {
      if (open) await writer.close().catch(() => undefined);
    }
  };
  ctx.waitUntil(run());

  return new Response(readable, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
  });
}
