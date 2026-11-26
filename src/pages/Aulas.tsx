import { Check, ChevronLeft, ChevronRight, Clock, Download, Info, ListVideo, Paperclip, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ErrorState, PageSkeleton } from '../components/ui';
import {
  aulasLabel, fmtMin, materialUrl, useCatalog, useCovers, useLessonProgress, videoSource,
  type CourseFull, type Lesson, type Material, type Progress,
} from '../lib/aulas';
import { useToast } from '../lib/toast';

/* ------------------------------------------------------------------ */
/* Peças visuais                                                        */
/* ------------------------------------------------------------------ */

/** Miniatura automática do YouTube (os outros serviços não têm endereço público de miniatura). */
export function lessonThumb(url: string): string | null {
  const v = videoSource(url);
  if (v?.kind !== 'youtube') return null;
  const id = v.src.match(/embed\/([\w-]+)/)?.[1];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

/** Capa: a imagem enviada pela equipe ou uma arte gerada com a cor do curso. Título sempre legível por cima. */
function Cover({ c, url, size = 'card', children }: { c: CourseFull; url?: string; size?: 'card' | 'hero' | 'wide'; children?: ReactNode }) {
  return (
    <div className={`av-cover sz-${size}${url ? ' img' : ''}`} style={{ '--acc': c.accent } as CSSProperties}>
      {url ? <img src={url} alt="" loading="lazy" /> : <CoverArt />}
      {children}
    </div>
  );
}
function CoverArt() {
  return (
    <svg className="av-art" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <circle cx="262" cy="40" r="96" fill="none" stroke="rgba(255,255,255,.10)" strokeWidth="26" />
      <circle cx="262" cy="40" r="46" fill="rgba(255,255,255,.07)" />
      <path d="M0 150 C 90 110, 170 190, 320 120 L320 180 L0 180 Z" fill="rgba(0,0,0,.16)" />
    </svg>
  );
}

function Bar({ v, total, light }: { v: number; total: number; light?: boolean }) {
  const pct = total ? Math.round((v / total) * 100) : 0;
  return <span className={'av-bar' + (light ? ' light' : '')} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: pct + '%' }} /></span>;
}

/** Fileira com rolagem lateral e setas (no computador). */
function Row({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: true, r: false });
  const check = () => {
    const el = ref.current;
    if (el) setEdge({ l: el.scrollLeft < 8, r: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 });
  };
  useEffect(() => {
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const go = (d: number) => ref.current?.scrollBy({ left: d * ref.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <section className="av-row">
      <div className="av-row-head">
        <h2>{title}</h2>
        {sub && <span>{sub}</span>}
      </div>
      <div className="av-rail-wrap">
        {!edge.l && <button className="av-arrow l" aria-label="Voltar" onClick={() => go(-1)}><ChevronLeft size={28} aria-hidden /></button>}
        <div className="av-rail" ref={ref} onScroll={check}>{children}</div>
        {!edge.r && <button className="av-arrow r" aria-label="Avançar" onClick={() => go(1)}><ChevronRight size={28} aria-hidden /></button>}
      </div>
    </section>
  );
}

function CourseCard({ c, url }: { c: CourseFull; url?: string }) {
  const done = c.total > 0 && c.done === c.total;
  return (
    <Link to={`/aulas/${c.id}`} className="av-card">
      <Cover c={c} url={url}>
        <div className="av-cover-txt">
          {c.category && <span className="av-eyebrow">{c.category}</span>}
          <b>{c.title}</b>
        </div>
        {done ? <span className="av-badge done"><Check size={13} strokeWidth={3} aria-hidden /> Concluído</span> : c.isNew ? <span className="av-badge">Novo</span> : null}
        <span className="av-hover-play" aria-hidden><Play size={22} fill="currentColor" /></span>
      </Cover>
      <div className="av-card-meta">
        <span>{aulasLabel(c.total)}{c.minutes ? ` · ${fmtMin(c.minutes)}` : ''}</span>
        {c.done > 0 && !done && <span>{c.done} de {c.total}</span>}
      </div>
      {c.done > 0 && !done && <Bar v={c.done} total={c.total} />}
    </Link>
  );
}

function LessonCard({ l, c, url, progress, eyebrow }: { l: Lesson; c: CourseFull; url?: string; progress?: Progress; eyebrow?: string }) {
  const thumb = lessonThumb(l.video_url);
  const n = c.lessons.indexOf(l) + 1;
  return (
    <Link to={`/aulas/${c.id}/${l.id}`} className="av-card lesson">
      <div className={'av-cover sz-card' + (thumb || url ? ' img' : '')} style={{ '--acc': c.accent } as CSSProperties}>
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : url ? <img src={url} alt="" loading="lazy" /> : <CoverArt />}
        <span className="av-play-center" aria-hidden><Play size={22} fill="currentColor" /></span>
        {progress?.completed_at && <span className="av-badge done"><Check size={13} strokeWidth={3} aria-hidden /> Vista</span>}
        {l.duration_min ? <span className="av-dur">{fmtMin(l.duration_min)}</span> : null}
      </div>
      <div className="av-card-txt">
        <span className="av-eyebrow">{eyebrow ?? `${c.title} · Aula ${n}`}</span>
        <b>{l.title}</b>
      </div>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Vitrine                                                              */
/* ------------------------------------------------------------------ */
export function AulasHome() {
  const q = useCatalog();
  const courses = useMemo(() => (q.data?.courses ?? []).filter((c) => c.total > 0), [q.data]);
  const covers = useCovers(courses.map((c) => c.cover_path)).data ?? {};
  const nav = useNavigate();

  if (q.isLoading) return <div className="avp"><div className="av-in"><PageSkeleton /></div></div>;
  if (q.error) return <div className="avp"><div className="av-in"><ErrorState onRetry={() => q.refetch()} /></div></div>;

  const watching = courses.filter((c) => c.last && c.done < c.total).sort((a, b) => (b.last!.at > a.last!.at ? 1 : -1));
  const hero = watching[0] ?? courses.find((c) => c.featured) ?? courses[0];
  const cats = new Map<string, CourseFull[]>();
  for (const c of courses) {
    const k = c.category.trim() || 'Cursos';
    cats.set(k, [...(cats.get(k) ?? []), c]);
  }
  const fresh = courses
    .flatMap((c) => c.lessons.map((l) => ({ l, c })))
    .filter(({ l }) => Date.now() - Date.parse(l.created_at) < 21 * 86_400_000)
    .sort((a, b) => (b.l.created_at > a.l.created_at ? 1 : -1))
    .slice(0, 12);
  const done = courses.filter((c) => c.done === c.total);

  if (!hero) {
    return (
      <div className="avp">
        <div className="av-in av-empty">
          <span className="av-empty-ico"><ListVideo size={34} aria-hidden /></span>
          <h1>As aulas estão chegando.</h1>
          <p>Aqui vão ficar todos os cursos da mentoria, organizados por tema, com o seu progresso em cada um. Assim que a equipe publicar o primeiro, ele aparece aqui.</p>
        </div>
      </div>
    );
  }

  const heroNext = hero.next ?? hero.lessons[0];
  const heroStarted = hero.done > 0 || !!hero.last;
  const heroDone = hero.total > 0 && hero.done === hero.total;
  return (
    <div className="avp">
      <header className="av-hero" style={{ '--acc': hero.accent } as CSSProperties}>
        <div className="av-hero-bg">{covers[hero.cover_path ?? ''] ? <img src={covers[hero.cover_path!]} alt="" /> : <CoverArt />}</div>
        <div className="av-in av-hero-in">
          <span className="av-kicker">{heroStarted && !heroDone ? 'Continue de onde parou' : hero.featured ? 'Em destaque' : hero.category || 'Curso'}</span>
          <h1>{hero.title}</h1>
          {hero.subtitle && <p className="av-hero-sub">{hero.subtitle}</p>}
          <div className="av-hero-meta">
            <span>{aulasLabel(hero.total)}</span>
            {hero.minutes > 0 && <span><Clock size={15} aria-hidden /> {fmtMin(hero.minutes)}</span>}
            {hero.done > 0 && <span className="av-hero-prog"><Bar v={hero.done} total={hero.total} light /> {hero.done} de {hero.total}</span>}
          </div>
          {hero.description && <p className="av-hero-desc">{hero.description}</p>}
          <div className="av-hero-cta">
            <button className="av-btn primary" onClick={() => nav(`/aulas/${hero.id}/${heroNext!.id}`)}>
              {heroDone ? <RotateCcw size={20} aria-hidden /> : <Play size={20} fill="currentColor" aria-hidden />}
              {heroDone ? 'Assistir de novo' : heroStarted ? `Continuar · Aula ${hero.lessons.indexOf(heroNext!) + 1}` : 'Começar o curso'}
            </button>
            <Link className="av-btn ghost" to={`/aulas/${hero.id}`}><Info size={20} aria-hidden /> Ver as aulas</Link>
          </div>
        </div>
      </header>

      <div className="av-rows">
        {watching.length > 0 && (
          <Row title="Continuar assistindo">
            {watching.map((c) => (c.next ? <LessonCard key={c.id} l={c.next} c={c} url={covers[c.cover_path ?? '']} progress={q.data!.progress.get(c.next.id)} eyebrow={`${c.title} · Aula ${c.lessons.indexOf(c.next) + 1} de ${c.total}`} /> : null))}
          </Row>
        )}
        {[...cats].map(([cat, list]) => (
          <Row key={cat} title={cat} sub={list.length > 1 ? `${list.length} cursos` : undefined}>
            {list.map((c) => <CourseCard key={c.id} c={c} url={covers[c.cover_path ?? '']} />)}
          </Row>
        ))}
        {fresh.length > 0 && (
          <Row title="Aulas novas">
            {fresh.map(({ l, c }) => <LessonCard key={l.id} l={l} c={c} url={covers[c.cover_path ?? '']} progress={q.data!.progress.get(l.id)} />)}
          </Row>
        )}
        {done.length > 0 && (
          <Row title="Você concluiu">
            {done.map((c) => <CourseCard key={c.id} c={c} url={covers[c.cover_path ?? '']} />)}
          </Row>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Página do curso                                                      */
/* ------------------------------------------------------------------ */
export function Curso() {
  const { courseId } = useParams();
  const q = useCatalog();
  const c = q.data?.courses.find((x) => x.id === courseId);
  const covers = useCovers([c?.cover_path]).data ?? {};
  const nav = useNavigate();
  if (q.isLoading) return <div className="avp"><div className="av-in"><PageSkeleton /></div></div>;
  if (q.error) return <div className="avp"><div className="av-in"><ErrorState onRetry={() => q.refetch()} /></div></div>;
  if (!c) return <Navigate to="/aulas" replace />;
  const prog = q.data!.progress;
  const next = c.next ?? c.lessons[0];
  const doneAll = c.total > 0 && c.done === c.total;
  const started = c.done > 0 || !!c.last;
  const url = covers[c.cover_path ?? ''];

  return (
    <div className="avp">
      <header className="av-hero course" style={{ '--acc': c.accent } as CSSProperties}>
        <div className="av-hero-bg">{url ? <img src={url} alt="" /> : <CoverArt />}</div>
        <div className="av-in av-hero-in">
          <Link to="/aulas" className="av-back"><ChevronLeft size={18} aria-hidden /> Todas as aulas</Link>
          {c.category && <span className="av-kicker">{c.category}</span>}
          <h1>{c.title}</h1>
          {c.subtitle && <p className="av-hero-sub">{c.subtitle}</p>}
          <div className="av-hero-meta">
            <span>{aulasLabel(c.total)}</span>
            {c.modules.length > 1 && <span>{c.modules.length} módulos</span>}
            {c.minutes > 0 && <span><Clock size={15} aria-hidden /> {fmtMin(c.minutes)}</span>}
          </div>
          {c.description && <p className="av-hero-desc full">{c.description}</p>}
          <div className="av-course-prog">
            <Bar v={c.done} total={c.total} light />
            <span>{doneAll ? 'Curso concluído' : c.done ? `${c.done} de ${c.total} aulas concluídas` : 'Você ainda não começou'}</span>
          </div>
          {next && (
            <div className="av-hero-cta">
              <button className="av-btn primary" onClick={() => nav(`/aulas/${c.id}/${next.id}`)}>
                {doneAll ? <RotateCcw size={20} aria-hidden /> : <Play size={20} fill="currentColor" aria-hidden />}
                {doneAll ? 'Assistir de novo' : started ? `Continuar · Aula ${c.lessons.indexOf(next) + 1}` : 'Começar pela aula 1'}
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="av-in av-episodes">
        {c.modules.filter((m) => m.lessons.length).map((m, mi) => (
          <section key={m.id} className="av-module">
            <h2>{c.modules.length > 1 ? <span>Módulo {mi + 1}</span> : null}{m.title || 'Aulas'}</h2>
            <ol className="av-ep-list">
              {m.lessons.map((l) => {
                const n = c.lessons.indexOf(l) + 1;
                const p = prog.get(l.id);
                const thumb = lessonThumb(l.video_url);
                return (
                  <li key={l.id}>
                    <Link to={`/aulas/${c.id}/${l.id}`} className={'av-ep' + (p?.completed_at ? ' done' : '') + (next?.id === l.id && !doneAll ? ' next' : '')}>
                      <span className="av-ep-n">{n}</span>
                      <span className="av-ep-thumb" style={{ '--acc': c.accent } as CSSProperties}>
                        {thumb ? <img src={thumb} alt="" loading="lazy" /> : url ? <img src={url} alt="" loading="lazy" /> : <CoverArt />}
                        <span className="av-play-center" aria-hidden><Play size={18} fill="currentColor" /></span>
                      </span>
                      <span className="av-ep-body">
                        <b>{l.title}</b>
                        {l.description && <span className="av-ep-desc">{l.description}</span>}
                        <span className="av-ep-meta">
                          {l.duration_min ? <span><Clock size={13} aria-hidden /> {fmtMin(l.duration_min)}</span> : null}
                          {l.materials?.length ? <span><Paperclip size={13} aria-hidden /> {l.materials.length} {l.materials.length === 1 ? 'material' : 'materiais'}</span> : null}
                          {next?.id === l.id && !doneAll && <span className="av-ep-tag">{started ? 'Continue daqui' : 'Comece aqui'}</span>}
                        </span>
                      </span>
                      <span className="av-ep-state" aria-label={p?.completed_at ? 'Concluída' : 'Não concluída'}>
                        {p?.completed_at ? <Check size={18} strokeWidth={3} aria-hidden /> : null}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Assistir                                                             */
/* ------------------------------------------------------------------ */

/** Player: iframe do serviço ou <video>. Avisa quando o vídeo termina (YouTube, Vimeo, Panda, Bunny e arquivo). */
function Player({ url, title, onEnded }: { url: string; title: string; onEnded: () => void }) {
  const v = videoSource(url);
  const frame = useRef<HTMLIFrameElement>(null);
  const ended = useRef(onEnded);
  ended.current = onEnded;

  useEffect(() => {
    if (!v || v.kind === 'file') return;
    const origin = new URL(v.src).origin;
    const post = (msg: unknown) => frame.current?.contentWindow?.postMessage(typeof msg === 'string' ? msg : JSON.stringify(msg), origin);
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      let d: Record<string, unknown> | string = e.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch { /* texto puro */ } }
      if (typeof d !== 'object' || !d) return;
      const o = d as Record<string, unknown>;
      const info = o.info as Record<string, unknown> | number | undefined;
      if (v.kind === 'youtube' && ((o.event === 'onStateChange' && info === 0) || (o.event === 'infoDelivery' && typeof info === 'object' && info?.playerState === 0))) ended.current();
      if (v.kind === 'vimeo' && o.event === 'ready') post({ method: 'addEventListener', value: 'ended' });
      if (v.kind === 'vimeo' && o.event === 'ended') ended.current();
      if (o.message === 'panda_ended') ended.current();
      if (o.context === 'player.js' && o.event === 'ready') post({ context: 'player.js', version: '0.0.11', method: 'addEventListener', value: 'ended' });
      if (o.context === 'player.js' && o.event === 'ended') ended.current();
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [v?.src, v?.kind]);

  const onLoad = () => {
    if (v?.kind !== 'youtube') return;
    const w = frame.current?.contentWindow;
    const origin = 'https://www.youtube-nocookie.com';
    w?.postMessage(JSON.stringify({ event: 'listening', id: 'rcn', channel: 'widget' }), origin);
    w?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'], id: 'rcn', channel: 'widget' }), origin);
  };

  if (!v) {
    return (
      <div className="av-video empty">
        <ListVideo size={34} aria-hidden />
        <b>{url ? 'Não deu para abrir este vídeo aqui.' : 'O vídeo desta aula ainda não foi publicado.'}</b>
        {url && /^https:\/\//.test(url) && <a className="av-btn ghost sm" href={url} target="_blank" rel="noreferrer">Abrir o vídeo em outra aba</a>}
      </div>
    );
  }
  if (v.kind === 'file') {
    return <div className="av-video"><video src={v.src} controls playsInline preload="metadata" onEnded={() => ended.current()} /></div>;
  }
  return (
    <div className="av-video">
      <iframe ref={frame} src={v.src} title={title} onLoad={onLoad} allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope; accelerometer; clipboard-write" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
    </div>
  );
}

function MaterialLink({ m }: { m: Material }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const open = async () => {
    setBusy(true);
    const u = await materialUrl(m).catch(() => null);
    setBusy(false);
    if (u) window.open(u, '_blank', 'noopener');
    else toast('Não deu para abrir o material. Tente de novo.');
  };
  return (
    <button className="av-mat" onClick={open} disabled={busy}>
      <span className="av-mat-ico">{m.url ? <Paperclip size={18} aria-hidden /> : <Download size={18} aria-hidden />}</span>
      <span>{m.name}</span>
    </button>
  );
}

export function Aula() {
  const { courseId, lessonId } = useParams();
  const q = useCatalog();
  const mark = useLessonProgress();
  const toast = useToast();
  const nav = useNavigate();
  const c = q.data?.courses.find((x) => x.id === courseId);
  const l = c?.lessons.find((x) => x.id === lessonId);
  const p = l ? q.data!.progress.get(l.id) : undefined;
  const listRef = useRef<HTMLDivElement>(null);
  const [justEnded, setJustEnded] = useState(false);

  // Abriu a aula: vai para "Continuar assistindo".
  const seen = useRef<string>();
  useEffect(() => {
    if (!l || seen.current === l.id) return;
    seen.current = l.id;
    setJustEnded(false);
    mark.mutate({ lesson: l });
    window.scrollTo({ top: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l?.id]);
  useEffect(() => {
    // Centraliza a aula atual dentro da lista, sem mexer na rolagem da página.
    const box = listRef.current;
    const it = box?.querySelector<HTMLElement>('.av-pl-item.on');
    if (box && it && box.scrollHeight > box.clientHeight) box.scrollTop = it.offsetTop - box.clientHeight / 2 + it.clientHeight / 2;
  }, [l?.id, c?.id]);

  if (q.isLoading) return <div className="avp"><div className="av-in"><PageSkeleton /></div></div>;
  if (q.error) return <div className="avp"><div className="av-in"><ErrorState onRetry={() => q.refetch()} /></div></div>;
  if (!c || !l) return <Navigate to={c ? `/aulas/${c.id}` : '/aulas'} replace />;

  const idx = c.lessons.indexOf(l);
  const next = c.lessons[idx + 1];
  const prev = c.lessons[idx - 1];
  const mod = c.modules.find((m) => m.id === l.module_id);
  const modN = c.modules.filter((m) => m.lessons.length).indexOf(mod!) + 1;
  const done = !!p?.completed_at;

  const complete = (v: boolean) =>
    mark.mutate(
      { lesson: l, completed: v },
      { onSuccess: () => toast(v ? (next ? 'Aula concluída. Bora para a próxima?' : 'Última aula concluída. Curso finalizado!') : 'Aula marcada como não vista.'), onError: () => toast('Não deu para salvar. Tente de novo.') },
    );
  const onEnded = () => {
    setJustEnded(true);
    if (!done) complete(true);
  };

  return (
    <div className="avp av-watch">
      <div className="av-in">
        <div className="av-crumbs">
          <Link to={`/aulas/${c.id}`} className="av-back"><ChevronLeft size={18} aria-hidden /> {c.title}</Link>
        </div>
        <div className="av-theater">
          <div className="av-stage">
            <Player key={l.id} url={l.video_url} title={l.title} onEnded={onEnded} />
            <div className="av-info">
              <span className="av-kicker">{c.modules.length > 1 && mod?.title ? `Módulo ${modN} · ${mod.title} · ` : ''}Aula {idx + 1} de {c.total}</span>
              <h1>{l.title}</h1>
              <div className="av-actions">
                <button className={'av-btn ' + (done ? 'done' : 'primary')} onClick={() => complete(!done)} disabled={mark.isPending} aria-pressed={done}>
                  <Check size={20} strokeWidth={3} aria-hidden /> {done ? 'Concluída' : 'Marcar como concluída'}
                </button>
                {next ? (
                  <button className={'av-btn ' + (done || justEnded ? 'light pulse' : 'ghost')} onClick={() => nav(`/aulas/${c.id}/${next.id}`)}>
                    Próxima aula <ChevronRight size={20} aria-hidden />
                  </button>
                ) : (
                  <Link className="av-btn ghost" to="/aulas">Ver outros cursos <ChevronRight size={20} aria-hidden /></Link>
                )}
                {prev && <button className="av-btn text" onClick={() => nav(`/aulas/${c.id}/${prev.id}`)}><ChevronLeft size={18} aria-hidden /> Anterior</button>}
              </div>
              {l.duration_min ? <div className="av-hero-meta"><span><Clock size={15} aria-hidden /> {fmtMin(l.duration_min)}</span></div> : null}
              {l.description && <p className="av-desc">{l.description}</p>}
              {l.materials?.length > 0 && (
                <div className="av-mats">
                  <h2>Materiais da aula</h2>
                  <div className="av-mat-list">{l.materials.map((m, i) => <MaterialLink key={i} m={m} />)}</div>
                </div>
              )}
            </div>
          </div>

          <aside className="av-playlist" aria-label="Aulas do curso">
            <div className="av-pl-head">
              <b>{c.title}</b>
              <span>{c.done} de {c.total} concluídas</span>
              <Bar v={c.done} total={c.total} light />
            </div>
            <div className="av-pl-scroll" ref={listRef}>
              {c.modules.filter((m) => m.lessons.length).map((m, mi) => (
                <div key={m.id} className="av-pl-mod">
                  {c.modules.length > 1 && <div className="av-pl-modt">Módulo {mi + 1}{m.title ? ` · ${m.title}` : ''}</div>}
                  {m.lessons.map((x) => {
                    const xp = q.data!.progress.get(x.id);
                    return (
                      <Link key={x.id} to={`/aulas/${c.id}/${x.id}`} className={'av-pl-item' + (x.id === l.id ? ' on' : '') + (xp?.completed_at ? ' done' : '')} aria-current={x.id === l.id ? 'true' : undefined}>
                        <span className="av-pl-n">{x.id === l.id ? <Play size={13} fill="currentColor" aria-hidden /> : xp?.completed_at ? <Check size={14} strokeWidth={3} aria-hidden /> : c.lessons.indexOf(x) + 1}</span>
                        <span className="av-pl-t">{x.title}</span>
                        {x.duration_min ? <span className="av-pl-d">{fmtMin(x.duration_min)}</span> : null}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
