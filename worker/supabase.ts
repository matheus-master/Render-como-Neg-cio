import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env';

const opts = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** Cliente com service role: ignora RLS. Só para o Worker. */
export const adminClient = (env: Env): SupabaseClient => {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts);
};

/** Cliente agindo como o usuário do JWT: respeita RLS e auth.uid(). */
export const userClient = (env: Env, jwt: string): SupabaseClient =>
  createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { ...opts, global: { headers: { Authorization: `Bearer ${jwt}` } } });

export interface Caller {
  id: string;
  jwt: string;
  role: 'aluno' | 'staff';
}

/** Identifica quem chamou a API pelo JWT. Usa o próprio login do usuário (não precisa da chave secreta). */
export async function getCaller(env: Env, req: Request): Promise<Caller | null> {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!jwt) return null;
  const supa = userClient(env, jwt);
  const { data, error } = await supa.auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: prof } = await supa.from('profiles').select('role').eq('id', data.user.id).single();
  if (!prof) return null;
  return { id: data.user.id, jwt, role: prof.role };
}

/** A chave secreta só é necessária para a análise automática (fila) e para o e-mail. */
export const hasServiceKey = (env: Env) => !!env.SUPABASE_SERVICE_ROLE_KEY;
