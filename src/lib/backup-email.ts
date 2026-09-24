import { prisma } from "@/lib/prisma";
import { buildSquadExport } from "@/lib/squad-export";
import { buildExportWorkbookBuffer } from "@/lib/export-to-excel";
import { sendDailyBackupEmail } from "@/lib/email";
import { log } from "@/lib/logger";

// Backup diário por e-mail — nasceu do episódio de set/2026 (banco bloqueado
// por quota, backup mais recente com 10 dias). Cada squad recebe só os
// próprios dados (mesmo isolamento do /api/export manual), mandado pros
// admins daquele squad — não centraliza tudo numa pessoa só nem vaza entre
// squads. Roda 1x/dia via GitHub Actions (ver .github/workflows/cron.yml,
// job "backup-email" -> /api/cron/backup-email).
export async function sendDailyBackups() {
  const squads = await prisma.squad.findMany({ select: { id: true, name: true } });
  const dateStr = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

  for (const squad of squads) {
    try {
      const admins = await prisma.user.findMany({ where: { squadId: squad.id, role: "admin" }, select: { email: true } });
      const to = admins.map((a) => a.email).filter(Boolean);
      if (to.length === 0) continue; // squad sem admin (não deveria acontecer, mas não trava o loop dos outros)

      const payload = await buildSquadExport(squad.id);
      const buffer = await buildExportWorkbookBuffer(payload);

      await sendDailyBackupEmail({
        to,
        squadName: squad.name,
        dateStr,
        summary: [
          { label: "Tarefas", value: payload.tasks.length },
          { label: "Clientes", value: payload.clientNotes.length },
          { label: "Reuniões", value: payload.calendarEvents.length },
          { label: "Meet Recaps", value: payload.meetRecaps.length },
        ],
        attachment: buffer,
        filename: `backup-${squad.name.replace(/[^a-zA-Z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.xlsx`,
      });
    } catch (err) {
      // um squad falhando não pode travar o backup dos outros
      await log("cron", `Erro no backup diário do squad ${squad.name}`, { level: "error", detail: String(err) });
    }
  }
}
