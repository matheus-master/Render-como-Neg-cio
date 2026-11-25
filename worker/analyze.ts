import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { z } from 'zod';
import { FEEDBACK_JSON_SCHEMA, type Feedback, type Slot } from '../shared/domain';
import { PermanentError, type Env } from './env';
import { loadMaterial, type SubmissionRow } from './material';
import { systemPrompt, userPrompt, type Criterion } from './prompt';
import { adminClient } from './supabase';

const MODEL = 'claude-opus-5-5';
/** PDFs acima disso vão pela Files API (o limite da requisição é 32 MB e o base64 cresce ~33%). */
const INLINE_PDF_LIMIT = 20 * 1024 * 1024;

const FeedbackSchema = z.object({
  verdict: z.enum(['ok', 'aj', 're']),
  sum: z.string(),
  strong: z.array(z.string()),
  pts: z.array(
    z.object({
      sec: z.enum(['obrigatorio', 'regras', 'marca', 'imagens', 'portugues', 'sugestao', 'observacao']).optional(),
      pg: z.string().optional(),
      t: z.string(),
      d: z.string(),
      s: z.string(),
    }),
  ),
  steps: z.array(z.string()),
});

type Row = SubmissionRow & { slot: Slot; version: number; note: string | null; status: string; student_id: string };

/**
 * Processa um envio: lê o material, chama a IA e grava ai_draft + draft.
 * Lança PermanentError para falhas que não adianta repetir; outros erros são repetidos pela fila.
 */
export async function processSubmission(env: Env, submissionId: string): Promise<void> {
  const supa = adminClient(env);
  const { data: sub, error } = await supa
    .from('submissions')
    .select('id, student_id, slot, version, note, status, source_kind, file_path, file_name, link_url, pasted_text')
    .eq('id', submissionId)
    .single<Row>();
  if (error || !sub) throw new PermanentError('Envio não encontrado');
  if (sub.status === 'pronta') return; // já liberado: nada a fazer

  const [{ data: prof }, material] = await Promise.all([
    supa.from('profiles').select('group_name').eq('id', sub.student_id).single<{ group_name: string | null }>(),
    loadMaterial(supa, sub),
  ]);
  const group = prof?.group_name ?? null;

  let critQuery = supa
    .from('criteria')
    .select('name, guidance, weight, good_examples, bad_examples')
    .eq('slot', sub.slot)
    .eq('published', true)
    .order('position');
  critQuery = group ? critQuery.or(`group_name.is.null,group_name.eq.${group}`) : critQuery.is('group_name', null);
  const { data: criteria } = await critQuery;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 2 });

  let doc: Anthropic.Beta.BetaContentBlockParam;
  if (material.kind === 'pdf') {
    if (material.bytes.byteLength <= INLINE_PDF_LIMIT) {
      doc = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: toBase64(material.bytes) }, title: material.name };
    } else {
      const uploaded = await client.files.upload({
        file: await toFile(material.bytes, 'material.pdf', { type: 'application/pdf' }),
        expires_in_seconds: 3600,
      });
      doc = { type: 'document', source: { type: 'file', file_id: uploaded.id }, title: material.name };
    }
  } else {
    doc = { type: 'document', source: { type: 'text', media_type: 'text/plain', data: material.text }, title: material.name };
  }

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: FEEDBACK_JSON_SCHEMA as unknown as Record<string, unknown> } },
    system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }],
    messages: [
      {
        role: 'user',
        content: [
          doc,
          { type: 'text', text: userPrompt({ slot: sub.slot, group, note: sub.note, version: sub.version, criteria: (criteria || []) as Criterion[] }) },
        ],
      },
    ],
  });
  const msg = await stream.finalMessage();

  if (msg.stop_reason === 'refusal') throw new PermanentError('A análise automática recusou este material. Escreva a devolutiva do zero.');
  if (msg.stop_reason === 'max_tokens') throw new Error('Resposta cortada por max_tokens');
  const text = msg.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let parsed: Feedback;
  try {
    parsed = FeedbackSchema.parse(JSON.parse(text));
  } catch {
    throw new Error('Resposta da IA fora do formato esperado');
  }

  // Material em texto (Word/link/colado) fica guardado para a equipe ler na revisão.
  const materialText = material.kind === 'text' && sub.source_kind !== 'text' ? material.text.slice(0, 500_000) : null;

  const { error: upErr } = await supa
    .from('feedbacks')
    .update({ ai_status: 'done', ai_error: null, ai_draft: parsed, draft: parsed, material_text: materialText })
    .eq('submission_id', sub.id);
  if (upErr) throw new Error('Falha ao gravar o rascunho: ' + upErr.message);
  await supa.from('submissions').update({ status: 'revisao' }).eq('id', sub.id).eq('status', 'analise');
}

/** Marca a análise como falha: o envio vai para revisão sem rascunho e a equipe assume. */
export async function markFailed(env: Env, submissionId: string, reason: string): Promise<void> {
  const supa = adminClient(env);
  await supa.from('feedbacks').update({ ai_status: 'failed', ai_error: reason.slice(0, 500) }).eq('submission_id', submissionId);
  await supa.from('submissions').update({ status: 'revisao' }).eq('id', submissionId).eq('status', 'analise');
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}
