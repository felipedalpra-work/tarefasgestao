import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Groq, { RateLimitError } from "groq-sdk";
import { getGroq, GROQ_MODEL } from "@/lib/groq";
import { ASSISTANT_TOOLS, ASSISTANT_HISTORY_LIMIT, runTool } from "@/lib/assistant-tools";
import { log } from "@/lib/logger";

const SYSTEM_PROMPT = `Você é o assistente interno da O2 Squad Tasks, plataforma de gestão da equipe de CFO as a Service da O2 Inc.

Responda em português, de forma direta e natural — como alguém do próprio squad que conhece a operação, não como um robô de suporte. Use as ferramentas disponíveis pra consultar dados reais antes de responder qualquer pergunta sobre tarefas, clientes, tratativas, reuniões ou sugestões da IA — nunca invente números ou nomes.

Você tem memória das conversas anteriores com essa pessoa (mensagens mais antigas no início da conversa). Use esse histórico quando for relevante — por exemplo, se a pessoa perguntar "e aquele cliente que eu perguntei antes?" ou continuar um assunto de antes — mas não fique repetindo contexto antigo à toa em respostas sobre um assunto novo.

Regras importantes:
- Saudação ou conversa fiada ("oi", "bom dia", "tudo bem?", "obrigado") NÃO é motivo pra chamar nenhuma ferramenta — só responda naturalmente, de forma breve, e pergunte no que pode ajudar. Só use uma ferramenta quando a pessoa perguntar algo que exige dado real da plataforma.
- Você só CONSULTA informação. Não cria, edita nem apaga nada — se alguém pedir pra você fazer isso, explique que precisa ser feito direto na tela correspondente (Tarefas, Kanban, Sugestões da IA, etc.).
- Se uma ferramenta não achar o que foi pedido (ex: cliente não encontrado), diga isso claramente em vez de inventar uma resposta.
- Seja conciso. Respostas de chat, não relatórios — poucas frases ou uma lista curta, direto ao ponto.
- Se a pergunta for genérica sobre a operação ("o que está pegando?", "alguma coisa urgente?"), use get_urgent_items primeiro.
- Parâmetros numéricos de ferramentas (limit, days) sempre como número, nunca como texto entre aspas.`;

const MAX_TOOL_ROUNDS = 5;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = session.user.id;

  const body = await req.json().catch(() => null);
  const userMessage = typeof body?.message === "string" ? body.message.trim() : "";
  if (!userMessage) {
    return NextResponse.json({ error: "Mensagem inválida." }, { status: 400 });
  }

  // memória: carrega as últimas trocas dessa pessoa (não de todo o squad) antes de
  // responder, pra continuar a conversa em vez de começar do zero a cada request
  const history = await prisma.assistantMessage.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: ASSISTANT_HISTORY_LIMIT,
    select: { role: true, content: true },
  });
  history.reverse();

  await prisma.assistantMessage.create({ data: { userId, role: "user", content: userMessage } });

  const conversation: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map((m) => ({ role: m.role === "assistant" ? ("assistant" as const) : ("user" as const), content: m.content })),
    { role: "user", content: userMessage },
  ];

  async function finish(reply: string) {
    await prisma.assistantMessage.create({ data: { userId, role: "assistant", content: reply } });
    return NextResponse.json({ reply });
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let completion;
      try {
        completion = await getGroq().chat.completions.create({
          model: GROQ_MODEL,
          messages: conversation,
          tools: ASSISTANT_TOOLS,
          tool_choice: "auto",
          temperature: 0.3,
          max_tokens: 1024,
        });
      } catch (err) {
        // limite diário de tokens do Groq estourado (cota compartilhada com a extração de
        // Meet Recaps) — tentar de novo só bateria no mesmo limite, então nem tenta
        if (err instanceof RateLimitError) {
          await log("ai-assistant", "Limite diário de tokens do Groq atingido", { level: "error", detail: String(err) });
          return await finish("Bati no limite diário de uso da IA (cota compartilhada com a extração dos Meet Recaps) — tenta de novo daqui a pouco.");
        }
        // o Groq às vezes gera uma chamada de ferramenta com argumento de tipo errado e
        // rejeita a resposta inteira (400) antes de chegar aqui — em vez de quebrar a
        // conversa toda, tenta mais uma vez sem ferramentas, só pra dar alguma resposta
        await log("ai-assistant", "Groq rejeitou a chamada de ferramenta, tentando sem ferramentas", { level: "error", detail: String(err) });
        const fallback = await getGroq().chat.completions.create({
          model: GROQ_MODEL,
          messages: conversation,
          temperature: 0.3,
          max_tokens: 1024,
        });
        return await finish(fallback.choices[0]?.message?.content || "Não consegui gerar uma resposta.");
      }

      const message = completion.choices[0]?.message;
      if (!message) break;

      if (!message.tool_calls || message.tool_calls.length === 0) {
        return await finish(message.content || "Não consegui gerar uma resposta.");
      }

      conversation.push({ role: "assistant", content: message.content, tool_calls: message.tool_calls });

      for (const call of message.tool_calls) {
        let result: unknown;
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          result = await runTool(session.user.squadId, call.function.name, args);
        } catch (err) {
          result = { error: String(err) };
        }
        conversation.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
      }
    }

    return await finish("Essa pergunta ficou complexa demais pra eu resolver agora — tenta ser mais específico?");
  } catch (err) {
    if (err instanceof RateLimitError) {
      await log("ai-assistant", "Limite diário de tokens do Groq atingido", { level: "error", detail: String(err) });
      return await finish("Bati no limite diário de uso da IA (cota compartilhada com a extração dos Meet Recaps) — tenta de novo daqui a pouco.");
    }
    await log("ai-assistant", "Erro no assistente de IA", { level: "error", detail: String(err) });
    return NextResponse.json({ error: "Erro ao consultar o assistente." }, { status: 500 });
  }
}
