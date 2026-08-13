import { prisma } from "./prisma";

// Registro estático das rotinas conhecidas — hoje todas rodam como tarefas
// agendadas do Claude/Cowork (fora do tarefasgestao). Isso só garante que
// elas apareçam em /automacoes mesmo antes da primeira execução reportada;
// o /api/automations/report é quem mantém o status realmente atualizado.
// Pra adicionar uma nova rotina automatizada: cria a tarefa agendada no Claude
// (que reporta pra /api/automations/report com essa mesma "key") e adiciona
// uma entrada aqui.
export const KNOWN_AUTOMATIONS: {
  key: string;
  name: string;
  client: string | null;
  scheduleLabel: string;
}[] = [
  {
    key: "getconnect-oxy",
    name: "GetConnect → Oxy CFO Hub",
    client: "GetConnect",
    scheduleLabel: "Toda quarta, 14h",
  },
  {
    key: "babyland-oxy",
    name: "Babyland (QBO) → Oxy CFO Hub",
    client: "Babyland",
    scheduleLabel: "Toda segunda, 14h",
  },
  {
    key: "zedoflor-lembrete",
    name: "Lembrete: arquivos Zé do Flor / Agrodados",
    client: "Cafeeira Zé do Flor",
    scheduleLabel: "Terça e sexta, 14h",
  },
];

// Automações continuam específicas da O2 por decisão do produto (não é um recurso
// genérico pra qualquer squad configurar ainda) — sempre aponta pro squad da O2.
export async function ensureKnownAutomations() {
  const squad = await prisma.squad.findUnique({ where: { slug: "o2-inc" } });
  if (!squad) return;

  for (const def of KNOWN_AUTOMATIONS) {
    await prisma.automation.upsert({
      where: { squadId_key: { squadId: squad.id, key: def.key } },
      update: {}, // não sobrescreve nada que já existe (ex: enabled alterado no painel)
      create: {
        squadId: squad.id,
        key: def.key,
        name: def.name,
        client: def.client,
        scheduleLabel: def.scheduleLabel,
      },
    });
  }
}

export function checkAutomationsSecret(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return Boolean(process.env.AUTOMATIONS_SECRET) && auth === `Bearer ${process.env.AUTOMATIONS_SECRET}`;
}
