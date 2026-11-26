import { ArrowRight, Crown, EyeOff, Medal, Trophy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../components/Avatar';
import { BigButton, Note, Pill, Screen, ScreenHead, Side, Workspace } from '../components/kit';
import { ErrorState, PageSkeleton } from '../components/ui';
import { useAuth, useProfile } from '../lib/auth';
import { useRanking, type RankRow } from '../lib/data';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';

type Modo = 'mes' | 'geral';
export interface Ranked extends RankRow { pos: number; xp: number }

/** Posições com empate (1º, 2º, 2º, 4º) para o modo e a turma escolhidos. */
export function rankBy(rows: RankRow[], modo: Modo, grupo: string | null): Ranked[] {
  const xpOf = (r: RankRow) => (modo === 'mes' ? r.xp_mes : r.xp_total);
  const tie = (r: RankRow) => (modo === 'mes' ? r.xp_total : r.tarefas);
  const list = rows.filter((r) => !grupo || r.grupo === grupo).sort((a, b) => xpOf(b) - xpOf(a) || tie(b) - tie(a) || a.nome.localeCompare(b.nome));
  const out: Ranked[] = [];
  list.forEach((r, i) => {
    const prev = out[i - 1];
    const same = prev && xpOf(prev) === xpOf(r) && tie(list[i - 1]!) === tie(r);
    out.push({ ...r, xp: xpOf(r), pos: same ? prev.pos : i + 1 });
  });
  return out;
}

const MES = new Date().toLocaleDateString('pt-BR', { month: 'long' });

/** Quanto falta para passar quem está logo à frente. */
export function gapOf(list: Ranked[]): { me?: Ranked; ahead?: Ranked; falta: number } {
  const me = list.find((r) => r.eu);
  if (!me) return { falta: 0 };
  const ahead = [...list].reverse().find((r) => r.pos < me.pos);
  return { me, ahead, falta: ahead ? ahead.xp - me.xp + 1 : 0 };
}

function Podium({ top }: { top: Ranked[] }) {
  const order = [top[1], top[0], top[2]].filter(Boolean) as Ranked[];
  return (
    <div className="rk-podium" role="list" aria-label="Os três primeiros">
      {order.map((r) => {
        const place = r.pos === 1 ? 'first' : r.pos === 2 ? 'second' : 'third';
        return (
          <div key={r.student_id} role="listitem" className={`rk-pod ${place}${r.eu ? ' me' : ''}`}>
            {r.pos === 1 && <Crown className="rk-crown" size={26} aria-hidden />}
            <div className="rk-pod-av">
              <Avatar path={r.avatar_path} name={r.nome} className="rk-av" />
              <span className="rk-pod-pos">{r.pos}º</span>
            </div>
            <b>{r.eu ? 'Você' : r.nome}</b>
            <span className="rk-pod-xp">{r.xp} XP</span>
            <span className="rk-pod-lvl">{r.nivel_nome}</span>
            <div className="rk-step" aria-hidden><Medal size={20} /></div>
          </div>
        );
      })}
    </div>
  );
}

export function Ranking() {
  const q = useRanking();
  const profile = useProfile();
  const { reloadProfile } = useAuth();
  const toast = useToast();
  const [modo, setModo] = useState<Modo>('mes');
  const [soTurma, setSoTurma] = useState(false);
  const grupo = soTurma ? profile.group_name ?? null : null;
  const list = useMemo(() => rankBy(q.data ?? [], modo, grupo), [q.data, modo, grupo]);

  if (q.isLoading) return <Screen><PageSkeleton /></Screen>;
  if (q.error) return <Screen><ErrorState onRetry={() => q.refetch()} /></Screen>;
  const geral = rankBy(q.data ?? [], 'geral', null);
  const mes = rankBy(q.data ?? [], 'mes', null);
  const meG = geral.find((r) => r.eu), meM = mes.find((r) => r.eu);
  const { me, ahead, falta } = gapOf(list);
  const leader = list[0];
  const max = Math.max(1, leader?.xp ?? 1);
  const visivel = profile.ranking_visivel !== false;

  const toggleVisivel = async () => {
    const { error } = await supabase.from('profiles').update({ ranking_visivel: !visivel }).eq('id', profile.id);
    if (error) return toast('Não deu para salvar. Tente de novo.');
    reloadProfile();
    q.refetch();
    toast(visivel ? 'Pronto: os outros veem você como "Participante".' : 'Pronto: seu nome e sua foto voltaram ao ranking.');
  };

  return (
    <Screen>
      <ScreenHead
        back="/gamificacao"
        title="Ranking."
        accent={meM ? `Você está em ${meM.pos}º no mês.` : undefined}
        sub="Cada tarefa feita soma XP. O ranking do mês recomeça todo dia 1º, então dá para virar o jogo a qualquer momento."
        meta={[
          { k: `Posição em ${MES}`, v: meM ? `${meM.pos}º de ${mes.length}` : '—' },
          { k: 'Posição geral', v: meG ? `${meG.pos}º de ${geral.length}` : '—' },
          { k: 'Seu XP no mês', v: `${meM?.xp ?? 0} XP` },
          { k: 'Seu XP total', v: `${meG?.xp ?? 0} XP` },
        ]}
      />
      <Workspace>
        <section className="k-sec rk-board">
          <div className="rk-controls">
            <div className="rk-seg" role="tablist" aria-label="Período">
              <button role="tab" aria-selected={modo === 'mes'} className={modo === 'mes' ? 'on' : ''} onClick={() => setModo('mes')}>Este mês</button>
              <button role="tab" aria-selected={modo === 'geral'} className={modo === 'geral' ? 'on' : ''} onClick={() => setModo('geral')}>Geral</button>
            </div>
            {profile.group_name && (
              <div className="rk-seg" role="tablist" aria-label="Quem aparece">
                <button role="tab" aria-selected={!soTurma} className={!soTurma ? 'on' : ''} onClick={() => setSoTurma(false)}>Todas as turmas</button>
                <button role="tab" aria-selected={soTurma} className={soTurma ? 'on' : ''} onClick={() => setSoTurma(true)}>{profile.group_name}</button>
              </div>
            )}
          </div>

          {list.length === 0 ? (
            <Note>Ainda não há alunos no ranking.</Note>
          ) : (
            <>
              {list.length >= 3 && leader!.xp > 0 && <Podium top={list.slice(0, 3)} />}
              <ol className="rk-list">
                {(list.length >= 3 && leader!.xp > 0 ? list.slice(3) : list).map((r) => (
                  <li key={r.student_id} className={'rk-row' + (r.eu ? ' me' : '')}>
                    <span className="rk-pos">{r.pos}º</span>
                    <Avatar path={r.avatar_path} name={r.nome} className="rk-av sm" />
                    <span className="rk-name">
                      <b>{r.eu ? `${r.nome} (você)` : r.nome}</b>
                      <span>{[r.nivel_nome, r.grupo].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="rk-bar" aria-hidden><i style={{ width: `${Math.max(3, (r.xp / max) * 100)}%` }} /></span>
                    <span className="rk-xp">{r.xp} XP</span>
                  </li>
                ))}
              </ol>
              {modo === 'mes' && leader!.xp === 0 && <Note>Ninguém somou XP em {MES} ainda. A primeira tarefa feita já coloca você na frente.</Note>}
            </>
          )}
        </section>

        <Side>
          <section className="k-sec rk-me">
            <span className="k-eyebrow">{modo === 'mes' ? `Sua posição em ${MES}` : 'Sua posição geral'}{grupo ? ` · ${grupo}` : ''}</span>
            {me ? (
              <>
                <div className="rk-me-pos"><b>{me.pos}º</b><span>{me.xp} XP</span></div>
                {ahead ? (
                  <>
                    <p className="rk-me-gap">Faltam <b>{falta} XP</b> para passar {ahead.nome === 'Participante' ? 'o próximo colocado' : ahead.nome} e ficar em <b>{ahead.pos}º</b>.</p>
                    <div className="track" style={{ height: 10, borderRadius: 5 }}><i style={{ width: `${Math.min(100, (me.xp / Math.max(1, ahead.xp + 1)) * 100)}%` }} /></div>
                  </>
                ) : (
                  <p className="rk-me-gap lead"><Trophy size={18} aria-hidden /> <span>Você está na frente. Mantenha o ritmo para não perder o lugar.</span></p>
                )}
                <BigButton a={{ label: 'Fazer a próxima tarefa', to: '/gamificacao', Icon: ArrowRight }} />
              </>
            ) : (
              <p className="rk-me-gap">Você não aparece neste filtro.</p>
            )}
          </section>
          <section className="k-sec">
            <div className="k-sec-head"><h2>Como funciona</h2></div>
            <ul className="rk-how">
              <li>Cada tarefa feita na gamificação soma o XP dela.</li>
              <li>Tarefas de documento contam quando a devolutiva vem <b>Aprovado</b>.</li>
              <li>O ranking do mês zera todo dia 1º. O geral soma tudo desde o começo.</li>
              <li>Ninguém vê seu faturamento. Só nome, foto, nível e XP.</li>
            </ul>
            <button className="rk-hide" onClick={toggleVisivel}>
              <EyeOff size={16} aria-hidden />
              {visivel ? 'Esconder meu nome e foto dos outros alunos' : 'Mostrar meu nome e foto no ranking'}
            </button>
            {!visivel && <Pill tone="gray">Os outros veem você como "Participante"</Pill>}
          </section>
        </Side>
      </Workspace>
    </Screen>
  );
}

/** Cartão curto para a tela da Gamificação: sua posição no mês e os 3 primeiros. */
export function RankingCard() {
  const q = useRanking();
  if (!q.data?.length) return null;
  const list = rankBy(q.data, 'mes', null);
  const { me, ahead, falta } = gapOf(list);
  return (
    <section className="k-sec rk-card">
      <div className="k-sec-head"><h2>Ranking de {MES}</h2>{me && <span className="rk-card-pos">{me.pos}º</span>}</div>
      <ol className="rk-mini">
        {list.slice(0, 3).map((r) => (
          <li key={r.student_id} className={r.eu ? 'me' : ''}>
            <span className={`rk-medal p${r.pos}`}>{r.pos}º</span>
            <Avatar path={r.avatar_path} name={r.nome} className="rk-av xs" />
            <b>{r.eu ? 'Você' : r.nome}</b>
            <span>{r.xp} XP</span>
          </li>
        ))}
      </ol>
      {me && (ahead ? <p className="rk-card-gap">Faltam <b>{falta} XP</b> para você subir para {ahead.pos}º.</p> : <p className="rk-card-gap">Você está na frente este mês.</p>)}
      <Link to="/gamificacao/ranking" className="btn btn-soft btn-md rk-card-btn">Ver o ranking completo <ArrowRight size={17} aria-hidden /></Link>
    </section>
  );
}
