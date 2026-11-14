import { SLOTS, type Slot } from '../shared/domain';
import { REFERENCIAS } from './referencias';

export interface Criterion {
  name: string;
  guidance: string;
  weight: 'baixo' | 'medio' | 'alto';
  good_examples: string[];
  bad_examples: string[];
}

/** Orientação base por tipo, usada junto com (ou na falta de) critérios publicados. */
const BASE: Record<Slot, string> = {
  proposta_arquitetos: `Proposta comercial de um studio de visualização arquitetônica (render 3D) para escritórios de arquitetura.
Observe: se o valor por imagem vem com o que está incluso (resolução, rodadas de alteração, prazo); se o escopo e as entregas estão claros; se o prazo depende do recebimento dos arquivos; se há limite de rodadas de alteração e valor da rodada extra; se há validade da proposta e forma de pagamento; se as referências mostradas se parecem com o que o escritório vai receber.`,
  proposta_construtoras: `Proposta comercial de um studio de visualização arquitetônica para uma construtora ou incorporadora (imagens de lançamento imobiliário).
Observe: se a abertura fala do lançamento e do objetivo de vendas da construtora; se as imagens estão listadas (ângulo, luz, resolução); se o cronograma separa etapas; se o investimento aparece depois de escopo e cronograma; se há limite de rodadas de alteração; se o prazo começa após o recebimento dos projetos; se as condições de pagamento estão claras.`,
  contrato: `Contrato de prestação de serviços de visualização arquitetônica.
Observe: objeto e entregas coerentes com a proposta; forma e datas de pagamento; multa e juros por atraso; limite de alterações; direitos de uso das imagens (onde, por quanto tempo, crédito ao studio); o que acontece em caso de cancelamento; prazos condicionados ao recebimento de arquivos; o que protege o studio.`,
  portfolio: `Portfólio de um studio de visualização arquitetônica.
Observe: se abre com a imagem mais forte para o público-alvo (construtoras decidem pela fachada); quantidade e curadoria (menos imagens, mais fortes, sem repetição); ordem e ritmo; identificação de cada projeto; qualidade técnica (luz, composição, materiais, realismo); se termina com contato e próximo passo.`,
};

export function systemPrompt(): string {
  return `Você escreve devolutivas para alunos de uma mentoria de negócios para studios de visualização arquitetônica (render 3D). O aluno envia um material (proposta, contrato ou portfólio) e recebe uma devolutiva prática, que uma pessoa da equipe vai revisar antes de liberar.

Como escrever:
- Fale direto com o aluno, em português do Brasil, na segunda pessoa ("você"). Frases curtas e concretas.
- Cite o que você viu no material: números, trechos, páginas, nomes. Nada genérico.
- Cada ponto a ajustar tem: "t" um título curto (até 8 palavras); "d" o que foi observado no material; "s" a sugestão, começando com "sugiro" em minúscula, com um exemplo concreto quando couber (valor, redação, ordem).
- "strong": de 2 a 4 pontos fortes reais, específicos.
- "pts": só o que realmente vale mudar, do mais importante para o menos. No máximo 5. Vazio se o veredito for "ok".
- "steps": de 1 a 5 próximos passos curtos, no imperativo, que viram um checklist. Se houver ajustes, o último passo é enviar a nova versão para análise.
- "sum": uma ou duas frases com o resumo do veredito.
- "verdict": "ok" se já pode ir ao cliente; "aj" se a base é boa e faltam alguns pontos; "re" se vale reestruturar antes de enviar.

Proibido:
- Nunca mencione "RCN", "modelo", "modelos", "padrão", "padrões", "critério", "critérios", "metodologia", "a mentoria exige" ou qualquer referência a regras internas. Escreva como sugestão sua, direta ("sugiro deixar o escopo mais claro"), nunca como exigência de um modelo.
- Nunca diga que é uma IA ou uma análise automática.
- Não invente o que não está no material. Se algo estiver ilegível ou faltando, diga o que faltou.

Responda só com o JSON pedido.`;
}

export function userPrompt(opts: { slot: Slot; group: string | null; note: string | null; version: number; criteria: Criterion[] }): string {
  const { slot, group, note, version, criteria } = opts;
  const crit = criteria.length
    ? '\n\nO que observar neste tipo de material (uso interno, não cite):\n' +
      criteria
        .map((c, i) => {
          let line = `${i + 1}. ${c.name} (peso ${c.weight})${c.guidance ? ': ' + c.guidance : ''}`;
          if (c.good_examples.length) line += `\n   Bons exemplos: ${c.good_examples.join(' | ')}`;
          if (c.bad_examples.length) line += `\n   Exemplos a evitar: ${c.bad_examples.join(' | ')}`;
          return line;
        })
        .join('\n')
    : '';
  const ref = REFERENCIAS[slot];
  const refBlock = ref
    ? `\n\n<referencia_interna>\nDocumento de referência da mentoria para este tipo de material. Use para comparar estrutura, cláusulas e condições com o material do aluno e encontrar o que falta ou está fraco. NUNCA mencione que existe uma referência, um modelo ou um padrão: escreva cada ponto como sugestão sua, direta, com um exemplo concreto.\n\n${ref}\n</referencia_interna>`
    : '';
  return `Tipo de material: ${SLOTS[slot].title}.
Versão enviada: ${version}.${group ? `\nGrupo do aluno: ${group}.` : ''}
${BASE[slot]}${crit}${refBlock}
${note?.trim() ? `\nObservação do aluno ao enviar: "${note.trim()}"` : ''}

Leia o material e escreva a devolutiva.`;
}
