# Changelog

Registro manual de mudanças relevantes neste projeto (não é um repositório git, então este arquivo é a fonte de histórico).

Formato de cada entrada: `## AAAA-MM-DD` seguido de bullets curtos descrevendo o que mudou e por quê (quando não for óbvio).

## 2026-07-08

**Tabela de clientes (status + situação na Oxy):**
- `ClientNote` ganhou campos novos: `status` (ativo/pausado/encerrado), `oxyStage` (não iniciado/em implantação/ativo/com pendência), `importType` (manual/automática), `lastDataUpdate`, `oxyPendencies` (texto livre). Preenchimento é manual pela equipe — não há integração com a API da Oxy.
- Página `/clientes` trocou os cards por uma tabela (`ClientsTable.tsx`): nome, status, implantação na Oxy, tipo de importação, última atualização, tarefas abertas (reaproveita `Task.client`) e pendências específicas da Oxy. Células de status/data/pendência são editáveis inline, salvando via `PATCH /api/clients/[name]`.
- Nova query cacheada `getClientsTable` (tag `clients`) junta `getClientsOverview` com os dados do `ClientNote` por cliente.

**Fix deploy Vercel:**
- `next.config.ts` tinha `turbopack.root` com caminho absoluto do Windows hardcoded (`C:\Users\Felipe Dalpra\tarefasgestao`), workaround local para o Turbopack confundir a raiz do workspace. Na Vercel isso virava um caminho inválido (`/vercel/path0/C:\...`) e o build falhava. Trocado para `path.join(__dirname)`, que resolve certo em qualquer máquina/SO.

## 2026-07-07

Grande rodada de funcionalidades novas, melhorias visuais e responsividade.

**Fundação:**
- Design tokens no `globals.css` (`@theme`): `o2-green`, `bg`, `panel`, `surface`, `surface-2/3`, `border`, `ink` (escala `ink-soft/mid/dim/faint/ghost`), etc. Todas as cores hardcoded (`[#1a1a1a]`, `[#6BF169]`…) dos componentes/páginas foram migradas para os tokens via varredura. Animações utilitárias `animate-slide-in-right/up` e `animate-fade-in`.
- Sistema de toasts (`src/components/Toaster.tsx`, montado no layout do app) substituindo todos os `alert()` — dispara via `toast(msg, tipo)` por CustomEvent, sem context.
- `src/lib/base-url.ts` (`getBaseUrl()`, env `APP_URL`) substituindo `http://localhost:3000` hardcoded em slack.ts, weekly-digest.ts e meeting-briefing.ts.
- **`revalidateTag` agora usa a forma de 2 argumentos** (`revalidateTag(tag, "max")`) — a forma de 1 argumento está deprecada nesta versão do Next e falha no typecheck.

**Schema (aplicado com `prisma db push`, como sempre):**
- `Task`: novos campos `sortOrder` (Float, ordenação no Kanban) e `recurrence` ("weekly"|"biweekly"|"monthly").
- Novos modelos: `Subtask` (checklist), `TaskActivity` (histórico de mudanças), `TaskLink` (links/anexos), `Notification` (notificações in-app), `ClientNote` (notas/contatos por cliente).

**Novas funcionalidades:**
- Deep-link de tarefas: `/tasks?task=<id>` abre o painel de detalhe. Usado pela busca ⌘K, links do Slack, notificações, dashboard e página do cliente. `/recaps?recap=<id>` expande o recap.
- Notificações in-app: sino na Sidebar (`NotificationsBell`, polling 60s), criadas ao atribuir tarefa e em menções; API `/api/notifications` (GET/PATCH marca lidas).
- Subtarefas/checklist no `TaskDetailPanel` com barra de progresso no card; APIs `/api/tasks/[id]/subtasks[/sid]`.
- Links na tarefa (Figma/Drive/etc.) com contador no card; API `/api/tasks/[id]/links`.
- Histórico de atividade por tarefa (aba "Atividade" no painel): o PATCH registra mudanças de status/título/prioridade/prazo/responsável em `TaskActivity` (`src/lib/activity.ts`).
- Menções `@nome` nos comentários → notificação in-app + DM no Slack (`notifyUser` em slack.ts); menção destacada em verde no thread.
- Página **Minha Semana** (`/week`): tarefas do usuário agrupadas em Atrasadas/Hoje/Amanhã/Esta semana/Mais adiante/Sem prazo.
- Recorrência de tarefas: ao concluir uma tarefa recorrente, o PATCH cria a próxima ocorrência (source `recurrence`) com prazo +7/+14/+1 mês.
- Recaps: tarefas sugeridas pela IA agora podem ser **editadas antes de adicionar** (título, descrição, responsável, prioridade, prazo); o botão Adicionar confirma sucesso de verdade (res.ok) e faz match do responsável por nome; a tarefa criada herda o cliente do recap.
- Kanban: **reordenação dentro da coluna** via drag-and-drop (campo `sortOrder`, ponto médio entre vizinhos) com indicador visual de posição de drop e card translúcido ao arrastar.
- Menu de status completo (incluindo "Bloqueado") no header do `TaskDetailPanel`.
- Filtros persistidos na URL em Tarefas (`?assignee=&status=`) e Kanban (`?assignee=`).
- Calendário: **visão Agenda** (lista cronológica) alternável com a grade mensal.
- Paginação: Logs com cursor `before` + "Carregar mais" (API retorna `{logs, hasMore}` — formato de resposta mudou); Tarefas com "Mostrar mais" (50 por página).
- Notas de cliente: aba "Notas" editável (notas + contatos) na página do cliente, persistida em `ClientNote` via `/api/clients/[name]`; abas Reuniões/Recaps/Tarefas agora com deep-links.
- NewTaskModal: novos campos Cliente (datalist via `/api/clients`), Recorrência e Entrega (deliverTo, exibido quando há cliente).
- Notificação por email/Slack de tarefa nova não dispara mais quando o criador atribui a si mesmo.

**Visual/layout:**
- Responsividade: Sidebar vira drawer com hambúrguer + top bar fixa abaixo de `md`; painel do calendário com backdrop no mobile; padding `p-4 md:p-8` nas páginas.
- Dashboard: linha de stats compacta, seção "Precisa de atenção" (atrasadas + vencendo em 2 dias, clicáveis), atalho para Minha Semana, atividade recente e clientes com links.
- Micro-interações: slide-in no painel de detalhe, fade no backdrop, animação nos toasts e modais.
- Badge de prioridade do TaskCard corrigido (classes estáticas em vez do hack `bg-current/10` + override inline).
- `Skeleton` aceita `style` (corrige erro de tipo pré-existente no `ListSkeleton`).

**Notas:**
- Fix: página do cliente (`/clientes/[slug]`) quebrava com `e.startAt.toISOString is not a function` — `unstable_cache` serializa datas do Prisma para string em alguns hits de cache, então os campos de data não são sempre `Date`. Envolvido em `new Date(...)` antes do `.toISOString()`, mesmo padrão já usado em `calendar/page.tsx`.
- Páginas client que usam `useSearchParams` (Tarefas, Kanban, Recaps) foram envolvidas em `<Suspense>` para o build de produção.
- Build de produção e `tsc --noEmit` passando.
- Pendente/futuro: token do Slack ainda em texto puro na tabela `Setting`; sem desconexão do Google pela UI.

## 2026-07-06

- Criado este CHANGELOG.md e a memória de projeto correspondente para começar a rastrear mudanças a partir de agora.
- Adicionado fluxo de "esqueci minha senha":
  - Novo modelo `PasswordResetToken` no `prisma/schema.prisma` (token armazenado com hash SHA-256, expira em 1h, uso único). Aplicado ao banco via `prisma db push` (não `migrate dev`, para não resetar dados — ver nota de drift abaixo).
  - `POST /api/auth/forgot-password` — gera o token, invalida tokens anteriores não usados do usuário, envia email via Resend (`sendPasswordResetEmail` em `src/lib/email.ts`). Sempre responde com mensagem genérica para não revelar quais emails existem na base.
  - `POST /api/auth/reset-password` — valida token (existe, não expirado, não usado), exige senha com 8+ caracteres, atualiza `User.password` com bcrypt e marca o token como usado numa transação.
  - Páginas `/forgot-password` e `/reset-password` (esta com client component separado por causa do `useSearchParams`, que exige um `Suspense` boundary no build de produção).
  - Link "Esqueci minha senha" adicionado em `src/app/login/page.tsx`.
  - **Nota:** `npx prisma migrate dev` detectou drift no `dev.db` (tabelas `PlatformLog`, `Setting`, `TaskComment` existem no banco mas não no histórico de migrations — provavelmente aplicadas via `db push` anteriormente). Por isso usei `db push` para esta mudança também, para não forçar reset do banco local.
