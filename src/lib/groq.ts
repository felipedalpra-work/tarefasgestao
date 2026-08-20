import Groq from "groq-sdk";

// Único lugar com o nome do modelo — llama-3.3-70b-versatile foi removido do
// catálogo da Groq em 2026-08-20 (não é rate limit, o modelo deixou de existir),
// derrubando o assistente e a extração de Meet Recaps ao mesmo tempo porque os
// dois tinham essa string duplicada em arquivos separados. openai/gpt-oss-120b
// confirmado com teste real (tool-calling + extração de JSON) antes de trocar.
export const GROQ_MODEL = "openai/gpt-oss-120b";

let groq: Groq | null = null;
export function getGroq(): Groq {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}
