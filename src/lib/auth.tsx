import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from './supabase';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  studio: string;
  city: string;
  whatsapp: string;
  instagram: string;
  group_name: string | null;
  role: 'aluno' | 'staff';
  email_notify: boolean;
  created_at: string;
}

interface AuthState {
  session: Session | null;
  ready: boolean;
  profile: Profile | undefined;
  profileLoading: boolean;
  profileError: boolean;
  reloadProfile: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession((prev) => {
        if (prev?.user.id !== s?.user.id) qc.clear();
        return s;
      });
    });
    return () => data.subscription.unsubscribe();
  }, [qc]);

  const uid = session?.user.id;
  const q = useQuery({
    queryKey: ['profile', uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', uid!).single<Profile>();
      if (error) throw error;
      return data;
    },
  });

  const value: AuthState = {
    session,
    ready,
    profile: q.data,
    profileLoading: !!uid && q.isLoading,
    profileError: q.isError,
    reloadProfile: () => q.refetch(),
    signOut: async () => {
      await supabase.auth.signOut();
      qc.clear();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth fora do AuthProvider');
  return v;
}

/** Perfil garantido (uso dentro das rotas protegidas). */
export function useProfile(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('perfil não carregado');
  return profile;
}
