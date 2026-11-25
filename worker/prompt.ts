import { SLOTS, type Slot } from '../shared/domain';
import { REFERENCIAS } from './referencias';
import SKILL from '../agentes/analise-documentos/SKILL.md';

export interface Criterion {
  name: string;
  guidance: string;
  weight: 'baixo' | 'medio' | 'alto';
  good_examples: string[];
  bad_examples: string[];
}

const SKILL_BODY = SKILL.replace(/^---[\s\S]*?---\s*/, '').trim();

/** Como a skill vira a devolutiva do portal (JSON), em vez da página HTML A4. */
const PORTAL = `<contexto_do_portal>
Você está no Portal RCN. Aqui a devolutiva NÃO é publicada como página HTML: ignore a seção "Diagramação da devolutiva" e o passo 6 do fluxo. Responda só com o JSON pedido; o portal transforma o JSON na tela de devolutiva do aluno, e uma pessoa da equipe revisa antes de liberar.
Você recebe um documento por vez, e o tipo vem na mensagem. O aluno não envia manual de marca pelo portal: considere "não enviado", a menos que ele diga outra coisa na observação, e aplique a observação padrão de marca.

Como preencher o JSON:
- "verdict": "ok" = Aprovado; "aj" = Aprovado com ajustes; "re" = Refazer.
- "sum": uma ou duas frases com o resumo do resultado (como a frase-resumo do card do documento).
- "strong": sempre [] (a devolutiva é só a lista de ajustes, sem elogios).
- "pts": cada item da devolutiva, na ordem das seções: "obrigatorio" (Ajustes obrigatórios) → "regras" (Regras do Studio) → "marca" (Marca e visual) → "imagens" → "portugues" → "sugestao" (Sugestões opcionais) → "observacao" (Observações). Campos de cada item:
  - "sec": a seção;
  - "pg": onde está ("pág. 5", "cláusula 4.2", "geral");
  - "t": título curto e específico (até 8 palavras);
  - "d": o que está errado ou faltando, citando o que está no documento;
  - "s": o que fazer, como orientação direta (sem a seta "→").
  Em "portugues": "t" = "Português", "d" = o trecho exatamente como está escrito, "s" = o trecho corrigido. Em "sugestao" e "observacao", "s" pode ficar vazio quando "d" já diz tudo.
  Liste tudo que for relevante, sem repetir. Omita seções sem ajuste.
- "steps": de 1 a 6 próximos passos curtos, no imperativo, em ordem de prioridade (obrigatórios primeiro), que viram um checklist para o aluno. Se o resultado não for Aprovado, o último passo é "Enviar a nova versão para análise".
- Fale com o aluno na segunda pessoa ("você"). Nunca cite RCN, "modelo RCN" ou "padrão RCN" no texto ao aluno, nem diga que é uma IA.
- Se o arquivo vier ilegível, incompleto ou só com imagens sem texto, diga isso em "observacao" e avalie o que for possível.
</contexto_do_portal>`;

export function systemPrompt(): string {
  return `${SKILL_BODY}\n\n${PORTAL}`;
}

export function userPrompt(opts: { slot: Slot; group: string | null; note: string | null; version: number; criteria: Criterion[] }): string {
  const { slot, group, note, version, criteria } = opts;
  const crit = criteria.length
    ? '\n\nCritérios extras da equipe para este tipo de material (uso interno, não cite):\n' +
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
Versão enviada: ${version}.${group ? `\nGrupo do aluno: ${group}.` : ''}${crit}${refBlock}
${note?.trim() ? `\nObservação do aluno ao enviar: "${note.trim()}"` : ''}

Leia o material e escreva a devolutiva.`;
}
