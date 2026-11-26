import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { lastTaskChange, useGami, useSetTaskStatus } from '../lib/data';
import { useToast } from '../lib/toast';
import { Mark } from './ui';

const read = (k: string) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
};
const write = (k: string, n: number) => {
  try {
    localStorage.setItem(k, String(n));
  } catch {
    /* sem armazenamento: o aviso só não lembra o último nível visto */
  }
};

/**
 * Aviso de "subiu de nível". Compara o nível atual com o último que o aluno viu neste aparelho;
 * vale tanto para a tarefa marcada pelo aluno quanto para a devolutiva aprovada ou a marcação da equipe.
 */
export function LevelUp({ uid, g }: { uid: string; g: ReturnType<typeof useGami> }) {
  const [up, setUp] = useState<{ from: number; to: number } | null>(null);
  const nav = useNavigate();
  const setStatus = useSetTaskStatus();
  const toast = useToast();
  const key = `rcn-nivel-visto-${uid}`;
  const cur = g.current?.n;
  const ready = !g.isLoading && !g.isError && g.tasks.length > 0 && cur !== undefined;

  useEffect(() => {
    if (!ready) return;
    const seen = read(key);
    if (seen !== null && cur > seen) setUp({ from: seen, to: cur });
    if (seen !== cur) write(key, cur); // também desce, se o aluno desmarcar uma tarefa e voltar de nível
  }, [ready, cur, key]);

  useEffect(() => {
    if (!up) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setUp(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [up]);

  if (!up) return null;
  const done = g.levels.find((l) => l.n === up.to - 1);
  const now = g.levels.find((l) => l.n === up.to);
  if (!done || !now) return null;
  const xpDone = g.byLevel(done.n).filter(g.isDone).reduce((a, t) => a + t.xp, 0);
  const nextMain = g.byLevel(now.n).filter((t) => !t.bonus).length;
  // "Desfazer" só para a marcação que acabou de fechar o nível (feita pelo aluno, há pouco).
  const last = lastTaskChange && Date.now() - lastTaskChange.at < 10 * 60_000 ? lastTaskChange : null;
  const lastTask = last ? g.tasks.find((t) => t.id === last.taskId && t.level < up.to && !t.bonus && !t.auto_slot) : undefined;

  const close = () => setUp(null);
  const undo = () => {
    if (!last || !lastTask) return;
    setStatus.mutate({ taskId: lastTask.id, status: last.prev }, { onError: (e) => toast((e as Error).message) });
    toast(`Desfeito: "${lastTask.title}" voltou para ${last.prev === 'andamento' ? 'Fazendo' : 'A fazer'}.`);
    close();
    nav('/gamificacao');
  };

  return (
    <div className="modal-backdrop" onClick={close}>
      <div className="modal lvlup" role="dialog" aria-modal="true" aria-labelledby="lvlup-t" onClick={(e) => e.stopPropagation()}>
        <div className="lvlup-badge">{now.n}</div>
        <div className="label" style={{ color: 'var(--gold)' }}>Você subiu de nível</div>
        <div id="lvlup-t" style={{ fontWeight: 600, fontSize: 28, letterSpacing: '-.03em', lineHeight: 1.15, marginTop: 6 }}>
          Parabéns! Agora você é {now.name}.
        </div>
        <div className="steps">
          <s>{done.name}</s>
          <Mark m="→" size={14} />
          <b>{now.name}</b>
        </div>
        <div style={{ fontSize: 15, lineHeight: 1.5, color: '#D5D9DF', marginTop: 8 }}>
          Você concluiu todas as tarefas principais do {done.name}
          {xpDone ? ` e somou ${xpDone} XP` : ''}.
          {now.tagline ? ` Próxima etapa: ${now.tagline.charAt(0).toLowerCase() + now.tagline.slice(1)}` : ''}
          {now.tagline && !/[.!?]$/.test(now.tagline) ? '.' : ''}
        </div>
        {(nextMain > 0 || now.goal) && (
          <div className="mono" style={{ fontSize: 12, color: 'var(--steel-t)', marginTop: 10 }}>
            {[nextMain ? `${nextMain} tarefas principais` : null, now.goal ? `meta ${now.goal}` : null].filter(Boolean).join(' · ')}
          </div>
        )}
        <button
          className="btn btn-gold btn-lg"
          style={{ width: '100%', marginTop: 20 }}
          onClick={() => {
            close();
            nav('/gamificacao');
          }}
          autoFocus
        >
          Ver o nível {now.name}
        </button>
        {lastTask ? (
          <button className="lvlup-undo" onClick={undo}>
            Marquei sem querer — desfazer “{lastTask.title}”
          </button>
        ) : (
          <button
            className="lvlup-undo"
            onClick={() => {
              close();
              nav(`/gamificacao?nivel=${done.n}&corrigir=1`);
            }}
          >
            Marquei alguma tarefa sem querer
          </button>
        )}
      </div>
    </div>
  );
}
