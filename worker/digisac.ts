import type { Env } from './env';
import { userClient, type Caller } from './supabase';

/**
 * Digisac (plataforma de atendimento por WhatsApp da RCN).
 * Documentação oficial: Postman "Digisac" (documenter.getpostman.com/view/53282970/2sBXihpXmF).
 *  - Autenticação: Bearer token de Conta > API > Tokens de acesso pessoal (aqui: segredo DIGISAC_TOKEN no Cloudflare).
 *  - URL base: Conta > Informações (aqui: configuração "digisac_url", editada pela equipe em Ajustes).
 *  - Enviar mensagem pelo número: POST {URL}/api/v1/messages { text, number, serviceId, origin, dontOpenTicket }.
 *  - Conexões (serviceId): GET {URL}/api/v1/services.
 */
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

/** Número no formato do WhatsApp: só dígitos, com o 55 do Brasil. */
export function toWhatsNumber(raw: string): string {
  const d = (raw || '').replace(/\D/g, '').replace(/^0+/, '');
  if (!d) return '';
  return d.startsWith('55') && d.length >= 12 ? d : '55' + d;
}

/** Endereço base: aceita o que aparece em Conta > Informações (com ou sem /api/v1). Só https público. */
function baseUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw.trim() : 'https://' + raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !u.hostname.includes('.') || /^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname === 'localhost') return null;
  return (u.origin + u.pathname).replace(/\/+$/, '').replace(/\/api\/v1$/i, '');
}

async function config(env: Env, caller: Caller) {
  const { data } = await userClient(env, caller.jwt).from('settings').select('key, value').in('key', ['digisac_url', 'digisac_service_id']);
  const cfg = Object.fromEntries((data || []).map((r) => [r.key, r.value])) as Record<string, string>;
  return { base: cfg.digisac_url ? baseUrl(cfg.digisac_url) : null, serviceId: (cfg.digisac_service_id || '').trim() };
}

function problem(status: number, body: string): string {
  if (status === 401) return 'O Digisac não aceitou o token. Gere um novo em Conta > API > Tokens de acesso pessoal e atualize o DIGISAC_TOKEN.';
  if (status === 403) return 'O token do Digisac não tem permissão para isso. Use o token de um usuário supervisor.';
  if (status === 404) return 'Endereço do Digisac não encontrado. Confira o endereço em Ajustes (Conta > Informações no Digisac).';
  const msg = (() => { try { const j = JSON.parse(body); return j.message || j.error || ''; } catch { return ''; } })();
  return `O Digisac recusou o envio (${status})${msg ? `: ${String(msg).slice(0, 160)}` : ''}.`;
}

/** GET /api/digisac/services · conexões ativas, para a equipe escolher de qual número sai a mensagem. */
export async function digisacServices(env: Env, caller: Caller): Promise<Response> {
  if (caller.role !== 'staff') return json({ error: 'Sem permissão' }, 403);
  if (!env.DIGISAC_TOKEN) return json({ error: 'Falta configurar o token do Digisac (DIGISAC_TOKEN).' }, 503);
  const { base } = await config(env, caller);
  if (!base) return json({ error: 'Informe o endereço do Digisac em Ajustes.' }, 400);
  const q = encodeURIComponent(JSON.stringify({ where: { archivedAt: { $eq: null } }, order: [['name', 'asc']], page: 1, perPage: 50 }));
  let r: Response;
  try {
    r = await fetch(`${base}/api/v1/services?query=${q}`, { headers: { Authorization: `Bearer ${env.DIGISAC_TOKEN}`, Accept: 'application/json' } });
  } catch {
    return json({ error: 'Não deu para falar com o Digisac. Confira o endereço.' }, 502);
  }
  const text = await r.text();
  if (!r.ok) return json({ error: problem(r.status, text) }, 502);
  let list: unknown;
  try { list = JSON.parse(text); } catch { return json({ error: 'Resposta inesperada do Digisac.' }, 502); }
  const rows = (Array.isArray(list) ? list : (list as { data?: unknown[] }).data || []) as { id?: string; name?: string; type?: string; archivedAt?: string | null }[];
  return json({ services: rows.filter((s) => s.id && !s.archivedAt).map((s) => ({ id: String(s.id), name: s.name || 'Sem nome', type: s.type || '' })) });
}

/** POST /api/digisac/send  { studentId, text } · envia a mensagem pelo WhatsApp da RCN no Digisac. */
export async function digisacSend(req: Request, env: Env, caller: Caller): Promise<Response> {
  if (caller.role !== 'staff') return json({ error: 'Sem permissão' }, 403);
  if (!env.DIGISAC_TOKEN) return json({ error: 'Falta configurar o token do Digisac (DIGISAC_TOKEN).' }, 503);
  const body = (await req.json().catch(() => ({}))) as { studentId?: unknown; text?: unknown };
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 4000) : '';
  if (!/^[0-9a-f-]{36}$/.test(studentId)) return json({ error: 'Aluno inválido.' }, 400);
  if (!text) return json({ error: 'Escreva a mensagem.' }, 400);
  const { base, serviceId } = await config(env, caller);
  if (!base) return json({ error: 'Informe o endereço do Digisac em Ajustes.' }, 400);
  if (!serviceId) return json({ error: 'Escolha em Ajustes de qual conexão do Digisac a mensagem sai.' }, 400);
  const { data: prof } = await userClient(env, caller.jwt).from('profiles').select('whatsapp').eq('id', studentId).maybeSingle();
  const number = toWhatsNumber(prof?.whatsapp || '');
  if (number.length < 12) return json({ error: 'O aluno não tem WhatsApp válido no perfil.' }, 400);
  let r: Response;
  try {
    r = await fetch(`${base}/api/v1/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.DIGISAC_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      // A documentação traz as duas grafias do campo que evita abrir chamado; enviamos as duas.
      body: JSON.stringify({ text, number, serviceId, origin: 'bot', dontOpenTicket: true, dontOpenticket: true }),
    });
  } catch {
    return json({ error: 'Não deu para falar com o Digisac. Confira o endereço.' }, 502);
  }
  const out = await r.text();
  if (!r.ok) return json({ error: problem(r.status, out) }, 502);
  return json({ ok: true, number });
}
