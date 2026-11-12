import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getFormularioInicialCardsPipefy, formularioInicialForClient } from "@/lib/pipefy";

type Params = { params: Promise<{ name: string }> };

// Contexto inicial do cliente (empresa, CNPJ, ERP, contato, produtos, anotações da
// qualificação) vindo do pipe "1.1 Funil de Vendas - CFOaaS" — só leitura. null (200) quando
// não casa com nenhum card ganho conhecido; nunca falha a página do cliente por causa disso.
export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await params;
  const client = decodeURIComponent(name);

  try {
    const cards = await getFormularioInicialCardsPipefy();
    return NextResponse.json(formularioInicialForClient(cards, client));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro ao buscar no Pipefy" }, { status: 500 });
  }
}
