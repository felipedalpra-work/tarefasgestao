import { GoogleGenerativeAI } from "@google/generative-ai";

// Mesmo espírito do src/lib/groq.ts: nome do modelo num lugar só, fácil de
// trocar — já aprendemos com o incidente de 2026-08-20 (Groq removeu
// llama-3.3-70b-versatile do catálogo e derrubou tudo de uma vez porque o
// nome estava duplicado em dois arquivos).
export const GEMINI_MODEL = "gemini-2.0-flash";

function buildModel(apiKey: string) {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    generationConfig: { responseMimeType: "application/json", temperature: 0.1, maxOutputTokens: 2048 },
  });
}

// Chamada única, sem tool-calling — usado hoje só pela extração de Meet Recap
// (src/lib/process-recap.ts). O Assistente de IA (que usa tool-calling) não
// passa por aqui; ver plano de ter um lib separado quando isso for suportado.
export async function generateJsonWithGemini(apiKey: string, prompt: string): Promise<string> {
  const model = buildModel(apiKey);
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// Validação da chave no momento em que o usuário conecta (Configurações →
// Perfil) — prefere falhar na hora, com mensagem clara, a só descobrir que a
// chave está errada horas depois quando um Meet Recap não processar.
export async function testGeminiKey(apiKey: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const model = buildModel(apiKey);
    await model.generateContent("ping");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
