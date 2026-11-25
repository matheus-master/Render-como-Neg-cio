import { useQuery } from '@tanstack/react-query';
import { useAuth } from './auth';
import { supabase } from './supabase';

export interface HThread { id: string; title: string; updated_at: string }
export interface HMessage { id: string; role: 'user' | 'assistant'; content: string; images: string[]; created_at: string }

export function useThreads() {
  const uid = useAuth().session?.user.id;
  return useQuery({
    queryKey: ['harvey-threads', uid],
    enabled: !!uid,
    queryFn: async () => {
      const r = await supabase.from('agent_threads').select('id, title, updated_at').eq('agent', 'harvey').eq('student_id', uid!).order('updated_at', { ascending: false });
      if (r.error) throw new Error(r.error.message);
      return r.data as HThread[];
    },
  });
}

export function useMessages(threadId: string | null) {
  return useQuery({
    queryKey: ['harvey-messages', threadId],
    enabled: !!threadId,
    queryFn: async () => {
      const r = await supabase.from('agent_messages').select('id, role, content, images, created_at').eq('thread_id', threadId!).order('created_at');
      if (r.error) throw new Error(r.error.message);
      return r.data as HMessage[];
    },
  });
}

/** Diminui o print antes de subir (até 1600 px, JPEG): mais rápido e mais barato para a IA ler. */
async function shrink(file: File): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('imagem'))), 'image/jpeg', 0.85));
  } catch {
    return file;
  }
}

export async function uploadPrint(uid: string, file: File): Promise<string> {
  const blob = await shrink(file);
  if (blob.size > 5 * 1024 * 1024) throw new Error('Esse print é grande demais. Tente um recorte menor.');
  const path = `${uid}/harvey/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage.from('files').upload(path, blob, { contentType: 'image/jpeg' });
  if (error) throw new Error('Não deu para enviar o print. Tente de novo.');
  return path;
}

/** Envia a mensagem e vai entregando a resposta conforme o Harvey escreve. */
export async function sendHarvey(
  input: { threadId: string | null; text: string; images: string[] },
  on: { thread: (id: string) => void; delta: (t: string) => void },
): Promise<{ threadId: string | null; error?: string }> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/api/agents/harvey', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(input),
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { threadId: input.threadId, error: j.error || 'Não deu para falar com o Harvey agora.' };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let threadId = input.threadId;
  let error: string | undefined;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const ev = /^event: (.*)$/m.exec(chunk)?.[1];
      const raw = /^data: (.*)$/m.exec(chunk)?.[1];
      if (!ev || !raw) continue;
      const d = JSON.parse(raw) as { t?: string; threadId?: string; error?: string };
      if (ev === 'thread' && d.threadId) {
        threadId = d.threadId;
        on.thread(d.threadId);
      } else if (ev === 'delta' && d.t) on.delta(d.t);
      else if (ev === 'error') error = d.error;
    }
  }
  return { threadId, error };
}

export async function signedImages(paths: string[]) {
  if (!paths.length) return {} as Record<string, string>;
  const { data } = await supabase.storage.from('files').createSignedUrls(paths, 3600);
  return Object.fromEntries((data || []).filter((x) => x.signedUrl).map((x) => [x.path!, x.signedUrl]));
}
