import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, Paperclip, Video, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Avatar } from '../../components/Avatar';
import { ErrorState, Mark, PageHead } from '../../components/ui';
import { cancelEvent, EVENT_KINDS, kindInfo, openSigned, saveEvent, useStaffEvents, type EventForm, type StaffEvent } from '../../lib/agenda';
import { useStaffOverview } from '../../lib/staffData';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../lib/toast';
import { safeName } from '../../lib/upload';

const TZ = 'America/Sao_Paulo';
const part = (iso: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, ...o }).format(new Date(iso));
const dateKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(iso));
const hhmm = (iso: string) => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

const RESP: Record<string, string> = { vou: 'Vai', nao_vou: 'Não vai', pendente: 'Sem resposta' };

export function Agenda() {
  const ev = useStaffEvents();
  const o = useStaffOverview();
  const groups = useQuery({ queryKey: ['groups-names'], queryFn: async () => ((await supabase.from('groups').select('name').order('name')).data || []).map((g) => g.name as string) });
  const [tab, setTab] = useState<'prox' | 'pass'>('prox');
  const [edit, setEdit] = useState<StaffEvent | 'novo' | null>(null);
  const students = (o.data?.students || []).filter((s) => s.status !== 'encerrado');
  const now = Date.now();

  const list = (ev.data || []).filter((e) => (tab === 'prox' ? new Date(e.ends_at).getTime() >= now : new Date(e.ends_at).getTime() < now));
  if (tab === 'pass') list.reverse();
  const byDay = new Map<string, StaffEvent[]>();
  for (const e of list) (byDay.get(dateKey(e.starts_at)) || byDay.set(dateKey(e.starts_at), []).get(dateKey(e.starts_at))!).push(e);

  const audienceLabel = (e: StaffEvent) =>
    e.audience === 'todos' ? 'Todos os alunos' : e.audience === 'grupo' ? `Grupo ${e.group_name}` : e.attendees.length === 1 ? (students.find((s) => s.id === e.attendees[0]!.student_id)?.full_name ?? '1 aluno') : `${e.attendees.length} alunos`;

  return (
    <div className="page">
      <PageHead
        title="Agenda"
        sub="Aulas, laboratórios e sessões. O que você marca aqui aparece no calendário de cada aluno convidado, e ele confirma presença."
        right={<button className="btn btn-primary" onClick={() => setEdit('novo')}><CalendarPlus size={16} aria-hidden /> Novo evento</button>}
      />
      <div className="seg" style={{ gridTemplateColumns: '1fr 1fr', maxWidth: 300 }} role="tablist">
        <button role="tab" aria-selected={tab === 'prox'} className={tab === 'prox' ? 'on' : ''} onClick={() => setTab('prox')}>Próximos</button>
        <button role="tab" aria-selected={tab === 'pass'} className={tab === 'pass' ? 'on' : ''} onClick={() => setTab('pass')}>Passados</button>
      </div>

      {ev.isLoading ? (
        <div className="skel-card" style={{ height: 320 }} />
      ) : ev.isError ? (
        <ErrorState onRetry={ev.refetch} />
      ) : list.length === 0 ? (
        <div className="dashed" style={{ gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 17 }}>{tab === 'prox' ? 'Nada marcado ainda' : 'Nenhum evento passado'}</div>
          {tab === 'prox' && <button className="btn btn-primary" onClick={() => setEdit('novo')}>Marcar o primeiro evento</button>}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {[...byDay.entries()].map(([day, evs]) => (
            <div key={day} className="ag-day">
              <div className="ag-date">
                <span className="mono">{part(evs[0]!.starts_at, { weekday: 'short' }).replace('.', '')}</span>
                <b>{part(evs[0]!.starts_at, { day: 'numeric' })}</b>
                <span className="mono">{part(evs[0]!.starts_at, { month: 'short' }).replace('.', '')}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {evs.map((e) => {
                  const k = kindInfo(e.kind);
                  const c = { vou: 0, nao_vou: 0, pendente: 0 } as Record<string, number>;
                  e.attendees.forEach((a) => c[a.response]++);
                  const notices = e.attendees.filter((a) => a.notice && a.notice !== 'novo').length;
                  return (
                    <button key={e.id} className={'ag-ev' + (e.canceled ? ' canceled' : '')} onClick={() => setEdit(e)}>
                      <i className="ag-bar" style={{ background: k.color }} />
                      <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 600, fontSize: 15 }}>{e.title}</span>
                          {e.canceled && <span className="chip" style={{ background: 'var(--err-bg)', color: 'var(--err-t)' }}>Cancelado</span>}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--t3)', marginTop: 2 }}>
                          {hhmm(e.starts_at)}–{hhmm(e.ends_at)} · {k.label} · {audienceLabel(e)}
                          {e.files.length > 0 && <> · <Paperclip size={12} aria-hidden style={{ verticalAlign: -1 }} /> {e.files.length}</>}
                        </div>
                      </div>
                      {!e.canceled && (
                        <div className="ag-resp">
                          <span className="ok">{c.vou} {c.vou === 1 ? "vai" : "vão"}</span>
                          {c.nao_vou > 0 && <span className="no">{c.nao_vou} não</span>}
                          <span>{c.pendente} sem resposta</span>
                          {notices > 0 && <span className="warn">{notices} ainda não viram a mudança</span>}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <EventModal
          key={edit === 'novo' ? 'novo' : edit.id}
          original={edit === 'novo' ? undefined : edit}
          students={students}
          groups={groups.data || []}
          onClose={() => setEdit(null)}
        />
      )}
    </div>
  );
}

type Stu = ReturnType<typeof useStaffOverview>['data'] extends infer D ? (D extends { students: (infer S)[] } ? S : never) : never;

function EventModal({ original, students, groups, onClose }: { original?: StaffEvent; students: Stu[]; groups: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(Date.now() + 86_400_000));
  const [f, setF] = useState<EventForm>(() =>
    original
      ? {
          title: original.title, kind: original.kind, date: dateKey(original.starts_at), start: hhmm(original.starts_at), end: hhmm(original.ends_at),
          meet_url: original.meet_url, location: original.location, description: original.description,
          audience: original.audience, group_name: original.group_name, students: original.attendees.map((a) => a.student_id),
        }
      : { title: '', kind: 'aula', date: tomorrow, start: '20:00', end: '21:30', meet_url: '', location: '', description: '', audience: 'todos', group_name: groups[0] ?? null, students: [] },
  );
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const fileIn = useRef<HTMLInputElement>(null);
  const set = <K extends keyof EventForm>(k: K, v: EventForm[K]) => setF((x) => ({ ...x, [k]: v }));

  const studentsOf = (x: EventForm) =>
    x.audience === 'todos' ? students.map((s) => s.id) : x.audience === 'grupo' ? students.filter((s) => s.group_name === x.group_name).map((s) => s.id) : x.students;
  const count = studentsOf(f).length;
  const ok = f.title.trim() && f.date && f.start && f.end && f.end > f.start && count > 0;
  const shown = useMemo(() => students.filter((s) => s.full_name.toLowerCase().includes(search.toLowerCase())), [students, search]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['staff-events'] });

  const save = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await saveEvent(f, studentsOf, original);
      refresh();
      toast(original ? 'Evento atualizado. Quem já estava convidado recebe o aviso da mudança.' : `Evento criado para ${count} ${count === 1 ? 'aluno' : 'alunos'}.`);
      onClose();
    } catch (e) {
      toast('Não deu para salvar: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const cancel = async () => {
    if (!original || !confirm('Cancelar este evento? Os convidados recebem o aviso.')) return;
    await cancelEvent(original);
    refresh();
    toast('Evento cancelado. Os alunos foram avisados.');
    onClose();
  };
  const remove = async () => {
    if (!original || !confirm('Apagar este evento de vez? Ele some do calendário dos alunos sem aviso.')) return;
    if (original.files.length) await supabase.storage.from('files').remove(original.files.map((x) => x.file_path));
    await supabase.from('events').delete().eq('id', original.id);
    refresh();
    onClose();
  };
  const upload = async (file: File | undefined) => {
    if (!file || !original) return;
    if (file.size > 50 * 1024 * 1024) return toast('O arquivo passa de 50 MB.');
    const path = `eventos/${original.id}/${Date.now()}_${safeName(file.name)}`;
    const up = await supabase.storage.from('files').upload(path, file, { contentType: file.type || undefined });
    if (up.error) return toast('Não deu para enviar o arquivo.');
    await supabase.from('event_files').insert({ event_id: original.id, file_path: path, file_name: file.name });
    refresh();
    toast('Arquivo anexado. Os convidados já podem abrir.');
  };
  const unfile = async (id: string, path: string) => {
    await supabase.from('event_files').delete().eq('id', id);
    await supabase.storage.from('files').remove([path]);
    refresh();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal ag-modal" role="dialog" aria-modal="true" aria-label={original ? 'Editar evento' : 'Novo evento'} onClick={(e) => e.stopPropagation()}>
        <div className="between" style={{ alignItems: 'center' }}>
          <div className="h-card">{original ? 'Editar evento' : 'Novo evento'}</div>
          <button className="rv-x" aria-label="Fechar" onClick={onClose}><X size={18} aria-hidden /></button>
        </div>

        <label className="field"><span>Título</span><input className="input md" autoFocus={!original} placeholder="Ex.: Aula ao vivo · Precificação" value={f.title} onChange={(e) => set('title', e.target.value)} /></label>
        <div className="field">
          <span>Tipo</span>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
            {EVENT_KINDS.map((k) => (
              <button key={k.key} type="button" className={'ag-kind' + (f.kind === k.key ? ' on' : '')} onClick={() => set('kind', k.key)}>
                <i style={{ background: k.color }} /> {k.label}
              </button>
            ))}
          </div>
        </div>
        <div className="ag-when">
          <label className="field"><span>Dia</span><input className="input md" type="date" value={f.date} onChange={(e) => set('date', e.target.value)} /></label>
          <label className="field"><span>Início</span><input className="input md" type="time" value={f.start} onChange={(e) => set('start', e.target.value)} /></label>
          <label className="field"><span>Fim</span><input className={'input md' + (f.end <= f.start ? ' bad' : '')} type="time" value={f.end} onChange={(e) => set('end', e.target.value)} /></label>
        </div>
        <label className="field"><span>Link da chamada <small style={{ fontWeight: 400, color: 'var(--t3)' }}>(Meet, Zoom…)</small></span><input className="input md" placeholder="https://meet.google.com/…" value={f.meet_url} onChange={(e) => set('meet_url', e.target.value)} /></label>
        <label className="field"><span>Descrição <small style={{ fontWeight: 400, color: 'var(--t3)' }}>(opcional)</small></span><textarea className="textarea" style={{ minHeight: 70 }} placeholder="O que vai acontecer, o que levar…" value={f.description} onChange={(e) => set('description', e.target.value)} /></label>

        <div className="field">
          <span>Para quem</span>
          <div className="seg" style={{ gridTemplateColumns: '1fr 1fr 1fr' }} role="radiogroup">
            {([['todos', 'Todos'], ['grupo', 'Um grupo'], ['alunos', 'Alunos']] as const).map(([k, l]) => (
              <button key={k} type="button" role="radio" aria-checked={f.audience === k} className={f.audience === k ? 'on' : ''} onClick={() => set('audience', k)}>{l}</button>
            ))}
          </div>
          {f.audience === 'grupo' && (
            <select className="input md" style={{ height: 42, marginTop: 6 }} value={f.group_name || ''} onChange={(e) => set('group_name', e.target.value)}>
              {groups.map((g) => <option key={g}>{g}</option>)}
            </select>
          )}
          {f.audience === 'alunos' && (
            <div className="ag-pick">
              <input className="input md" style={{ height: 38 }} placeholder="Buscar aluno" value={search} onChange={(e) => setSearch(e.target.value)} />
              <div className="ag-pick-list">
                {shown.map((s) => {
                  const on = f.students.includes(s.id);
                  return (
                    <label key={s.id} className={'ag-stu' + (on ? ' on' : '')}>
                      <input type="checkbox" checked={on} onChange={() => set('students', on ? f.students.filter((x) => x !== s.id) : [...f.students, s.id])} />
                      <Avatar path={s.avatar_path} name={s.full_name} size={26} style={{ fontSize: 10 }} />
                      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.full_name}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--t3)' }}>{s.group_name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--t3)' }}>
            {count === 0 ? 'Escolha pelo menos um aluno.' : `${count} ${count === 1 ? 'aluno recebe' : 'alunos recebem'} o convite no portal.`}
            {f.audience !== 'alunos' && ' Quem entrar no grupo depois não é incluído automaticamente.'}
          </span>
        </div>

        {original && (
          <div className="field">
            <span>Arquivos da sessão <small style={{ fontWeight: 400, color: 'var(--t3)' }}>(plano de ação, material, gravação…)</small></span>
            {original.files.map((x) => (
              <div key={x.id} className="row" style={{ gap: 8, fontSize: 14 }}>
                <Paperclip size={14} aria-hidden />
                <button className="link" style={{ flex: 1, minWidth: 0, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={() => openSigned(x.file_path)}>{x.file_name}</button>
                <button className="rv-x" aria-label="Tirar arquivo" onClick={() => unfile(x.id, x.file_path)}><X size={14} aria-hidden /></button>
              </div>
            ))}
            <input ref={fileIn} type="file" hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
            <button type="button" className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => fileIn.current?.click()}><Mark m="+" size={13} /> Anexar arquivo</button>
          </div>
        )}

        {original && !original.canceled && original.attendees.length > 0 && (
          <div className="field">
            <span>Respostas</span>
            <div className="ag-pick-list" style={{ maxHeight: 180 }}>
              {original.attendees.map((a) => {
                const s = students.find((x) => x.id === a.student_id);
                return (
                  <div key={a.student_id} className="ag-stu">
                    <span style={{ flex: 1, minWidth: 0 }}>{s?.full_name ?? 'Aluno'}</span>
                    {a.notice && a.notice !== 'novo' && <span className="chip" style={{ background: 'var(--warn-bg)', color: 'var(--warn-t)' }}>ainda não viu a mudança</span>}
                    <span className={'chip ' + (a.response === 'vou' ? '' : '')} style={a.response === 'vou' ? { background: 'var(--ok-bg)', color: 'var(--ok-t)' } : a.response === 'nao_vou' ? { background: 'var(--err-bg)', color: 'var(--err-t)' } : {}}>{RESP[a.response]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="row" style={{ gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
          {original && !original.canceled && <button className="btn btn-secondary btn-md" style={{ color: 'var(--err-t)' }} onClick={cancel}>Cancelar evento</button>}
          {original?.canceled && <button className="btn btn-secondary btn-md" onClick={remove}>Apagar</button>}
          <button className="btn btn-primary btn-md" style={{ flex: 1 }} disabled={!ok || busy} onClick={save}>
            {busy ? 'Salvando…' : original ? 'Salvar alterações' : 'Criar e convidar'}
          </button>
        </div>
        {original && <div style={{ fontSize: 12, color: 'var(--t3)' }}>Mudou dia, horário ou link? Quem já estava convidado recebe um aviso e confirma de novo.</div>}
        {f.meet_url && !/^https?:\/\//.test(f.meet_url) && <div style={{ fontSize: 12, color: 'var(--warn-t)' }}>O link precisa começar com https://</div>}
        {!original && <div className="row" style={{ gap: 6, fontSize: 12, color: 'var(--t3)' }}><Video size={13} aria-hidden /> Depois de criar, você pode anexar arquivos da sessão.</div>}
      </div>
    </div>
  );
}

