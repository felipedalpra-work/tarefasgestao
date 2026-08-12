import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import Groq from "groq-sdk";
import { ASSISTANT_TOOLS, runTool } from "@/lib/assistant-tools";
import { log } from "@/lib/logger";

let groq: Groq | null = null;
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

const SYSTEM_PROMPT = `Você é o assistente interno da O2 Squad Tasks, plataforma de gestão da equipe de CFO as a Service da O2 Inc.

Responda em português, de forma direta e natural — como alguém do próprio squad que conhece a operação, não como um robô de suporte. Use as ferramentas disponíveis pra consultar dados reais antes de responder qualquer pergunta sobre tarefas, clientes, tratativas, reuniões ou sugestões da IA — nunca invente números ou nomes.

Regras importantes:
- Você só CONSULTA informação. Não cria, edita nem apaga nada — se alguém pedir pra você fazer isso, explique que precisa ser feito direto na tela correspondente (Tarefas, Kanban, Sugestões da IA, etc.).
- Se uma ferramenta não achar o que foi pedido (ex: cliente não encontrado), diga isso claramente em vez de inventar uma resposta.
- Seja conciso. Respostas de chat, não relatórios — poucas frases ou uma lista curta, direto ao ponto.
- Se a pergunta for genérica ("o que está pegando?", "alguma coisa urgente?"), use get_urgent_items primeiro.`;

const MAX_TOOL_ROUNDS = 5;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  }

  const conversation: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const completion = await getGroq().chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: conversation,
        tools: ASSISTANT_TOOLS,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 1024,
      });

      const message = completion.choices[0]?.message;
      if (!message) break;

      if (!message.tool_calls || message.tool_calls.length === 0) {
        return NextResponse.json({ reply: message.content || "Não consegui gerar uma resposta." });
      }

      conversation.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });

      for (const call of message.tool_calls) {
        let result: unknown;
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          result = await runTool(call.function.name, args);
        } catch (err) {
          result = { error: String(err) };
        }
        conversation.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    return NextResponse.json({ reply: "Essa pergunta ficou complexa demais pra eu resolver agora — tenta ser mais específico?" });
  } catch (err) {
    await log("ai-assistant", "Erro no assistente de IA", { level: "error", detail: String(err) });
    return NextResponse.json({ error: "Erro ao consultar o assistente." }, { status: 500 });
  }
}
