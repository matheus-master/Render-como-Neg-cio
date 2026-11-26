import {
  Bell, BookOpenCheck, Bot, Briefcase, CalendarDays, CalendarSync, ChevronRight, Cloud, Database, FileText, Film, Gauge, Globe,
  HardDrive, Inbox, KeyRound, LayoutDashboard, LifeBuoy, Lock, Mail, MessageCircle, MessageSquareText, MonitorPlay, MonitorSmartphone,
  PenLine, Rocket, Settings, ShieldCheck, Smile, Sparkles, Trophy, UserRound, Volume2, Wrench, type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Screen, ScreenHead, Section, Side, Tile, Workspace } from '../../components/kit';

/**
 * "A plataforma": tudo o que está incluso no Portal RCN, o que é preciso para mantê-lo e as próximas atualizações.
 * Página de apresentação da equipe (e para quem vai decidir pela plataforma).
 */
type Tone = 'blue' | 'mint' | 'amber' | 'red' | 'gray' | 'navy';
interface Feat { Icon: LucideIcon; t: string; d: string; tone?: Tone; to?: string }

const ALUNO: Feat[] = [
  { Icon: Gauge, t: 'Início com o próximo passo', d: 'Uma coisa de cada vez: o portal mostra o que fazer agora e o que vem depois, com números da quinzena e nível.', to: '/' },
  { Icon: FileText, t: 'Documentos e devolutivas', d: 'Envio de proposta, contrato, portfólio e apresentação (um ou vários de uma vez), status, devolutiva com veredito e histórico de versões.' },
  { Icon: BookOpenCheck, t: 'Relatório quinzenal', d: 'Faturamento, prospecção e conquistas no mesmo modelo que a mentoria já usava, com histórico e edição.' },
  { Icon: Trophy, t: 'Gamificação', d: '112 tarefas organizadas em níveis, com XP, metas e bônus. O aluno vê o quanto falta para subir de nível.' },
  { Icon: CalendarDays, t: 'Agenda da mentoria', d: 'Aulas ao vivo, laboratórios e Mão na Massa. O aluno confirma presença e recebe aviso de mudança ou cancelamento.' },
  { Icon: CalendarSync, t: 'Sincroniza com o celular', d: 'Um toque adiciona a agenda ao Google Agenda ou ao iPhone. Mudanças aparecem sozinhas.' },
  { Icon: MonitorPlay, t: 'Plataforma de aulas', d: 'Vitrine estilo streaming, cursos por tema, "Continuar assistindo", progresso por aula, materiais para baixar e player para YouTube, Vimeo, Panda e outros.', tone: 'amber' },
  { Icon: Briefcase, t: 'Suits: time de IA', d: 'Harvey (vendas), Mike (documentos), Donna (social media) e Louis (precificação). O Harvey já conversa com o aluno sobre negociações reais.', tone: 'navy' },
  { Icon: LifeBuoy, t: 'Botão Vermelho', d: 'Pedido de sessão de emergência e central de ajuda.', tone: 'red' },
  { Icon: MessageSquareText, t: 'Feedback da mentoria', d: 'Pesquisa de satisfação dentro do portal.' },
  { Icon: Smile, t: 'Perfil e avatar', d: 'Dados do aluno, foto ou personagem criado por ele (masculino ou feminino, cabelo, pele, roupa).' },
  { Icon: Volume2, t: 'Ouvir a tela', d: 'Leitura em voz alta das orientações, para quem prefere ouvir.' },
];

const EQUIPE: Feat[] = [
  { Icon: LayoutDashboard, t: 'Painel', d: 'Alunos ativos, relatórios atrasados, devolutivas para revisar, faturamento da turma, planos de ação parados e atividade recente.', to: '/equipe' },
  { Icon: Inbox, t: 'Fila de revisão', d: 'Tudo que os alunos enviaram, ordenado por prazo, com o botão "Próxima devolutiva".', to: '/equipe/fila' },
  { Icon: Sparkles, t: 'Devolutiva com IA', d: 'O Mike lê o material, compara com os modelos da RCN e prepara a devolutiva ponto por ponto. A equipe revisa antes de liberar.', tone: 'navy' },
  { Icon: PenLine, t: 'Devolutiva rápida', d: 'Sem IA: veredito (Aprovado, Ajustar ou Refazer), o arquivo da devolutiva e um recado.' },
  { Icon: UserRound, t: 'Ficha do aluno', d: 'Contato, turma, prazo de acesso, envios, relatórios, tarefas e Instagram (antes e depois).' },
  { Icon: CalendarDays, t: 'Agenda da equipe', d: 'Eventos para todos, por turma ou por aluno, com quem confirmou e quem ainda não respondeu.', to: '/equipe/agenda' },
  { Icon: MonitorPlay, t: 'Gestão das aulas', d: 'Cursos, módulos e aulas com capa, turmas, rascunho ou publicado, materiais e quem está assistindo.', tone: 'amber', to: '/equipe/aulas' },
  { Icon: MessageCircle, t: 'Cobrar pelo Digisac', d: 'Mensagem pronta para quem está com plano de ação parado, enviada pelo WhatsApp da RCN no Digisac.' },
  { Icon: Settings, t: 'Ajustes', d: 'Turmas, códigos de primeiro acesso, prazo de acesso, conexão do Digisac e agenda geral.', to: '/equipe/config' },
];

const BASE: Feat[] = [
  { Icon: MonitorSmartphone, t: 'Celular e computador', d: 'Pensado primeiro para o celular. No computador vira um app em painéis, de notebook a monitor 4K.' },
  { Icon: Lock, t: 'Cada um vê só o seu', d: 'As regras de acesso ficam no banco de dados: aluno não vê material de outro aluno nem curso de outra turma.' },
  { Icon: KeyRound, t: 'Acesso controlado', d: 'Login individual, código da turma no primeiro acesso e prazo de acesso por aluno.' },
  { Icon: HardDrive, t: 'Arquivos privados', d: 'Materiais, devolutivas e capas ficam em armazenamento privado, com links temporários.' },
  { Icon: Bell, t: 'Avisos automáticos', d: 'A cada 5 minutos o portal processa a fila da IA e envia os avisos por e-mail.' },
  { Icon: ShieldCheck, t: 'Chaves protegidas', d: 'Tokens da IA, do Digisac e do e-mail ficam guardados no servidor, fora do código.' },
];

const CUSTOS: { Icon: LucideIcon; t: string; what: string; plan: string; v: string }[] = [
  { Icon: Database, t: 'Supabase', what: 'Banco de dados, login e arquivos', plan: 'Plano Pro recomendado (backup diário, sem pausa, 100 GB de arquivos)', v: 'US$ 25/mês' },
  { Icon: Cloud, t: 'Cloudflare', what: 'Site e servidor do portal', plan: 'Gratuito até 100 mil acessos/dia; plano pago se crescer', v: 'US$ 0 a 5/mês' },
  { Icon: Bot, t: 'Anthropic (Claude)', what: 'Devolutivas com IA, Harvey e análise de Instagram', plan: 'Cobrado por uso; dá para definir um teto mensal', v: 'Por uso' },
  { Icon: Mail, t: 'Resend', what: 'E-mails automáticos', plan: 'Gratuito até 3 mil e-mails/mês', v: 'US$ 0' },
  { Icon: Film, t: 'Hospedagem dos vídeos', what: 'Aulas gravadas', plan: 'YouTube não listado (grátis) ou Panda / Bunny (protegido)', v: 'Grátis ou plano' },
  { Icon: MessageCircle, t: 'Digisac', what: 'WhatsApp da RCN', plan: 'Já contratado pela RCN', v: 'Já incluso' },
  { Icon: Globe, t: 'Domínio próprio', what: 'Ex.: portal.rendercomonegocio.com.br', plan: 'Registro .com.br', v: '≈ R$ 40/ano' },
];

const ROTINA = [
  'Monitorar se o portal, a IA, o e-mail e o Digisac estão funcionando',
  'Atualizar as bibliotecas e aplicar correções de segurança',
  'Conferir backups e o uso de armazenamento',
  'Acompanhar o gasto com IA e ajustar o teto mensal',
  'Renovar chaves e tokens quando vencerem (IA, Digisac, e-mail)',
  'Corrigir erros reportados pela equipe ou pelos alunos',
  'Suporte à equipe para cadastrar turmas, cursos e eventos',
];

const LANCAR: { t: string; who: string }[] = [
  { t: 'Chave da IA (Anthropic) e chave de serviço do Supabase', who: 'Ativa as devolutivas com IA' },
  { t: 'Token do Digisac, endereço e conexão em Ajustes', who: 'Ativa o "Cobrar" pelo WhatsApp' },
  { t: 'Endereço secreto da agenda do Google em Ajustes', who: 'Junta a agenda geral da mentoria' },
  { t: 'Domínio próprio da RCN', who: 'Endereço oficial do portal' },
  { t: 'Publicar os cursos reais e tirar a demonstração', who: 'Plataforma de aulas' },
  { t: 'Conteúdo do Louis e da Donna', who: 'Ativa os dois agentes que faltam' },
  { t: 'Trocar as senhas das contas de teste', who: 'Segurança' },
];

const ROADMAP: { fase: string; quando: string; itens: [string, string][] }[] = [
  {
    fase: 'Próximas', quando: 'Primeiros 30 a 60 dias', itens: [
      ['Aulas: busca e "Minha lista"', 'Achar uma aula pelo nome e guardar para depois'],
      ['Certificado de conclusão', 'Gerado quando o aluno termina um curso'],
      ['Aulas na gamificação', 'Concluir cursos vale XP e tarefas'],
      ['Louis e Donna no ar', 'Precificação e social media com IA'],
      ['Lembretes pelo WhatsApp', 'Relatório da quinzena, devolutiva pronta e aula do dia, pelo Digisac'],
    ],
  },
  {
    fase: 'Depois', quando: '2 a 4 meses', itens: [
      ['App instalável no celular', 'Ícone na tela inicial e notificações'],
      ['Relatórios para a gestão', 'Evolução de faturamento por turma, engajamento e exportação'],
      ['Comentários e dúvidas nas aulas', 'A equipe responde dentro da aula'],
      ['Trailer no destaque das aulas', 'Vídeo curto tocando no topo da vitrine'],
    ],
  },
  {
    fase: 'Mais adiante', quando: 'Conforme a mentoria crescer', itens: [
      ['Comunidade e ranking', 'Conquistas dos alunos e troca entre turmas'],
      ['Matrícula e pagamento', 'Entrada de novos alunos direto no portal'],
      ['Novos agentes de IA', 'Conforme as necessidades da mentoria'],
    ],
  },
];

function FeatGrid({ items }: { items: Feat[] }) {
  return (
    <div className="pf-grid">
      {items.map((f) => {
        const body = (
          <>
            <Tile Icon={f.Icon} tone={f.tone ?? 'blue'} />
            <div className="pf-feat-txt">
              <b>{f.t}{f.to && <ChevronRight size={16} aria-hidden />}</b>
              <span>{f.d}</span>
            </div>
          </>
        );
        return f.to ? <Link key={f.t} to={f.to} className="pf-feat link">{body}</Link> : <div key={f.t} className="pf-feat">{body}</div>;
      })}
    </div>
  );
}

export function Plataforma() {
  return (
    <Screen>
      <ScreenHead
        title="Portal RCN."
        accent="Tudo o que está incluso."
        sub="O que o aluno e a equipe têm hoje, o que é preciso para manter o portal funcionando e o que vem nas próximas atualizações."
        meta={[
          { k: 'Áreas', v: 'Aluno e equipe' },
          { k: 'Agentes de IA', v: '4 (Suits)' },
          { k: 'Tarefas na gamificação', v: '112' },
          { k: 'Integrações', v: 'IA, WhatsApp, agenda, e-mail, vídeo' },
        ]}
      />
      <Workspace>
        <Section title="Para o aluno">
          <FeatGrid items={ALUNO} />
        </Section>
        <Section title="Para a equipe">
          <FeatGrid items={EQUIPE} />
        </Section>
        <Section title="Base e segurança">
          <FeatGrid items={BASE} />
        </Section>

        <Section title="Atualizações futuras">
          <div className="pf-road">
            {ROADMAP.map((r) => (
              <div key={r.fase} className="pf-phase">
                <div className="pf-phase-head"><Rocket size={18} aria-hidden /><b>{r.fase}</b><span>{r.quando}</span></div>
                <ul>
                  {r.itens.map(([t, d]) => <li key={t}><b>{t}</b><span>{d}</span></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="pf-how">
            <b>Como as atualizações acontecem</b>
            <ol>
              <li>A equipe pede ou aprova a melhoria.</li>
              <li>Ela entra no planejamento do mês, por ordem de prioridade.</li>
              <li>É testada no celular e no computador antes de ir ao ar.</li>
              <li>Entra no portal sem tirar ninguém do ar, com histórico de cada mudança.</li>
            </ol>
          </div>
        </Section>

        <Side>
          <Section title="Para manter funcionando">
            <p className="pf-muted">Serviços que ficam no nome da RCN. Valores de referência; confira no site de cada serviço.</p>
            <div className="pf-costs">
              {CUSTOS.map((c) => (
                <div key={c.t} className="pf-cost">
                  <span className="pf-cost-ico"><c.Icon size={18} aria-hidden /></span>
                  <div><b>{c.t}</b><span>{c.what}</span><small>{c.plan}</small></div>
                  <em>{c.v}</em>
                </div>
              ))}
            </div>
          </Section>
          <Section title="Manutenção mensal">
            <ul className="pf-checks">
              {ROTINA.map((r) => <li key={r}><Wrench size={16} aria-hidden /> {r}</li>)}
            </ul>
          </Section>
          <Section title="Para lançar">
            <ul className="pf-launch">
              {LANCAR.map((l) => <li key={l.t}><span className="pf-box" aria-hidden /><div><b>{l.t}</b><span>{l.who}</span></div></li>)}
            </ul>
          </Section>
        </Side>
      </Workspace>
    </Screen>
  );
}
