import { SLOTS, VERDICTS, type Feedback, type Slot } from '../shared/domain';
import type { Env } from './env';
import { adminClient } from './supabase';

/** Envia o aviso de devolutiva liberada, se o aluno deixou o aviso ligado no Perfil. Idempotente. */
export async function notifyReleased(env: Env, submissionId: string): Promise<'sent' | 'skipped' | 'disabled'> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return 'disabled';
  const supa = adminClient(env);
  const { data } = await supa
    .from('submissions')
    .select('slot, version, student:profiles!submissions_student_id_fkey(full_name, email, email_notify), fb:feedbacks(released, notified_at, reviewer:profiles!feedbacks_reviewer_id_fkey(full_name))')
    .eq('id', submissionId)
    .single();
  if (!data) return 'skipped';
  const row = data as unknown as {
    slot: Slot;
    version: number;
    student: { full_name: string; email: string; email_notify: boolean };
    fb: { released: Feedback | null; notified_at: string | null; reviewer: { full_name: string } | null };
  };
  if (!row.student.email_notify || !row.fb.released || row.fb.notified_at) return 'skipped';

  const first = row.student.full_name.split(' ')[0] || '';
  const doc = SLOTS[row.slot].title;
  const v = VERDICTS[row.fb.released.verdict];
  const reviewer = row.fb.reviewer?.full_name?.split(' ')[0] || 'a equipe';
  const link = `${env.PORTAL_URL.replace(/\/$/, '')}/documentos/${row.slot}/devolutiva`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#16181D;max-width:520px">
  <p>Olá, ${esc(first)}!</p>
  <p>Sua devolutiva de <b>${esc(doc)}</b> (versão ${row.version}) chegou, revisada por ${esc(reviewer)}.</p>
  <p style="background:${v.bg};color:${v.fg};padding:12px 14px;border-radius:12px"><b>${v.mark} ${v.label}</b> · ${esc(row.fb.released.sum)}</p>
  <p><a href="${link}" style="display:inline-block;background:#0B2C5F;color:#fff;padding:14px 22px;border-radius:12px;text-decoration:none;font-weight:600">Ver devolutiva</a></p>
  <p style="font-size:13px;color:#5B606B">Você recebe este aviso porque ele está ligado no seu perfil do portal.</p>
</div>`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [row.student.email], subject: `Sua devolutiva chegou · ${doc}`, html }),
  });
  if (!res.ok) throw new Error('Falha no envio do e-mail: ' + res.status + ' ' + (await res.text()).slice(0, 200));
  await supa.from('feedbacks').update({ notified_at: new Date().toISOString() }).eq('submission_id', submissionId);
  return 'sent';
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
