import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { supabase } from './supabase';

/** Plataforma de aulas: cursos > módulos > aulas, e o progresso de cada aluno. */
export interface Material { name: string; path?: string; url?: string }
export interface Course {
  id: string; title: string; subtitle: string; description: string; category: string; cover_path: string | null;
  accent: string; featured: boolean; groups: string[]; published: boolean; position: number; created_at: string; updated_at: string;
}
export interface CourseModule { id: string; course_id: string; title: string; position: number }
export interface Lesson {
  id: string; course_id: string; module_id: string; title: string; description: string; video_url: string;
  duration_min: number | null; materials: Material[]; published: boolean; position: number; created_at: string;
}
export interface Progress { lesson_id: string; course_id: string; watched_at: string; completed_at: string | null }

export interface CourseFull extends Course {
  modules: (CourseModule & { lessons: Lesson[] })[];
  lessons: Lesson[]; // todas, na ordem de exibição
  done: number;
  total: number;
  minutes: number;
  last?: { lesson: Lesson; at: string }; // última aula aberta
  next?: Lesson; // a próxima a assistir
  isNew: boolean;
}

const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

/** Junta cursos, módulos, aulas e progresso numa estrutura pronta para a tela. */
export function assemble(courses: Course[], modules: CourseModule[], lessons: Lesson[], progress: Progress[]): CourseFull[] {
  const prog = new Map(progress.map((p) => [p.lesson_id, p]));
  const now = Date.now();
  return courses
    .slice()
    .sort(byPos)
    .map((c) => {
      const mods = modules.filter((m) => m.course_id === c.id).sort(byPos).map((m) => ({ ...m, lessons: lessons.filter((l) => l.module_id === m.id).sort(byPos) }));
      const all = mods.flatMap((m) => m.lessons);
      const done = all.filter((l) => prog.get(l.id)?.completed_at).length;
      let last: CourseFull['last'];
      for (const l of all) {
        const p = prog.get(l.id);
        if (p && (!last || p.watched_at > last.at)) last = { lesson: l, at: p.watched_at };
      }
      // Próxima: a primeira não concluída depois da última aberta; senão a primeira não concluída.
      const startAt = last ? all.indexOf(last.lesson) : 0;
      const next =
        (last && !prog.get(last.lesson.id)?.completed_at ? last.lesson : undefined) ??
        all.slice(startAt).find((l) => !prog.get(l.id)?.completed_at) ??
        all.find((l) => !prog.get(l.id)?.completed_at);
      const minutes = all.reduce((s, l) => s + (l.duration_min || 0), 0);
      const newest = Math.max(Date.parse(c.created_at), ...all.map((l) => Date.parse(l.created_at)));
      return { ...c, modules: mods, lessons: all, done, total: all.length, minutes, last, next, isNew: now - newest < 14 * 86_400_000 };
    });
}

/** Catálogo do aluno (ou da equipe na prévia): só o que a regra de acesso deixa ver. */
export function useCatalog() {
  const { session } = useAuth();
  const uid = session?.user.id;
  return useQuery({
    queryKey: ['aulas', uid],
    enabled: !!uid,
    queryFn: async () => {
      const [c, m, l, p] = await Promise.all([
        supabase.from('courses').select('*').eq('published', true),
        supabase.from('course_modules').select('id, course_id, title, position'),
        supabase.from('lessons').select('id, course_id, module_id, title, description, video_url, duration_min, materials, published, position, created_at').eq('published', true),
        supabase.from('lesson_progress').select('lesson_id, course_id, watched_at, completed_at').eq('student_id', uid!),
      ]);
      for (const r of [c, m, l, p]) if (r.error) throw r.error;
      const courses = assemble(c.data as Course[], m.data as CourseModule[], l.data as Lesson[], p.data as Progress[]);
      const progress = new Map((p.data as Progress[]).map((x) => [x.lesson_id, x]));
      return { courses, progress };
    },
  });
}

/** Registra que a aula foi aberta (para "Continuar assistindo") e, se pedido, marca/desmarca como concluída. */
export function useLessonProgress() {
  const qc = useQueryClient();
  const { session } = useAuth();
  return useMutation({
    mutationFn: async ({ lesson, completed }: { lesson: Lesson; completed?: boolean }) => {
      const uid = session!.user.id;
      const row: Record<string, unknown> = { student_id: uid, lesson_id: lesson.id, course_id: lesson.course_id, watched_at: new Date().toISOString() };
      if (completed !== undefined) row.completed_at = completed ? new Date().toISOString() : null;
      const { error } = await supabase.from('lesson_progress').upsert(row, { onConflict: 'student_id,lesson_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aulas'] }),
  });
}

/** Endereços temporários das capas (o bucket é privado). */
export function useCovers(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter((p): p is string => !!p))].sort();
  return useQuery({
    queryKey: ['aulas-capas', list],
    enabled: list.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.storage.from('files').createSignedUrls(list, 3600);
      return Object.fromEntries((data || []).filter((x) => x.signedUrl).map((x) => [x.path!, x.signedUrl])) as Record<string, string>;
    },
  });
}

export async function materialUrl(m: Material): Promise<string | null> {
  if (m.url) return m.url;
  if (!m.path) return null;
  return (await supabase.storage.from('files').createSignedUrl(m.path, 3600, { download: m.name })).data?.signedUrl ?? null;
}

/* ------------------------------------------------------------------ */
/* Vídeo: transforma o link colado pela equipe no player certo          */
/* ------------------------------------------------------------------ */
export type VideoKind = 'youtube' | 'vimeo' | 'panda' | 'bunny' | 'drive' | 'loom' | 'file' | 'embed';
export interface VideoSource { kind: VideoKind; src: string; label: string }

const LABEL: Record<VideoKind, string> = {
  youtube: 'YouTube', vimeo: 'Vimeo', panda: 'Panda Video', bunny: 'Bunny Stream', drive: 'Google Drive', loom: 'Loom', file: 'Arquivo de vídeo', embed: 'Player externo',
};

export function videoSource(raw: string): VideoSource | null {
  const text = (raw || '').trim();
  // Aceita o código <iframe ...> inteiro, como as plataformas oferecem para "incorporar".
  const fromIframe = text.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1];
  let u: URL;
  try {
    u = new URL(fromIframe || text);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.replace(/^www\.|^m\./, '');
  const mk = (kind: VideoKind, src: string): VideoSource => ({ kind, src, label: LABEL[kind] });

  if (h === 'youtu.be' || h.endsWith('youtube.com') || h === 'youtube-nocookie.com') {
    const id = h === 'youtu.be' ? u.pathname.slice(1).split('/')[0] : u.searchParams.get('v') || u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{6,})/)?.[1];
    if (!id || !/^[\w-]{6,}$/.test(id)) return null;
    const t = parseInt(u.searchParams.get('t') || u.searchParams.get('start') || '0', 10);
    return mk('youtube', `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1${t > 0 ? `&start=${t}` : ''}`);
  }
  if (h === 'vimeo.com' || h === 'player.vimeo.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const id = parts.find((p) => /^\d+$/.test(p));
    if (!id) return null;
    const after = parts[parts.indexOf(id) + 1];
    const hash = u.searchParams.get('h') || (after && /^[0-9a-f]{6,}$/i.test(after) ? after : '');
    return mk('vimeo', `https://player.vimeo.com/video/${id}?${hash ? `h=${hash}&` : ''}title=0&byline=0&portrait=0&dnt=1`);
  }
  if (h.endsWith('pandavideo.com.br') || h.endsWith('pandavideo.com')) return mk('panda', u.toString());
  if (h === 'iframe.mediadelivery.net' || h === 'video.bunnycdn.com' || h === 'player.mediadelivery.net') {
    const m = u.pathname.match(/\/(?:embed|play)\/(\d+)\/([\w-]+)/);
    if (!m) return null;
    return mk('bunny', `https://iframe.mediadelivery.net/embed/${m[1]}/${m[2]}?autoplay=false&preload=true&responsive=true`);
  }
  if (h === 'drive.google.com') {
    const id = u.pathname.match(/\/file\/d\/([\w-]+)/)?.[1] || u.searchParams.get('id');
    return id ? mk('drive', `https://drive.google.com/file/d/${id}/preview`) : null;
  }
  if (h === 'loom.com') {
    const id = u.pathname.match(/\/(?:share|embed)\/([\w]+)/)?.[1];
    return id ? mk('loom', `https://www.loom.com/embed/${id}`) : null;
  }
  if (/\.(mp4|webm|m4v|mov)$/i.test(u.pathname)) return mk('file', u.toString());
  if (fromIframe) return mk('embed', u.toString());
  return null;
}

export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}` : `${m} min`);
export const aulasLabel = (n: number) => `${n} ${n === 1 ? 'aula' : 'aulas'}`;
