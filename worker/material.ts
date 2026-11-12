import mammoth from 'mammoth';
import type { SupabaseClient } from '@supabase/supabase-js';
import { PermanentError } from './env';

export type Material =
  | { kind: 'pdf'; bytes: ArrayBuffer; name: string }
  | { kind: 'text'; text: string; name: string };

export interface SubmissionRow {
  id: string;
  source_kind: 'file' | 'link' | 'text';
  file_path: string | null;
  file_name: string | null;
  link_url: string | null;
  pasted_text: string | null;
}

export async function loadMaterial(supa: SupabaseClient, s: SubmissionRow): Promise<Material> {
  if (s.source_kind === 'text') return { kind: 'text', text: s.pasted_text || '', name: 'Texto colado' };

  if (s.source_kind === 'file') {
    const { data, error } = await supa.storage.from('submissions').download(s.file_path!);
    if (error || !data) throw new Error('Falha ao baixar o arquivo do storage: ' + (error?.message || 'vazio'));
    const bytes = await data.arrayBuffer();
    const name = s.file_name || s.file_path!.split('/').pop()!;
    return bytesToMaterial(bytes, name, data.type);
  }

  const res = await fetchLink(s.link_url!);
  if (!res.ok) throw new PermanentError(res.reason);
  return res.material;
}

async function bytesToMaterial(bytes: ArrayBuffer, name: string, mime = ''): Promise<Material> {
  const head = new Uint8Array(bytes.slice(0, 5));
  const isPdf = String.fromCharCode(...head) === '%PDF-';
  if (isPdf) return { kind: 'pdf', bytes, name };
  const isZip = head[0] === 0x50 && head[1] === 0x4b; // .docx é um zip
  if (isZip || /wordprocessingml/.test(mime) || /\.docx$/i.test(name)) {
    try {
      const { value } = await mammoth.extractRawText({ arrayBuffer: bytes } as never);
      if (value.trim().length < 20) throw new PermanentError('O Word está vazio ou só tem imagens. Peça o PDF ao aluno.');
      return { kind: 'text', text: value, name };
    } catch (e) {
      if (e instanceof PermanentError) throw e;
      throw new PermanentError('Não foi possível ler o arquivo Word.');
    }
  }
  throw new PermanentError('Formato não suportado. Envie PDF ou Word (.docx).');
}

// ---------------------------------------------------------------------
// Links (Drive, Docs, Dropbox, Behance e páginas públicas)
// ---------------------------------------------------------------------

/** Converte links de visualização em links de download direto. */
export function directUrls(raw: string): string[] {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
  } catch {
    return [];
  }
  const host = url.hostname.replace(/^www\./, '');
  const id = url.pathname.match(/\/d\/([\w-]{10,})/)?.[1] || url.searchParams.get('id');
  if (host === 'docs.google.com' && id) {
    if (url.pathname.startsWith('/document')) return [`https://docs.google.com/document/d/${id}/export?format=pdf`];
    if (url.pathname.startsWith('/presentation')) return [`https://docs.google.com/presentation/d/${id}/export/pdf`];
  }
  if (host === 'drive.google.com' && id) return [`https://drive.google.com/uc?export=download&id=${id}`];
  if (host.endsWith('dropbox.com')) {
    url.searchParams.set('dl', '1');
    return [url.toString()];
  }
  return [url.toString()];
}

const PRIVATE_MSG = 'O link está privado. No Drive, mude para "Qualquer pessoa com o link" e cole de novo.';

export async function fetchLink(raw: string): Promise<{ ok: true; material: Material } | { ok: false; private: boolean; reason: string }> {
  const [url] = directUrls(raw);
  if (!url) return { ok: false, private: false, reason: 'Esse link não parece válido.' };
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PortalRCN/1.0)' } });
  } catch {
    return { ok: false, private: false, reason: 'Não conseguimos abrir esse link. Confira se ele está certo.' };
  }
  const finalUrl = res.url || url;
  if (res.status === 401 || res.status === 403 || /accounts\.google\.com|ServiceLogin|\/login/i.test(finalUrl)) {
    return { ok: false, private: true, reason: PRIVATE_MSG };
  }
  if (!res.ok) return { ok: false, private: false, reason: 'Esse link não abriu (erro ' + res.status + '). Confira se ele está certo.' };

  const type = res.headers.get('content-type') || '';
  const bytes = await res.arrayBuffer();
  if (/text\/html/i.test(type)) {
    const html = new TextDecoder().decode(bytes);
    if (/accounts\.google\.com\/ServiceLogin|Solicitar acesso|Request access|You need access/i.test(html)) {
      return { ok: false, private: true, reason: PRIVATE_MSG };
    }
    const text = htmlToText(html);
    if (text.length < 200) return { ok: false, private: false, reason: 'Não encontramos conteúdo legível nesse link. Envie o PDF.' };
    return { ok: true, material: { kind: 'text', text, name: finalUrl } };
  }
  try {
    return { ok: true, material: await bytesToMaterial(bytes, finalUrl, type) };
  } catch (e) {
    return { ok: false, private: false, reason: (e as Error).message };
  }
}

function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/h\d|\/li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim()
    .slice(0, 200_000);
}
