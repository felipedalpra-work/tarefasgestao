import { prisma } from "./prisma";

// Motor central de isolamento entre squads. Em vez de cada rota lembrar de
// filtrar manualmente por squadId (~47 arquivos fazem query direta — um
// esquecimento vira vazamento real), todo model de negócio passa por aqui:
// squadId é injetado automaticamente em toda leitura/escrita, então mesmo que
// uma rota esqueça o filtro, o enforcement continua valendo.
//
// Confirmado direto contra o banco antes de escrever isso: Prisma aceita
// combinar um campo não-único (squadId) junto do identificador único em
// findUnique/update/delete — squadId errado retorna null / "record not found"
// em vez de vazar ou atualizar a linha de outro squad.
//
// Modelos de fora dessa lista (Subtask, TaskActivity, TaskLink, TaskComment,
// RecapSuggestion, AutomationRun, AutomationCommand, AssistantMessage) não têm
// squadId próprio — herdam o isolamento do pai (Task, MeetRecap, Automation,
// User) via FK, contanto que o pai já tenha sido buscado escopado.
// PlatformLog fica de fora de propósito — tem squadId nullable, mas boa parte
// das escritas vem de jobs de sistema/cron sem squad nenhum.
const SCOPED_MODELS = new Set([
  "Task",
  "ClientNote",
  "ClientLogin",
  "SetupMeeting",
  "Tratativa",
  "MeetRecap",
  "ExternalSuggestion",
  "CalendarEvent",
  "FechamentoMensal",
  "Automation",
  "Notification",
  "Setting",
  "User",
]);

const WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "findUnique",
  "findUniqueOrThrow",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "delete",
  "deleteMany",
]);

function withSquad(where: Record<string, unknown> | undefined, squadId: string) {
  return { ...(where ?? {}), squadId };
}

export type SquadPrisma = ReturnType<typeof forSquad>;

export function forSquad(squadId: string) {
  return prisma.$extends({
    name: "tenant-scope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !SCOPED_MODELS.has(model)) return query(args);

          const a = args as Record<string, unknown>;

          if (WHERE_OPS.has(operation)) {
            a.where = withSquad(a.where as Record<string, unknown> | undefined, squadId);
          } else if (operation === "create") {
            a.data = { ...(a.data as Record<string, unknown>), squadId };
          } else if (operation === "createMany") {
            const data = a.data;
            a.data = Array.isArray(data) ? data.map((d) => ({ ...d, squadId })) : data;
          } else if (operation === "upsert") {
            a.where = withSquad(a.where as Record<string, unknown> | undefined, squadId);
            a.create = { ...(a.create as Record<string, unknown>), squadId };
          }

          return query(args);
        },
      },
    },
  });
}

// Helper pra uso em rotas/páginas com sessão — background jobs (cron) não têm
// sessão e devem chamar forSquad(squadId) diretamente, iterando os squads.
export async function getSquadPrisma() {
  const { auth } = await import("./auth");
  const session = await auth();
  if (!session?.user?.squadId) throw new Error("Sessão sem squad — não é possível montar o client escopado.");
  return forSquad(session.user.squadId);
}
