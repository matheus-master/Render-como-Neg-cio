/**
 * "Suits": o time de agentes de IA da RCN (nomes em homenagem à série, sugestão da Taty/Mila).
 * Avatares próprios (paletó, camisa e gravata com a inicial): nada de foto de ator.
 */
export type AgentKey = 'harvey' | 'mike' | 'donna' | 'louis';

export interface Agent {
  k: AgentKey;
  name: string;
  role: string;
  desc: string;
  tag: string;
  suit: string; // cor do paletó
  tie: string; // cor da gravata
}

export const AGENTS: Agent[] = [
  { k: 'harvey', name: 'Harvey', role: 'Agente de vendas', desc: 'Estratégia comercial, negociação, prospecção, fechamento e relacionamento com clientes.', tag: 'O negociador.', suit: '#1F3A5E', tie: '#E3A440' },
  { k: 'mike', name: 'Mike', role: 'Agente de análise de documentos', desc: 'Lê seus documentos, encontra inconsistências e prepara a devolutiva para a equipe revisar.', tag: 'O analista brilhante.', suit: '#386A94', tie: '#1F3A5E' },
  { k: 'donna', name: 'Donna', role: 'Agente de social media', desc: 'Estratégia de Instagram, posicionamento, conteúdo, calendário editorial e construção de autoridade.', tag: 'A estrategista de comunicação.', suit: '#8E3B2E', tie: '#E3A440' },
  { k: 'louis', name: 'Louis', role: 'Agente de precificação', desc: 'Formação de preços, análise de custos, margem de lucro, rentabilidade e posicionamento comercial.', tag: 'O estrategista financeiro.', suit: '#2F5B56', tie: '#CBEAE0' },
];
export const agent = (k: AgentKey) => AGENTS.find((a) => a.k === k)!;

/** Avatar: paletó na cor do agente, camisa branca, gravata e a inicial. */
export function AgentAvatar({ k, size = 64 }: { k: AgentKey; size?: number }) {
  const a = agent(k);
  return (
    <svg className="agent-av" width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={a.name}>
      <rect width="64" height="64" rx="18" fill={a.suit} />
      <path d="M17 64 L32 41 L47 64 Z" fill="#fff" />
      <path d="M32 44 L29 49 L31.4 64 H32.6 L35 49 Z" fill={a.tie} />
      <path d="M17 64 L32 41 L24 64 Z M47 64 L32 41 L40 64 Z" fill="rgba(0,0,0,.18)" />
      <text x="32" y="31" textAnchor="middle" fontFamily="Inter Tight, Inter, system-ui, sans-serif" fontWeight={800} fontSize="25" fill="#fff" letterSpacing="-1">{a.name[0]}</text>
    </svg>
  );
}
