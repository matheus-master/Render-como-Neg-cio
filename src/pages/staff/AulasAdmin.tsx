import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Check, ChevronDown, Eye, EyeOff, ImagePlus, Link2, ListVideo, Paperclip, Plus, Star, Trash2, Upload, X } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Note, Pill, Screen, ScreenHead, Section, Side, Workspace } from '../../components/kit';
import { ErrorState, PageSkeleton } from '../../components/ui';
import { aulasLabel, fmtMin, useCovers, videoSource, type Course, type CourseModule, type Lesson, type Material } from '../../lib/aulas';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { safeName, uploadWithProgress } from '../../lib/upload';

/* ------------------------------------------------------------------ */
/* Dados da equipe: tudo (rascunhos inclusive) + quem está assistindo   */
/* ------------------------------------------------------------------ */
interface Watch { student_id: string; lesson_id: string; course_id: string; watched_at: string; completed_at: string | null }
interface AdminData { courses: Course[]; modules: CourseModule[]; lessons: Lesson[]; watch: Watch[]; names: Record<string, string>; groups: string[] }

function useAdmin() {
  return useQuery({
    queryKey: ['aulas-admin'],
    queryFn: async (): Promise<AdminData> => {
      const [c, m, l, w, s, g] = await Promise.all([
        supabase.from('courses').select('*').order('position'),
        supabase.from('course_modules').select('id, course_id, title, position').order('position'),
        supabase.from('lessons').select('*').order('position'),
        supabase.from('lesson_progress').select('student_id, lesson_id, course_id, watched_at, completed_at'),
        supabase.from('profiles').select('id, full_name').eq('role', 'aluno'),
        supabase.from('groups').select('name').order('name'),
      ]);
      for (const r of [c, m, l, w, s, g]) if (r.error) throw r.error;
      return {
        courses: c.data as Course[], modules: m.data as CourseModule[], lessons: l.data as Lesson[], watch: w.data as Watch[],
        names: Object.fromEntries((s.data || []).map((x) => [x.id, x.full_name || 'Aluno'])), groups: (g.data || []).map((x) => x.name as string),
      };
    },
  });
}

const ACCENTS = ['#1F3A5E', '#386A94', '#2F5B56', '#3E6D68', '#8E3B2E', '#A26A12', '#5B4A8A', '#0C1B2F'];
const groupsLabel = (g: string[]) => (g.length ? g.join(' · ') : 'Todas as turmas');

function CoverThumb({ c, url }: { c: Course; url?: string }) {
  return (
    <div className={'av-cover sz-card aa-cover' + (url ? ' img' : '')} style={{ '--acc': c.accent } as CSSProperties}>
      {url ? <img src={url} alt="" /> : <svg className="av-art" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden><circle cx="262" cy="40" r="96" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="26" /><circle cx="262" cy="40" r="46" fill="rgba(255,255,255,.07)" /></svg>}
      <div className="av-cover-txt">{c.category && <span className="av-eyebrow">{c.category}</span>}<b>{c.title}</b></div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Lista de cursos                                                      */
/* ------------------------------------------------------------------ */
export function AulasAdmin() {
  const q = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const covers = useCovers((q.data?.courses ?? []).map((c) => c.cover_path)).data ?? {};
  const [busy, setBusy] = useState(false);
  if (q.isLoading) return <div className="page"><PageSkeleton /></div>;
  if (q.error || !q.data) return <div className="page"><ErrorState onRetry={() => q.refetch()} /></div>;
  const d = q.data;
  const week = new Set(d.watch.filter((w) => Date.now() - Date.parse(w.watched_at) < 7 * 86_400_000).map((w) => w.student_id));
  const published = d.courses.filter((c) => c.published);

  const create = async () => {
    setBusy(true);
    const { data, error } = await supabase.from('courses').insert({ title: 'Novo curso', position: (d.courses.at(-1)?.position ?? 0) + 1 }).select('id').single();
    if (!error && data) await supabase.from('course_modules').insert({ course_id: data.id, title: 'Módulo 1', position: 1 });
    setBusy(false);
    if (error || !data) return toast('Não deu para criar o curso.');
    await qc.refetchQueries({ queryKey: ['aulas-admin'] });
    nav(`/equipe/aulas/${data.id}`);
  };

  return (
    <Screen>
      <ScreenHead
        title="Aulas."
        accent="A plataforma da mentoria."
        sub="Monte os cursos, organize em módulos e cole o link de cada vídeo. O aluno vê tudo na aba Aulas, como numa plataforma de streaming."
        right={<button className="btn btn-gold" onClick={create} disabled={busy}><Plus size={18} aria-hidden /> Novo curso</button>}
        meta={[
          { k: 'Cursos publicados', v: `${published.length} de ${d.courses.length}` },
          { k: 'Aulas', v: d.lessons.filter((l) => l.published).length },
          { k: 'Alunos assistindo (7 dias)', v: week.size },
          { k: 'Aulas concluídas', v: d.watch.filter((w) => w.completed_at).length },
        ]}
      />
      <Workspace>
        {d.courses.length === 0 ? (
          <Section title="Nenhum curso ainda">
            <p className="aa-muted">Crie o primeiro curso. Ele nasce como rascunho: só aparece para os alunos quando você publicar.</p>
            <button className="btn btn-primary btn-md" onClick={create} disabled={busy} style={{ alignSelf: 'flex-start' }}><Plus size={18} aria-hidden /> Criar o primeiro curso</button>
          </Section>
        ) : (
          <div className="aa-grid">
            {d.courses.map((c) => {
              const ls = d.lessons.filter((l) => l.course_id === c.id);
              const ws = d.watch.filter((w) => w.course_id === c.id);
              const started = new Set(ws.map((w) => w.student_id)).size;
              const pubLessons = ls.filter((l) => l.published);
              const finished = new Set(
                [...new Set(ws.map((w) => w.student_id))].filter((sid) => pubLessons.length > 0 && pubLessons.every((l) => ws.some((w) => w.student_id === sid && w.lesson_id === l.id && w.completed_at))),
              ).size;
              return (
                <Link key={c.id} to={`/equipe/aulas/${c.id}`} className="aa-card">
                  <CoverThumb c={c} url={covers[c.cover_path ?? '']} />
                  <div className="aa-card-body">
                    <div className="aa-card-top">
                      {c.published ? <Pill tone="mint">Publicado</Pill> : <Pill tone="gray">Rascunho</Pill>}
                      {c.featured && <span className="aa-star"><Star size={14} fill="currentColor" aria-hidden /> Destaque</span>}
                    </div>
                    <b>{c.title}</b>
                    <span>{aulasLabel(ls.length)} · {groupsLabel(c.groups)}</span>
                    <span>{started ? `${started} ${started === 1 ? 'aluno começou' : 'alunos começaram'}${finished ? ` · ${finished} ${finished === 1 ? 'concluiu' : 'concluíram'}` : ''}` : 'Ninguém assistiu ainda'}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <Side>
          <Section title="Como funciona">
            <ol className="aa-steps">
              <li><b>Crie o curso</b> com capa, tema e para quais turmas ele vale.</li>
              <li><b>Monte os módulos e as aulas.</b> Em cada aula, cole o link do vídeo.</li>
              <li><b>Publique.</b> Rascunhos e aulas ocultas não aparecem para o aluno.</li>
            </ol>
            <Note tone="blue">
              Funciona com YouTube (pode ser vídeo "não listado"), Vimeo, Panda Video, Bunny Stream, Google Drive, Loom ou link direto de MP4. No YouTube, no Vimeo, na Panda e na Bunny a aula é marcada como concluída sozinha quando o vídeo termina.
            </Note>
          </Section>
        </Side>
      </Workspace>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */
/* Editor do curso                                                      */
/* ------------------------------------------------------------------ */
export function CursoAdmin() {
  const { id } = useParams();
  const q = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const c = q.data?.courses.find((x) => x.id === id);
  const covers = useCovers([c?.cover_path]).data ?? {};
  const [form, setForm] = useState<Partial<Course> | null>(null);
  const [upPct, setUpPct] = useState<number | null>(null);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['aulas-admin'] });
  const cats = useMemo(() => [...new Set((q.data?.courses ?? []).map((x) => x.category.trim()).filter(Boolean))], [q.data]);

  if (q.isLoading) return <div className="page"><PageSkeleton /></div>;
  if (q.error || !q.data) return <div className="page"><ErrorState onRetry={() => q.refetch()} /></div>;
  if (!c) return q.isFetching ? <div className="page"><PageSkeleton /></div> : <Navigate to="/equipe/aulas" replace />;
  const d = q.data;
  const f = { ...c, ...form };
  const dirty = !!form && Object.keys(form).some((k) => JSON.stringify((form as Record<string, unknown>)[k]) !== JSON.stringify((c as unknown as Record<string, unknown>)[k]));
  const set = (p: Partial<Course>) => setForm((x) => ({ ...(x ?? {}), ...p }));
  const modules = d.modules.filter((m) => m.course_id === c.id);
  // Na ordem que o aluno vê: módulo por módulo.
  const lessons = modules.flatMap((m) => d.lessons.filter((l) => l.module_id === m.id));
  const watch = d.watch.filter((w) => w.course_id === c.id);
  const pubLessons = lessons.filter((l) => l.published);

  const save = async (patch?: Partial<Course>) => {
    const body = patch ?? form ?? {};
    const { id: _i, created_at: _c, updated_at: _u, ...rest } = body as Course;
    if ('title' in rest && !String(rest.title).trim()) return toast('O curso precisa de um nome.');
    const { error } = await supabase.from('courses').update(rest).eq('id', c.id);
    if (error) return toast('Não deu para salvar.');
    if (!patch) setForm(null);
    refresh();
    toast(patch && 'published' in patch ? (patch.published ? 'Curso publicado. Os alunos já veem.' : 'Curso voltou para rascunho.') : 'Curso salvo.');
  };
  const publish = async (v: boolean) => {
    if (v && !pubLessons.length) return toast('Adicione pelo menos uma aula antes de publicar.');
    if (dirty) await save();
    await save({ published: v });
  };
  const remove = async () => {
    if (!confirm(`Apagar o curso "${c.title}" com todas as aulas e o progresso dos alunos? Não dá para desfazer.`)) return;
    const paths = [c.cover_path, ...lessons.flatMap((l) => (l.materials || []).map((m) => m.path))].filter(Boolean) as string[];
    const { error } = await supabase.from('courses').delete().eq('id', c.id);
    if (error) return toast('Não deu para apagar.');
    if (paths.length) await supabase.storage.from('files').remove(paths);
    refresh();
    toast('Curso apagado.');
    nav('/equipe/aulas');
  };
  const uploadCover = (file: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast('Use uma imagem JPG, PNG ou WEBP.');
    if (file.size > 8 * 1024 * 1024) return toast('A imagem pode ter até 8 MB.');
    const path = `aulas/${c.id}/capa_${Date.now()}_${safeName(file.name)}`;
    setUpPct(0);
    uploadWithProgress('files', path, file, setUpPct).promise
      .then(async () => {
        const old = c.cover_path;
        await supabase.from('courses').update({ cover_path: path }).eq('id', c.id);
        if (old) await supabase.storage.from('files').remove([old]);
        refresh();
        toast('Capa atualizada.');
      })
      .catch(() => toast('Não deu para enviar a imagem.'))
      .finally(() => setUpPct(null));
  };
  const removeCover = async () => {
    if (!c.cover_path) return;
    await supabase.from('courses').update({ cover_path: null }).eq('id', c.id);
    await supabase.storage.from('files').remove([c.cover_path]);
    refresh();
  };

  const addModule = async () => {
    const { error } = await supabase.from('course_modules').insert({ course_id: c.id, title: `Módulo ${modules.length + 1}`, position: (modules.at(-1)?.position ?? 0) + 1 });
    if (error) toast('Não deu para criar o módulo.');
    refresh();
  };
  const renameModule = async (m: CourseModule, title: string) => {
    if (title.trim() === m.title) return;
    await supabase.from('course_modules').update({ title: title.trim() }).eq('id', m.id);
    refresh();
  };
  const moveModule = async (i: number, dir: -1 | 1) => {
    const a = modules[i], b = modules[i + dir];
    if (!a || !b) return;
    await Promise.all([supabase.from('course_modules').update({ position: b.position }).eq('id', a.id), supabase.from('course_modules').update({ position: a.position }).eq('id', b.id)]);
    refresh();
  };
  const deleteModule = async (m: CourseModule) => {
    const n = lessons.filter((l) => l.module_id === m.id).length;
    if (n && !confirm(`Apagar "${m.title}" e as ${n} aulas dele?`)) return;
    await supabase.from('course_modules').delete().eq('id', m.id);
    refresh();
  };
  const addLesson = async (m: CourseModule) => {
    const inMod = lessons.filter((l) => l.module_id === m.id);
    const { data, error } = await supabase.from('lessons').insert({ course_id: c.id, module_id: m.id, title: `Aula ${lessons.length + 1}`, position: (inMod.at(-1)?.position ?? 0) + 1 }).select('id').single();
    if (error || !data) return toast('Não deu para criar a aula.');
    refresh();
    setOpenLesson(data.id);
  };
  const moveLesson = async (list: Lesson[], i: number, dir: -1 | 1) => {
    const a = list[i], b = list[i + dir];
    if (!a || !b) return;
    await Promise.all([supabase.from('lessons').update({ position: b.position }).eq('id', a.id), supabase.from('lessons').update({ position: a.position }).eq('id', b.id)]);
    refresh();
  };

  return (
    <Screen>
      <ScreenHead
        back="/equipe/aulas"
        title={c.title}
        sub={c.subtitle || undefined}
        status={c.published ? <Pill tone="mint">Publicado</Pill> : <Pill tone="gray">Rascunho</Pill>}
        right={
          c.published
            ? <button className="btn btn-secondary" onClick={() => publish(false)}><EyeOff size={18} aria-hidden /> Voltar para rascunho</button>
            : <button className="btn btn-gold" onClick={() => publish(true)}><Eye size={18} aria-hidden /> Publicar curso</button>
        }
        meta={[
          { k: 'Aulas publicadas', v: `${pubLessons.length} de ${lessons.length}` },
          { k: 'Duração', v: fmtMin(pubLessons.reduce((s, l) => s + (l.duration_min || 0), 0)) || '—' },
          { k: 'Turmas', v: groupsLabel(c.groups) },
          { k: 'Alunos que começaram', v: new Set(watch.map((w) => w.student_id)).size },
        ]}
      />
      <Workspace>
        <Section title="Sobre o curso">
          <div className="aa-form">
            <label className="field"><span className="label">Nome do curso</span><input className="input" value={f.title} maxLength={90} onChange={(e) => set({ title: e.target.value })} /></label>
            <label className="field"><span className="label">Frase curta (aparece embaixo do nome)</span><input className="input" value={f.subtitle} maxLength={140} placeholder="Ex.: Do primeiro contato ao contrato assinado" onChange={(e) => set({ subtitle: e.target.value })} /></label>
            <label className="field">
              <span className="label">Tema (vira a fileira na vitrine)</span>
              <input className="input" list="aa-cats" value={f.category} maxLength={40} placeholder="Ex.: Vendas, Precificação, Instagram" onChange={(e) => set({ category: e.target.value })} />
              <datalist id="aa-cats">{cats.map((x) => <option key={x} value={x} />)}</datalist>
            </label>
            <label className="field"><span className="label">Descrição</span><textarea className="textarea" rows={4} value={f.description} maxLength={1200} placeholder="O que o aluno vai aprender e para quem é este curso." onChange={(e) => set({ description: e.target.value })} /></label>
            <div className="field">
              <span className="label">Para quais turmas</span>
              <div className="aa-chips">
                <button type="button" className={'aa-chip' + (f.groups!.length === 0 ? ' on' : '')} onClick={() => set({ groups: [] })}>{f.groups!.length === 0 && <Check size={14} strokeWidth={3} aria-hidden />} Todas as turmas</button>
                {d.groups.map((g) => {
                  const on = f.groups!.includes(g);
                  return <button type="button" key={g} className={'aa-chip' + (on ? ' on' : '')} onClick={() => set({ groups: on ? f.groups!.filter((x) => x !== g) : [...f.groups!, g] })}>{on && <Check size={14} strokeWidth={3} aria-hidden />} {g}</button>;
                })}
              </div>
            </div>
            <div className="field">
              <span className="label">Cor da capa (quando não tem imagem)</span>
              <div className="avb-swatches">{ACCENTS.map((a) => <button type="button" key={a} aria-label={a} className={'avb-sw' + (f.accent === a ? ' on' : '')} style={{ background: a }} onClick={() => set({ accent: a })} />)}</div>
            </div>
            <label className="aa-check"><input type="checkbox" checked={f.featured} onChange={(e) => set({ featured: e.target.checked })} /> <span><b>Destaque na vitrine</b> · aparece grande no topo para quem ainda não começou nenhum curso</span></label>
            <div className="aa-save">
              <button className="btn btn-primary btn-md" disabled={!dirty} onClick={() => save()}><Check size={18} aria-hidden /> Salvar</button>
              {dirty && <button className="btn btn-ghost btn-md" onClick={() => setForm(null)}>Desfazer</button>}
            </div>
          </div>
        </Section>

        <Section title="Módulos e aulas" right={<button className="btn btn-soft btn-sm" onClick={addModule}><Plus size={16} aria-hidden /> Módulo</button>}>
          <div className="aa-mods">
            {modules.map((m, mi) => {
              const ml = lessons.filter((l) => l.module_id === m.id);
              return (
                <div key={m.id} className="aa-mod">
                  <div className="aa-mod-head">
                    <span className="aa-mod-n">{mi + 1}</span>
                    <input className="input aa-mod-title" defaultValue={m.title} key={m.title} aria-label="Nome do módulo" onBlur={(e) => renameModule(m, e.target.value)} />
                    <div className="aa-tools">
                      <button aria-label="Subir módulo" disabled={mi === 0} onClick={() => moveModule(mi, -1)}><ArrowUp size={16} aria-hidden /></button>
                      <button aria-label="Descer módulo" disabled={mi === modules.length - 1} onClick={() => moveModule(mi, 1)}><ArrowDown size={16} aria-hidden /></button>
                      <button aria-label="Apagar módulo" onClick={() => deleteModule(m)}><Trash2 size={16} aria-hidden /></button>
                    </div>
                  </div>
                  <div className="aa-lessons">
                    {ml.map((l, li) => (
                      <LessonEditor
                        key={l.id} l={l} n={lessons.indexOf(l) + 1} open={openLesson === l.id} onToggle={() => setOpenLesson(openLesson === l.id ? null : l.id)}
                        onUp={li > 0 ? () => moveLesson(ml, li, -1) : undefined} onDown={li < ml.length - 1 ? () => moveLesson(ml, li, 1) : undefined}
                        done={watch.filter((w) => w.lesson_id === l.id && w.completed_at).length} refresh={refresh}
                      />
                    ))}
                    <button className="aa-add" onClick={() => addLesson(m)}><Plus size={17} aria-hidden /> Adicionar aula</button>
                  </div>
                </div>
              );
            })}
            {!modules.length && <p className="aa-muted">Crie um módulo para começar a adicionar aulas.</p>}
          </div>
        </Section>

        <Side>
          <Section title="Capa">
            <CoverThumb c={f as Course} url={covers[c.cover_path ?? '']} />
            <p className="aa-muted">Imagem horizontal (16:9), de preferência 1600 × 900. Sem imagem, a capa é gerada com a cor escolhida.</p>
            <div className="aa-row">
              <label className="btn btn-soft btn-sm">
                {upPct !== null ? `Enviando ${upPct}%` : <><ImagePlus size={16} aria-hidden /> {c.cover_path ? 'Trocar imagem' : 'Enviar imagem'}</>}
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={upPct !== null} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) uploadCover(file); }} />
              </label>
              {c.cover_path && <button className="btn btn-ghost btn-sm" onClick={removeCover}>Tirar imagem</button>}
            </div>
          </Section>
          <Section title="Quem está assistindo">
            <WatchList watch={watch} names={d.names} total={pubLessons.length} lessonIds={new Set(pubLessons.map((l) => l.id))} />
          </Section>
          <button className="btn btn-ghost btn-sm aa-danger" onClick={remove}><Trash2 size={16} aria-hidden /> Apagar curso</button>
        </Side>
      </Workspace>
    </Screen>
  );
}

function WatchList({ watch, names, total, lessonIds }: { watch: Watch[]; names: Record<string, string>; total: number; lessonIds: Set<string> }) {
  const by = new Map<string, { done: number; last: string }>();
  for (const w of watch) {
    if (!names[w.student_id]) continue;
    const x = by.get(w.student_id) ?? { done: 0, last: '' };
    if (w.completed_at && lessonIds.has(w.lesson_id)) x.done++;
    if (w.watched_at > x.last) x.last = w.watched_at;
    by.set(w.student_id, x);
  }
  const rows = [...by].sort((a, b) => (b[1].last > a[1].last ? 1 : -1));
  if (!rows.length) return <p className="aa-muted">Quando os alunos começarem, o progresso de cada um aparece aqui.</p>;
  return (
    <div className="aa-watch">
      {rows.map(([sid, x]) => (
        <div key={sid} className="aa-watch-row">
          <div><b>{names[sid]}</b><span>{x.done} de {total} aulas · visto {new Date(x.last).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })}</span></div>
          <span className="av-bar dark"><i style={{ width: (total ? Math.round((x.done / total) * 100) : 0) + '%' }} /></span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Uma aula: linha resumida que abre o formulário                       */
/* ------------------------------------------------------------------ */
function LessonEditor({ l, n, open, onToggle, onUp, onDown, done, refresh }: {
  l: Lesson; n: number; open: boolean; onToggle: () => void; onUp?: () => void; onDown?: () => void; done: number; refresh: () => void;
}) {
  const toast = useToast();
  const [f, setF] = useState({ title: l.title, video_url: l.video_url, duration_min: l.duration_min?.toString() ?? '', description: l.description, published: l.published });
  const [mats, setMats] = useState<Material[]>(l.materials || []);
  const [link, setLink] = useState({ name: '', url: '' });
  const [upPct, setUpPct] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const v = videoSource(f.video_url);
  const saved = videoSource(l.video_url);

  const save = async () => {
    if (!f.title.trim()) return toast('A aula precisa de um título.');
    if (f.video_url.trim() && !v) return toast('Não reconheci o link do vídeo. Confira se é um link do YouTube, Vimeo, Panda, Bunny, Drive, Loom ou MP4.');
    const dur = f.duration_min.trim() ? Math.min(1000, Math.max(0, parseInt(f.duration_min, 10) || 0)) : null;
    setSaving(true);
    const { error } = await supabase.from('lessons').update({ title: f.title.trim(), video_url: f.video_url.trim(), duration_min: dur, description: f.description.trim(), published: f.published, materials: mats }).eq('id', l.id);
    setSaving(false);
    if (error) return toast('Não deu para salvar a aula.');
    toast('Aula salva.');
    refresh();
    onToggle();
  };
  const del = async () => {
    if (!confirm(`Apagar a aula "${l.title}"?`)) return;
    const paths = (l.materials || []).map((m) => m.path).filter(Boolean) as string[];
    const { error } = await supabase.from('lessons').delete().eq('id', l.id);
    if (error) return toast('Não deu para apagar.');
    if (paths.length) await supabase.storage.from('files').remove(paths);
    refresh();
  };
  const togglePublished = async () => {
    await supabase.from('lessons').update({ published: !l.published }).eq('id', l.id);
    setF((x) => ({ ...x, published: !l.published }));
    refresh();
  };
  const upload = (file: File) => {
    if (file.size > 50 * 1024 * 1024) return toast('O material pode ter até 50 MB.');
    const path = `aulas/${l.course_id}/materiais/${Date.now()}_${safeName(file.name)}`;
    setUpPct(0);
    uploadWithProgress('files', path, file, setUpPct).promise
      .then(() => setMats((m) => [...m, { name: file.name, path }]))
      .catch(() => toast('Não deu para enviar o arquivo.'))
      .finally(() => setUpPct(null));
  };
  const addLink = () => {
    try {
      const u = new URL(link.url.trim());
      if (u.protocol !== 'https:') throw new Error();
      setMats((m) => [...m, { name: link.name.trim() || u.hostname, url: u.toString() }]);
      setLink({ name: '', url: '' });
    } catch {
      toast('Cole um link começando com https://');
    }
  };
  const removeMat = async (i: number) => {
    const m = mats[i]!;
    setMats((x) => x.filter((_, j) => j !== i));
    // Arquivo que ainda não foi salvo na aula pode sair do armazenamento na hora.
    if (m.path && !(l.materials || []).some((x) => x.path === m.path)) await supabase.storage.from('files').remove([m.path]);
  };

  return (
    <div className={'aa-lesson' + (open ? ' open' : '') + (l.published ? '' : ' hidden')}>
      <div className="aa-lesson-row">
        <button className="aa-lesson-main" onClick={onToggle} aria-expanded={open}>
          <span className="aa-lesson-n">{n}</span>
          <span className="aa-lesson-t">
            <b>{l.title}</b>
            <span>
              {saved ? <span className="aa-ok"><Check size={12} strokeWidth={3} aria-hidden /> {saved.label}</span> : <span className="aa-warn">Sem vídeo</span>}
              {l.duration_min ? ` · ${fmtMin(l.duration_min)}` : ''}
              {l.materials?.length ? ` · ${l.materials.length} ${l.materials.length === 1 ? 'material' : 'materiais'}` : ''}
              {done ? ` · ${done} ${done === 1 ? 'concluiu' : 'concluíram'}` : ''}
              {!l.published && ' · oculta'}
            </span>
          </span>
          <ChevronDown size={18} className="aa-chev" aria-hidden />
        </button>
        <div className="aa-tools">
          <button aria-label={l.published ? 'Ocultar aula' : 'Mostrar aula'} title={l.published ? 'Ocultar dos alunos' : 'Mostrar para os alunos'} onClick={togglePublished}>{l.published ? <Eye size={16} aria-hidden /> : <EyeOff size={16} aria-hidden />}</button>
          <button aria-label="Subir aula" disabled={!onUp} onClick={onUp}><ArrowUp size={16} aria-hidden /></button>
          <button aria-label="Descer aula" disabled={!onDown} onClick={onDown}><ArrowDown size={16} aria-hidden /></button>
          <button aria-label="Apagar aula" onClick={del}><Trash2 size={16} aria-hidden /></button>
        </div>
      </div>
      {open && (
        <div className="aa-lesson-form">
          <label className="field"><span className="label">Título da aula</span><input className="input" value={f.title} maxLength={120} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="field">
            <span className="label">Link do vídeo</span>
            <input className="input" value={f.video_url} placeholder="https://youtu.be/... · https://vimeo.com/... · código de incorporar" onChange={(e) => setF({ ...f, video_url: e.target.value })} />
            {f.video_url.trim() && (v ? <span className="aa-ok"><Check size={13} strokeWidth={3} aria-hidden /> Link do {v.label} reconhecido</span> : <span className="aa-warn">Link não reconhecido</span>)}
          </label>
          {v && v.kind !== 'file' && <div className="av-video aa-preview"><iframe src={v.src} title="Prévia do vídeo" allow="fullscreen; picture-in-picture; encrypted-media" allowFullScreen /></div>}
          {v?.kind === 'file' && <div className="av-video aa-preview"><video src={v.src} controls preload="metadata" /></div>}
          <div className="aa-form-2">
            <label className="field"><span className="label">Duração (minutos)</span><input className="input" inputMode="numeric" value={f.duration_min} placeholder="Ex.: 18" onChange={(e) => setF({ ...f, duration_min: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
            <label className="aa-check"><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> <span><b>Visível para os alunos</b></span></label>
          </div>
          <label className="field"><span className="label">Sobre a aula</span><textarea className="textarea" rows={3} value={f.description} maxLength={2000} placeholder="Resumo, o que fazer depois de assistir, links citados." onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
          <div className="field">
            <span className="label">Materiais</span>
            {mats.length > 0 && (
              <div className="aa-mats">
                {mats.map((m, i) => (
                  <div key={i} className="aa-mat">
                    {m.url ? <Link2 size={16} aria-hidden /> : <Paperclip size={16} aria-hidden />}
                    <span>{m.name}</span>
                    <button aria-label={`Tirar ${m.name}`} onClick={() => removeMat(i)}><X size={16} aria-hidden /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="aa-row">
              <label className="btn btn-soft btn-sm">
                {upPct !== null ? `Enviando ${upPct}%` : <><Upload size={16} aria-hidden /> Enviar arquivo</>}
                <input type="file" hidden disabled={upPct !== null} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) upload(file); }} />
              </label>
            </div>
            <div className="aa-row aa-linkadd">
              <input className="input" value={link.name} placeholder="Nome do link" onChange={(e) => setLink({ ...link, name: e.target.value })} />
              <input className="input" value={link.url} placeholder="https://..." onChange={(e) => setLink({ ...link, url: e.target.value })} />
              <button className="btn btn-soft btn-sm" onClick={addLink} disabled={!link.url.trim()}><Plus size={16} aria-hidden /> Link</button>
            </div>
          </div>
          <div className="aa-save">
            <button className="btn btn-primary btn-md" onClick={save} disabled={saving || upPct !== null}><Check size={18} aria-hidden /> {saving ? 'Salvando…' : 'Salvar aula'}</button>
            <button className="btn btn-ghost btn-md" onClick={onToggle}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}

export const AulasIcon = ListVideo;
