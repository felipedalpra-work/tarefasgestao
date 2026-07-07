import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adapter = new PrismaBetterSqlite3({ url: path.resolve(__dirname, "../dev.db") });
const prisma = new PrismaClient({ adapter });

// remove o Felipe com email errado (felipe@o2inc.com.br)
const wrongUser = await prisma.user.findUnique({ where: { email: "felipe@o2inc.com.br" } });
if (wrongUser) {
  // reassigna tarefas criadas pelo user errado para o user correto
  const correctUser = await prisma.user.findUnique({ where: { email: "felipe.dalpra@o2inc.com.br" } });
  if (correctUser) {
    const reassigned = await prisma.task.updateMany({
      where: { createdById: wrongUser.id },
      data: { createdById: correctUser.id },
    });
    console.log(`${reassigned.count} tarefa(s) reassignadas`);
    const reassignedAssignee = await prisma.task.updateMany({
      where: { assigneeId: wrongUser.id },
      data: { assigneeId: correctUser.id },
    });
    console.log(`${reassignedAssignee.count} tarefa(s) de assignee reassignadas`);

    // remove accounts do user errado
    await prisma.account.deleteMany({ where: { userId: wrongUser.id } });
    await prisma.session.deleteMany({ where: { userId: wrongUser.id } });
    await prisma.user.delete({ where: { id: wrongUser.id } });
    console.log(`✓ Usuário duplicado removido: ${wrongUser.email}`);
  }
} else {
  console.log("Nenhum usuário duplicado encontrado.");
}

const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
console.log(`\nUsuários restantes (${users.length}):`);
for (const u of users) {
  console.log(`  ${u.email} | ${u.name}`);
}

await prisma.$disconnect();
