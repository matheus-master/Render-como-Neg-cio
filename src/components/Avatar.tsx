import { useQuery } from '@tanstack/react-query';
import { initials } from '../lib/format';
import { supabase } from '../lib/supabase';

/** Endereço temporário da foto (bucket privado "files"); renovado a cada 50 minutos. */
export function useAvatarUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['avatar', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => (await supabase.storage.from('files').createSignedUrl(path!, 3600)).data?.signedUrl ?? null,
  });
}

/** Foto de perfil, ou as iniciais quando não houver foto. Usa as classes de círculo já existentes (.av, .avatar-btn). */
export function Avatar({ path, name, className = 'av', size, style }: { path?: string | null; name: string; className?: string; size?: number; style?: React.CSSProperties }) {
  const url = useAvatarUrl(path).data;
  const dim = size ? { width: size, height: size } : {};
  return (
    <div className={className} style={{ ...dim, overflow: 'hidden', ...style }} aria-hidden>
      {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(name)}
    </div>
  );
}
