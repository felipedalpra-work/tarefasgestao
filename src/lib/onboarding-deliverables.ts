import { forSquad } from "./tenant-prisma";

const DELIVERABLES = [
  { key: "mes4", months: 4, title: "Planejamento orçamentário" },
  { key: "mes6", months: 6, title: "Fechamento contábil" },
  { key: "mes12", months: 12, title: "Replanejamento geral" },
] as const;

// Garante as 3 entregas recorrentes do ano 1 (mês 4/6/12), a partir da data de início do onboarding.
// Idempotente: se a task já existe, só ajusta o prazo; nunca duplica.
export async function ensureOnboardingDeliverables(squadId: string, client: string, onboardingStartAt: Date, createdById: string) {
  const db = forSquad(squadId);
  for (const d of DELIVERABLES) {
    const dueDate = new Date(onboardingStartAt);
    dueDate.setMonth(dueDate.getMonth() + d.months);
    const sourceRef = `onboarding_${d.key}`;

    const existing = await db.task.findFirst({ where: { client, source: "onboarding_deliverable", sourceRef } });
    if (existing) {
      if (existing.dueDate?.getTime() !== dueDate.getTime()) {
        await db.task.update({ where: { id: existing.id }, data: { dueDate } });
      }
    } else {
      await db.task.create({
        data: {
          squadId,
          title: d.title,
          client,
          dueDate,
          priority: "high",
          source: "onboarding_deliverable",
          sourceRef,
          createdById,
        },
      });
    }
  }
}
