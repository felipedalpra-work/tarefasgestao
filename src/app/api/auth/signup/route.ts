import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";

function slugify(name: string): string {
  return name
    .toString()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "squad";
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 1;
  while (await prisma.squad.findUnique({ where: { slug } })) {
    n++;
    slug = `${base}-${n}`;
  }
  return slug;
}

// Cadastro público de um squad novo — quem preenche esse formulário vira o admin
// (o CFO) desse squad, criado numa transação junto com o Squad em si. Não tem
// verificação de e-mail (mesmo padrão informal já usado no convite de membro).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const squadName = typeof body?.squadName === "string" ? body.squadName.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!squadName) return NextResponse.json({ error: "Nome do squad é obrigatório" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Seu nome é obrigatório" }, { status: 400 });
  if (!email) return NextResponse.json({ error: "Email é obrigatório" }, { status: 400 });
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "A senha precisa ter pelo menos 8 caracteres" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "Já existe uma conta com esse e-mail" }, { status: 409 });
  }

  const slug = await uniqueSlug(slugify(squadName));
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await prisma.$transaction(async (tx) => {
      const squad = await tx.squad.create({ data: { name: squadName, slug } });
      await tx.user.create({
        data: { squadId: squad.id, name, email, password: passwordHash, role: "admin" },
      });
    });
  } catch {
    return NextResponse.json({ error: "Já existe uma conta com esse e-mail" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
