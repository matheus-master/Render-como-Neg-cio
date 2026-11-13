import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env');
}

export const supabase = createClient(SUPABASE_URL || 'http://localhost', SUPABASE_ANON_KEY || 'anon');

/** Chama a API do Worker com o JWT da sessão. */
export async function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body ?? {}),
  });
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(out.error || 'Erro ' + res.status);
  return out;
}

/** GET na API do Worker com o JWT da sessão. */
export async function apiGet<T = unknown>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` } });
  const out = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok && !(out as { configured?: boolean }).configured) throw new Error(out.error || 'Erro ' + res.status);
  return out;
}
