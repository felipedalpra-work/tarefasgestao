import { normalizeText } from "./utils";

// Corrige nome próprio (cliente, pessoa do squad, termo do playbook) que o
// reconhecimento de voz do navegador costuma errar por semelhança fonética —
// "Feliphe" → "Felipe", "Alebras" → "Allebras". Roda no navegador, sem custo de IA:
// é a alternativa que sobrou depois de descartar mandar o áudio pro Whisper da Groq só
// pra isso (consumiria a mesma cota diária que já estourou várias vezes usando o
// assistente por texto).
//
// A API de reconhecimento de voz do navegador não tem parâmetro de vocabulário (isso só
// existe em serviço pago tipo Google Cloud Speech) — corrigir DEPOIS que o texto já saiu
// é o único ponto de entrada disponível.

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

// Termos do playbook que aparecem em conversa sobre a operação e que a fala costuma
// atropelar — extraídos do que o app já usa em rótulo/comentário (não inventados), fora
// as siglas de 2-3 letras (CFO, ERP, DRE, DFC...), que ficam de fora de propósito: curtas
// demais pra comparar por semelhança sem soltar falso positivo em cima de palavra comum.
const DOMAIN_GLOSSARY = [
  "Oxy",
  "Kickoff",
  "Onboarding",
  "Fechamento",
  "Comitê Estratégico Mensal",
  "Comitê de Estruturação",
  "Comitê de Diagnóstico",
  "Diagnóstico",
  "Balancete",
  "Conciliação",
  "Tesouraria",
  "Setup",
];

export function buildVoiceVocabulary(clientNames: string[], userNames: string[]): string[] {
  return [...new Set([...clientNames, ...userNames, ...DOMAIN_GLOSSARY])].filter((t) => t.trim().length >= 3);
}

// Compara janela do texto ditado contra cada termo do vocabulário e troca pela grafia
// certa quando a semelhança é alta o bastante. Só mexe em nome próprio — não tenta
// arrumar gramática, pontuação ou concordância (isso exigiria uma IA de verdade,
// exatamente o custo que essa abordagem evita).
export function correctTranscript(text: string, vocabulary: string[]): string {
  if (!text.trim() || vocabulary.length === 0) return text;

  // mantém os espaços como tokens próprios, pra reconstruir a frase sem perder o
  // espaçamento original ao limpar as palavras substituídas
  const tokens = text.split(/(\s+)/);
  const wordPositions = tokens.map((_, i) => i).filter((i) => tokens[i].trim().length > 0);

  // termo de mais palavras primeiro ("Comitê Estratégico Mensal" antes de "Comitê" —
  // se não fosse assim, um termo de 1 palavra "roubaria" o encaixe do maior antes dele
  // ser sequer tentado)
  const terms = [...vocabulary].sort((a, b) => b.split(/\s+/).length - a.split(/\s+/).length);
  const used = new Set<number>();

  for (const term of terms) {
    const span = term.split(/\s+/).length;
    const termNorm = normalizeText(term);

    for (let start = 0; start + span <= wordPositions.length; start++) {
      const idxs = wordPositions.slice(start, start + span);
      if (idxs.some((i) => used.has(i))) continue;

      const windowRaw = idxs.map((i) => tokens[i]).join(" ");
      if (windowRaw === term) continue; // já é exatamente o termo, nada a corrigir

      const windowNorm = normalizeText(windowRaw);
      if (Math.abs(windowNorm.length - termNorm.length) > 3) continue; // tamanho muito diferente, nem calcula

      // Distância de edição em número absoluto, não proporção — um limiar por
      // porcentagem (tipo "72% parecido") praticamente nunca deixa passar termo curto
      // ("oxi" pra "Oxy" já é 1 edição em 3 letras, ~67%, abaixo de qualquer limiar
      // percentual razoável mesmo sendo o erro de ditado mais óbvio que existe).
      // "Zé do Flor" ditado sem acento (dist 0 depois de normalizar) também precisa
      // corrigir a grafia — daí checar contra o termo original ANTES de normalizar,
      // não contra a versão normalizada.
      const maxEdits = termNorm.length <= 4 ? 1 : termNorm.length <= 8 ? 2 : 3;
      if (levenshtein(windowNorm, termNorm) <= maxEdits) {
        // pontuação colada na palavra ("feliphe," antes da vírgula) não pode sumir
        // junto — preserva o que vier antes/depois do trecho substituído
        const lead = tokens[idxs[0]].match(/^[^\p{L}\p{N}]+/u)?.[0] ?? "";
        const trail = tokens[idxs[idxs.length - 1]].match(/[^\p{L}\p{N}]+$/u)?.[0] ?? "";
        tokens[idxs[0]] = lead + term + trail;
        for (let k = 1; k < idxs.length; k++) tokens[idxs[k]] = "";
        idxs.forEach((i) => used.add(i));
      }
    }
  }

  return tokens.join("").replace(/ {2,}/g, " ").trim();
}
