import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import Groq, { RateLimitError } from "groq-sdk";
import { getGroq, GROQ_MODEL } from "@/lib/groq";
import { ASSISTANT_TOOLS, ASSISTANT_HISTORY_LIMIT, runTool } from "@/lib/assistant-tools";
import { log } from "@/lib/logger";
import { brtNow } from "@/lib/utils";

// O modelo não tem relógio: sem isso ele CHUTA que dia é hoje (chegou a responder
// "hoje é 31 de agosto" quando era 9 de setembro) e, pior, preenchia dueBefore/dueAfter
// com a data inventada — então a lista de "tarefas de hoje" vinha errada em silêncio.
// A data é sempre a de Brasília, não a do servidor (a Vercel roda em UTC e vira o dia
// às 21h daqui).
function todayBlock(): string {
  const { today } = brtNow();
  const iso = today.toISOString().slice(0, 10);
  const extenso = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric",
  }).format(today);
  const plus = (n: number) => new Date(today.getTime() + n * 86400000).toISOString().slice(0, 10);
  return `DATA DE HOJE (horário de Brasília): ${iso} — ${extenso}.
Amanhã é ${plus(1)}. Daqui a 7 dias é ${plus(7)}. Ontem foi ${plus(-1)}.
Esta é a ÚNICA data válida. Nunca deduza o dia de hoje pela sua própria noção de tempo, nem por datas que apareçam em mensagens antigas da conversa (elas são de quando foram escritas). Se a pessoa perguntar que dia é hoje, responda exatamente a data acima.
Pra filtrar tarefas por prazo relativo ("hoje", "amanhã", "essa semana", "atrasadas", "sem prazo"), use o parâmetro dueRelative da ferramenta search_tasks — ele é resolvido no servidor. Só use dueBefore/dueAfter quando a pessoa citar uma data específica.`;
}

const SYSTEM_PROMPT = `Você é o assistente interno da O2 Squad Tasks, plataforma de gestão da equipe de CFO as a Service da O2 Inc.

Responda em português, de forma direta e natural — como alguém do próprio squad que conhece a operação, não como um robô de suporte. Use as ferramentas disponíveis pra consultar dados reais antes de responder qualquer pergunta sobre tarefas, clientes, tratativas, reuniões ou sugestões da IA — nunca invente números ou nomes.

Você tem memória das conversas anteriores com essa pessoa (mensagens mais antigas no início da conversa). Use esse histórico quando for relevante — por exemplo, se a pessoa perguntar "e aquele cliente que eu perguntei antes?" ou continuar um assunto de antes — mas não fique repetindo contexto antigo à toa em respostas sobre um assunto novo.

Regras importantes:
- Saudação ou conversa fiada ("oi", "bom dia", "tudo bem?", "obrigado") NÃO é motivo pra chamar nenhuma ferramenta — só responda naturalmente, de forma breve, e pergunte no que pode ajudar. Só use uma ferramenta quando a pessoa perguntar algo que exige dado real da plataforma.
- Você só CONSULTA informação. Não cria, edita nem apaga nada — se alguém pedir pra você fazer isso, explique que precisa ser feito direto na tela correspondente (Tarefas, Kanban, Sugestões da IA, etc.).
- Se uma ferramenta não achar o que foi pedido (ex: cliente não encontrado), diga isso claramente em vez de inventar uma resposta.
- Seja conciso. Respostas de chat, não relatórios — poucas frases ou uma lista curta, direto ao ponto.
- Se a pergunta for genérica sobre a operação ("o que está pegando?", "alguma coisa urgente?"), use get_urgent_items primeiro.
- Parâmetros numéricos de ferramentas (limit, days) sempre como número, nunca como texto entre aspas.
- Datas: só afirme uma data que veio da data de hoje informada acima ou de uma ferramenta. Nunca calcule "quantos dias faltam" de cabeça a partir de uma data que você supôs.
- Responda SÓ com o que veio das ferramentas. Se a ferramenta devolveu lista vazia, diga que não há nada — não complete com exemplos, nem repita itens de respostas anteriores da conversa como se fossem o resultado de agora.
- Não invente nome de cliente, de pessoa, título de tarefa nem número. Se precisar de um dado que nenhuma ferramenta te deu, diga que não tem essa informação.`;

const MAX_TOOL_ROUNDS = 5;

function fmtHistoryDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

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
    select: { role: true, content: true, createdAt: true },
  });
  history.reverse();

  await prisma.assistantMessage.create({ data: { userId, role: "user", content: userMessage } });

  const conversation: Groq.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    // separado do prompt fixo e logo antes da pergunta: fica mais perto do fim do
    // contexto, onde o modelo presta mais atenção, e não se confunde com as datas
    // que aparecem no histórico
    { role: "system", content: todayBlock() },
    ...history.map((m) => ({
      role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
      // carimba a data de cada mensagem antiga — sem isso um "hoje é X" dito semana
      // passada volta pro contexto parecendo atual e reforça a data errada
      content: m.role === "assistant" ? m.content : `[${fmtHistoryDate(m.createdAt)}] ${m.content}`,
    })),
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
          // 0 e não 0.3: é um assistente que relata dado real — variação aqui só
          // aumenta a chance de ele "arredondar" um número ou um nome
          temperature: 0,
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
          temperature: 0,
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
