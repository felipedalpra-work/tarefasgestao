import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { buildSquadExport } from "@/lib/squad-export";
import { log } from "@/lib/logger";

// Export completo dos dados do squad — segurança/portabilidade: garante que o squad
// nunca fica refém da plataforma pra ter acesso ao próprio dado. Só admin (mesmo nível
// de "excluir cliente"/"remover membro"), porque é a ação de maior alcance que existe
// no app: baixa TUDO de uma vez. Lógica de montagem do export em src/lib/squad-export.ts
// (compartilhada com o backup diário por e-mail, src/lib/backup-email.ts).
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isAdmin(session)) return NextResponse.json({ error: "Só admin do squad pode exportar os dados" }, { status: 403 });

  const squadId = session.user.squadId;
  const payload = await buildSquadExport(squadId);

  await log("data-export", `Export completo de dados gerado — squad ${payload.squad?.name ?? squadId}`, {
    detail: `por ${session.user.name ?? session.user.id}`,
  });

  const dateSlug = new Date().toISOString().slice(0, 10);
  const filename = `export-${payload.squad?.slug ?? squadId}-${dateSlug}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
