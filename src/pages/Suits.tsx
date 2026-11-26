import { ArrowRight, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AGENTS, AgentAvatar, type Agent } from '../components/Agents';
import { Pill, Screen, ScreenHead } from '../components/kit';
import { useFeatures } from '../lib/data';

/** Suits: o time de agentes de IA. Cada um aparece como está hoje (ativo, nas devolutivas ou em breve). */
export default function Suits() {
  const f = useFeatures().data;
  const status = (a: Agent): { tone: 'mint' | 'blue' | 'gray'; label: string; note?: string; to?: string; cta?: string } => {
    if (a.k === 'harvey') return f?.harvey ? { tone: 'mint', label: 'No time', to: '/harvey', cta: 'Conversar com o Harvey' } : { tone: 'blue', label: 'Chegando', to: '/harvey', cta: 'Conhecer o Harvey', note: 'A equipe está finalizando a ativação.' };
    if (a.k === 'mike') return f?.ai ? { tone: 'mint', label: 'Nas suas devolutivas', to: '/documentos', cta: 'Ver meus documentos', note: 'Ele lê o que você envia e prepara a devolutiva; a equipe revisa antes de liberar.' } : { tone: 'gray', label: 'Em breve', note: 'Vai ler seus documentos e preparar a devolutiva para a equipe revisar.' };
    if (a.k === 'donna') return { tone: 'gray', label: 'Em breve', note: 'Por enquanto ajuda a equipe na análise do seu Instagram.' };
    return { tone: 'gray', label: 'Em breve', note: 'Vai te ajudar a montar o preço de cada projeto.' };
  };
  const [lead, ...rest] = AGENTS;

  const card = (a: Agent, big = false) => {
    const st = status(a);
    return (
      <article key={a.k} className={'agent-card' + (big ? ' big' : '') + (st.tone === 'gray' ? ' soon' : '')}>
        <AgentAvatar k={a.k} size={big ? 96 : 72} />
        <div className="agent-body">
          <div className="agent-top">
            <span className="agent-name">{a.name}</span>
            <Pill tone={st.tone}>{st.label}</Pill>
          </div>
          <b className="agent-role">{a.role}</b>
          <p className="agent-desc">{a.desc}</p>
          <p className="agent-tag">{a.tag}</p>
          {st.note && <p className="agent-note">{st.note}</p>}
          {st.to && (
            <Link to={st.to} className={'btn ' + (big ? 'btn-primary btn-md' : 'btn-soft btn-sm')} style={{ alignSelf: 'flex-start' }}>
              {a.k === 'mike' ? <FileText size={16} aria-hidden /> : null}
              {st.cta}
              <ArrowRight size={16} aria-hidden />
            </Link>
          )}
        </div>
      </article>
    );
  };

  return (
    <Screen>
      <ScreenHead title="Suits." accent="Seu time de IA." sub="Cada agente cuida de uma parte do seu negócio. Converse com quem já está no time; os outros chegam em breve." />
      <div className="agents">
        {card(lead!, true)}
        <div className="agent-grid">{rest.map((a) => card(a))}</div>
      </div>
    </Screen>
  );
}
