// Regras de domínio compartilhadas entre o Worker e o front.

export type Slot = 'proposta_arquitetos' | 'proposta_construtoras' | 'contrato' | 'portfolio' | 'apresentacao';
export type SubmissionStatus = 'analise' | 'revisao' | 'pronta';
export type Verdict = 'ok' | 'aj' | 're';

export const SLOT_ORDER: Slot[] = ['proposta_arquitetos', 'proposta_construtoras', 'contrato', 'portfolio', 'apresentacao'];

export const SLOTS: Record<Slot, { title: string; desc: string; tipo: 'Proposta' | 'Contrato' | 'Portfólio' | 'Apresentação'; task: string | null }> = {
  proposta_arquitetos: { title: 'Proposta para arquitetos', desc: 'Escopo, valor por imagem, prazos e alterações para escritórios.', tipo: 'Proposta', task: null },
  proposta_construtoras: { title: 'Proposta para construtoras', desc: 'Pacote de lançamento, cronograma e condições de pagamento.', tipo: 'Proposta', task: 'Proposta para construtoras aprovada' },
  contrato: { title: 'Contrato', desc: 'Pagamento, entregas, direitos de uso das imagens e o que protege você.', tipo: 'Contrato', task: 'Contrato aprovado' },
  portfolio: { title: 'Portfólio', desc: 'Seleção de imagens, ordem e como você apresenta o studio.', tipo: 'Portfólio', task: null },
  apresentacao: { title: 'Apresentação do studio', desc: 'O PowerPoint da reunião com construtora: quem é o studio, como trabalha e por que contratar.', tipo: 'Apresentação', task: null },
};

export const isSlot = (s: string | undefined): s is Slot => !!s && s in SLOTS;

/** Devolutiva: formato de ai_draft, draft e released. */
/** Seção de cada ponto da devolutiva (skill analise-documentos-rcn), na ordem em que aparecem. */
export type PointSec = 'obrigatorio' | 'regras' | 'marca' | 'imagens' | 'portugues' | 'sugestao' | 'observacao';
export const POINT_SECS: { k: PointSec; label: string }[] = [
  { k: 'obrigatorio', label: 'Ajustes obrigatórios' },
  { k: 'regras', label: 'Regras do Studio' },
  { k: 'marca', label: 'Marca e visual' },
  { k: 'imagens', label: 'Imagens' },
  { k: 'portugues', label: 'Português' },
  { k: 'sugestao', label: 'Sugestões (opcionais)' },
  { k: 'observacao', label: 'Observações' },
];
export const isPointSec = (x: unknown): x is PointSec => POINT_SECS.some((s) => s.k === x);
/** sec e pg são opcionais: devolutivas antigas não têm. */
export interface FeedbackPoint { t: string; d: string; s: string; sec?: PointSec; pg?: string }
/** Devolutiva em arquivo (PDF/Word comentado), em files/devolutivas/{submission_id}/... */
export interface FeedbackFile { path: string; name: string }
export interface Feedback {
  verdict: Verdict;
  sum: string;
  strong: string[];
  pts: FeedbackPoint[];
  steps: string[];
  /** Só nas devolutivas escritas pela equipe em arquivo (sem rascunho da IA). */
  file?: FeedbackFile;
}
/** Texto padrão quando a equipe sobe o arquivo e não escreve recado. */
export const FILE_SUMMARY = 'A devolutiva completa está no arquivo anexo.';

/** JSON Schema da saída estruturada pedida à IA. */
export const FEEDBACK_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'sum', 'strong', 'pts', 'steps'],
  properties: {
    verdict: { type: 'string', enum: ['ok', 'aj', 're'] },
    sum: { type: 'string' },
    strong: { type: 'array', items: { type: 'string' } },
    pts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['sec', 'pg', 't', 'd', 's'],
        properties: {
          sec: { type: 'string', enum: ['obrigatorio', 'regras', 'marca', 'imagens', 'portugues', 'sugestao', 'observacao'] },
          pg: { type: 'string' },
          t: { type: 'string' },
          d: { type: 'string' },
          s: { type: 'string' },
        },
      },
    },
    steps: { type: 'array', items: { type: 'string' } },
  },
} as const;

/** Termos que a devolutiva não deve conter (regra de produto 1). O aviso não bloqueia a liberação. */
const FORBID = /(^|[^\p{L}])(rcn|modelos?|padr[aã]o|padr[oõ]es)(?=$|[^\p{L}])/giu;

export function forbiddenHits(text: string | null | undefined): string[] {
  const m = (text || '').match(FORBID);
  return m ? m.map((x) => x.replace(/^[^\p{L}]+/u, '').toLowerCase()) : [];
}

export function feedbackTexts(f: Feedback): string[] {
  return [f.sum, ...f.strong, ...f.pts.flatMap((p) => [p.t, p.d, p.s]), f.steps.join('\n')];
}

export const VERDICTS: Record<Verdict, { label: string; mark: string; bg: string; fg: string; strong: string; meaning: string }> = {
  ok: { label: 'Aprovado', mark: '✓', bg: '#E5F3EB', fg: '#0F4A2C', strong: '#1E7A4C', meaning: 'pode enviar ao cliente.' },
  aj: { label: 'Ajustar', mark: '!', bg: '#FFF3D6', fg: '#4D3200', strong: '#8A5A00', meaning: 'base boa, faltam alguns pontos.' },
  re: { label: 'Refazer', mark: '↺', bg: '#FCE9E7', fg: '#7A1A14', strong: '#B3261E', meaning: 'vale reestruturar antes de enviar.' },
};

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const MIN_TEXT_CHARS = 80;
