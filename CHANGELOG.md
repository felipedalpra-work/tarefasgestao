# Changelog

Registro manual de mudanças relevantes neste projeto (não é um repositório git, então este arquivo é a fonte de histórico).

Formato de cada entrada: `## AAAA-MM-DD` seguido de bullets curtos descrevendo o que mudou e por quê (quando não for óbvio).

## 2026-07-09 (recaps)

**Corrige duplicação de tarefas dos Meet Recaps + histórico de acerto da IA:**
- **Bug real corrigido:** `processRecap` (`src/lib/process-recap.ts`) criava as tarefas no Kanban automaticamente assim que um recap era sincronizado/processado — mesmo a tela dizendo "revise antes de adicionar". Combinado com o botão "Adicionar" (que também cria tarefa), isso gerava duplicatas. Reprocessar um recap já processado apagava tudo (`processedAt`/`suggestedTasks` resetados pra null) e recriava do zero, duplicando de novo se já tinha sido adicionado antes.
- **Correção:** `processRecap` agora só grava sugestões (nunca cria `Task`). A tarefa só nasce quando o usuário clica "Adicionar" (já existente) — decisão confirmada com o usuário, já que muda o comportamento de "aparece sozinho no Kanban" pra "só depois de revisar".
- Novo model `RecapSuggestion` (por sugestão individual: título, descrição, responsável, prioridade, prazo, status `pending|accepted|edited|rejected|superseded`, `taskId` vinculado). Reprocessar um recap agora **preserva o histórico** — só marca como `superseded` as sugestões que ainda estavam pendentes da leva anterior; aceitas/editadas/rejeitadas nunca são apagadas.
- Novo botão **"Descartar"** por sugestão (com "desfazer" pra quem descartou por engano) — antes não existia nenhuma forma de rejeitar uma sugestão ruim.
- Painel de **taxa de acerto da IA** no topo de `/recaps` (`GET /api/recaps/accuracy`): % de sugestões aceitas/editadas vs rejeitadas, calculado sobre o que já foi avaliado (ignora pendentes e sugestões substituídas por reprocessamento).
- O prompt da IA (`process-recap.ts`) agora inclui como few-shot as últimas tarefas aceitas (mostrando como o título sugerido virou o título final, quando editado) e as últimas sugestões rejeitadas (pra evitar repetir o mesmo tipo de erro) — não é fine-tuning real (o modelo da Groq é hospedado, sem essa opção), mas usa o histórico pra melhorar a extração ao longo do tempo.
- Página `/recaps` ganhou filtro **Pendentes de revisão / Todas** — por padrão só mostra recaps com sugestão ainda não avaliada.
- Scripts `scripts/process-all-recaps.mjs` e `scripts/reset-recap-tasks.mjs` atualizados pro mesmo modelo (o primeiro também parou de criar Task direto; o segundo agora limpa `RecapSuggestion` também).
- Testado ponta a ponta: extração sem criar task automaticamente, aceitar sugestão (vincula `taskId` + status `accepted`), rejeitar sugestão, reprocessar preservando aceita/rejeitada e substituindo só as pendentes, cálculo da taxa de acerto. Dados de teste removidos depois.

## 2026-07-09 (fix)

**Bug no parser de título do calendário:**
- `extractClientFromTitle` (`src/lib/calendar-sync.ts`) não reconhecia títulos com "O2 Inc." (com ponto) — só funcionava sem o ponto. Isso fazia reuniões reais (ex: "O2 Inc. & Captable | Semanal") não serem sincronizadas como reunião de cliente nenhuma. Corrigido pra aceitar o ponto opcional.
- A extração agora **exige o "|"** no título pra considerar como reunião de cliente — sem isso, títulos como "O2 Inc & Fulano de Contato, 11am" (reunião com uma pessoa de contato, não um cliente) criavam um "cliente" fantasma com a hora colada no nome. Decisão do usuário: sem "|" não é reunião de cliente.
- Título no padrão "`<Pessoa> / <Pessoa> | <Cliente>`" (sem o prefixo "O2 Inc") continua não sendo capturado — decisão consciente, só o padrão oficial do playbook conta.
- Validado com os títulos reais do calendário do usuário (print da agenda) antes e depois da correção.

## 2026-07-09 (cont.)

**Diagnóstico, checklist de reunião e Fechamento Mensal (Playbook CFOaaS):**
- `ClientNote` ganhou as etapas 0–3 do Diagnóstico (`diagnosticoHandoffAt`, `diagnosticoIntakeAt`, `diagnosticoAnaliseAt`, `diagnosticoValidacaoAt`) e `diagnosticoIntakePendente` (texto livre com os documentos ainda faltando pedir). A etapa 4 (Apresentação final) reaproveita o marco `diagnosticDoneAt` que já existia — não duplica campo. Tudo isso mostrado na aba **Onboarding** do cliente.
- `CalendarEvent` ganhou o checklist de "toda reunião" do playbook: `nextSteps` (próximos passos validados), `attendanceConfirmed` e `registroConferido` (booleans) — editáveis junto da Temperatura, na aba Reuniões, só para reuniões já realizadas.
- Novo model `FechamentoMensal` (`@@unique([client, year, month])`): checklist mensal recorrente por cliente — comitê realizado, rebalanceamento de caixa, conciliação OK, CP/CR fechados, pendências anotadas, maturidade do fechamento e data de revisão do status de saúde. Nova aba **Fechamento** no cliente, com navegação entre meses e histórico visual (quantos itens concluídos por mês). API em `/api/clients/[name]/fechamentos`.
- Decisão consciente: política comercial (CNPJs, formas de pagamento, ativação/cancelamento de contrato) **não** entrou na plataforma — já vive no Pipefy (CRM de vendas), trazer pra cá duplicaria sistema de registro.
- Testado ponta a ponta: campos de Diagnóstico, checklist de reunião (próximos passos + presença + registro) e criação/consulta de Fechamento Mensal, tudo validado via API antes do push. Dados de teste removidos depois.

## 2026-07-09

**Fluxos do Playbook CFO as a Service:**
- `ClientNote` ganhou `healthStatus` (verde/amarelo/vermelho — semáforo de saúde da conta, editável na tabela `/clientes`) e os marcos de onboarding (`onboardingStartAt` = D+0, `cfoAllocatedAt`, `kickoffScheduledAt`, `kickoffDoneAt`, `setupDoneAt`, `diagnosticDoneAt`, `oxyIntegratedAt` = D+2/3/7/30/60/90), editáveis na nova aba **Onboarding** da página do cliente.
- Nova aba Onboarding mostra cada marco com prazo calculado a partir do D+0, e sinaliza atraso (vermelho) quando passa do prazo sem a data real preenchida. Inclui também as 4 reuniões de Setup (R1–R4: Faturamento/CR, Compras/CP, Custeio/Estoque, Plano de Contas), cada uma com data prevista/realizada, participantes, gravação, transcrição e próximos passos — novo model `SetupMeeting` (`@@unique([client, code])`), API em `/api/clients/[name]/setup-meetings`.
- Definir a data de início do onboarding agora **gera automaticamente** as 3 entregas recorrentes do ano 1 (Planejamento orçamentário no mês 4, Fechamento contábil no mês 6, Replanejamento geral no mês 12) como Tasks — `src/lib/onboarding-deliverables.ts`, idempotente (reajusta o prazo se a data mudar, nunca duplica).
- Novo módulo de **Tratativas** (risco/atrito com cliente): model `Tratativa` (tipo preventiva/reativa, motivo, descrição, satisfação, problema na Oxy, responsável, status triagem→em_tratativa→plano_de_acao→concluida, desfecho recuperado/churn/downsell/mudança de escopo/desistência, motivo e data do churn). API em `/api/tratativas` (lista + criar) e `/api/tratativas/[id]` (editar). Nova página global `/tratativas` (com filtro por status e alerta quando há tratativa reativa aberta) e nova aba "Tratativas" na página de cada cliente — mesmo componente `TratativaCard` reaproveitado nos dois lugares.
- `CalendarEvent` ganhou `meetingType` (extraído automaticamente do título do evento — só "Reunião Semanal" e "Comitê Estratégico Mensal" viram badge reconhecido, igual ao playbook) e `temperature` (clima da reunião — ótimo/bom/atenção/crítico), preenchido manualmente na aba "Reuniões" do cliente para reuniões já realizadas.
- Menu lateral ganhou o item "Tratativas".
- Testado ponta a ponta no dev server: tabela de clientes com saúde, criação/edição/conclusão de uma tratativa, definição de data de onboarding com geração das 3 entregas (datas conferidas e idempotência confirmada — reaplicar a mesma data não duplica), edição de reunião R1, e temperatura numa reunião passada. Todos os dados de teste foram removidos depois.

## 2026-07-08 (cont.)

**Importação da carteira de clientes O2:**
- `ClientNote` ganhou mais campos, mapeados a partir da planilha "Carteira de Clientes O2" do time: `erp` (nome do sistema ERP do cliente), `accessMode` (modo de acesso), `updateFrequency`/`updateResponsible` (frequência e responsável pela atualização dos dados na Oxy), `routineWhat`/`routineWho`/`routineWhen` (rotina recorrente com o cliente) e `pendencyWho` (complementa `oxyPendencies` com quem é responsável).
- `oxyStage` ganhou valores novos pra bater com a nomenclatura real do time: `em_validacao` e `implantacao_interrompida` (antes só existia `nao_iniciado`/`em_implantacao`/`ativo`/`com_pendencia` — `com_pendencia` foi removido, não era usado). `importType` ganhou `automatica_manual` (caso do GETUS).
- **Fonte de verdade dos clientes mudou:** antes, a lista de clientes em `/clientes` só existia se o nome aparecesse em algum `Task`/`CalendarEvent`/`MeetRecap`. Agora `getClientsTable`/`getClientsOverview` fazem união com os nomes que só têm `ClientNote` — necessário porque a carteira importada tem clientes sem nenhuma tarefa/reunião ainda (ex: Uiara, Dom Duan).
- Corrigido bug relacionado: a página `/clientes/[slug]` dava 404 pra clientes sem tarefas/reuniões/recaps, mesmo tendo `ClientNote`. Ajustado `getClientDetail` pra também buscar o `ClientNote` e a página só dá `notFound()` se não houver nada em lugar nenhum.
- Tabela `/clientes` ganhou a coluna **ERP** (editável inline). Os demais campos novos (modo de acesso, rotina, atualização) foram pra uma aba nova **"Oxy"** na página de detalhe do cliente (`ClientTabs.tsx`), pelo mesmo padrão de fetch/save da aba "Notas" já existente — decisão consciente pra não sobrecarregar a tabela principal com muitas colunas.
- Importados os 19 clientes da planilha via script pontual (rodado uma vez, não versionado) usando `prisma.clientNote.upsert`. "Inativo" na planilha foi mapeado para `status: "pausado"` (não "encerrado") — decisão da equipe, client pode voltar a ficar ativo.

## 2026-07-08

**Tabela de clientes (status + situação na Oxy):**
- `ClientNote` ganhou campos novos: `status` (ativo/pausado/encerrado), `oxyStage` (não iniciado/em implantação/ativo/com pendência), `importType` (manual/automática), `lastDataUpdate`, `oxyPendencies` (texto livre). Preenchimento é manual pela equipe — não há integração com a API da Oxy.
- Página `/clientes` trocou os cards por uma tabela (`ClientsTable.tsx`): nome, status, implantação na Oxy, tipo de importação, última atualização, tarefas abertas (reaproveita `Task.client`) e pendências específicas da Oxy. Células de status/data/pendência são editáveis inline, salvando via `PATCH /api/clients/[name]`.
- Nova query cacheada `getClientsTable` (tag `clients`) junta `getClientsOverview` com os dados do `ClientNote` por cliente.

**Fix deploy Vercel:**
- `next.config.ts` tinha `turbopack.root` com caminho absoluto do Windows hardcoded (`C:\Users\Felipe Dalpra\tarefasgestao`), workaround local para o Turbopack confundir a raiz do workspace. Na Vercel isso virava um caminho inválido (`/vercel/path0/C:\...`) e o build falhava. Trocado para `path.join(__dirname)`, que resolve certo em qualquer máquina/SO.
- Faltava `"postinstall": "prisma generate"` no `package.json`. Localmente o Prisma Client já estava gerado de execuções anteriores, mascarando o problema; num `npm install` limpo (Vercel) o client não é gerado e os tipos caem para `any`, quebrando o typecheck do `next build` (erro apareceu em `calendar/page.tsx`, mas afetava qualquer uso de dados do Prisma).
- `email.ts`, `meeting-briefing.ts` e `process-recap.ts` instanciavam `Resend`/`Groq` no escopo do módulo — os dois SDKs lançam erro no construtor se a API key está ausente. Como `RESEND_API_KEY`/`GROQ_API_KEY` ainda não estão configuradas na Vercel, qualquer rota que importasse esses arquivos (ex: `/api/auth/forgot-password`) derrubava o "Collecting page data" do build inteiro. Os clients agora são criados sob demanda (`getResend()`/`getGroq()`), então a falta da key só afeta quem realmente chamar a função em runtime. **Pendente:** configurar `RESEND_API_KEY`, `RESEND_FROM` e `GROQ_API_KEY` nas env vars da Vercel para essas features (emails, recaps por IA) funcionarem em produção.
- Validado localmente simulando o ambiente da Vercel: build limpo (`rm -rf node_modules/.prisma .next`, reinstalar) e build sem nenhuma env var carregada (`.env` renomeado temporariamente) — ambos passaram.

**Migração SQLite → Postgres (Neon):**
- Causa: mesmo com o build passando, o app quebrava em runtime na Vercel (`/dashboard` com "A server error occurred") porque `DATABASE_URL="file:./dev.db"` aponta pra um arquivo que não existe (e não pode persistir) em funções serverless.
- Criado um banco Postgres via integração Neon no painel da Vercel (mesma instância usada em produção e localmente, sem branch separada — decisão consciente pela simplicidade, squad pequeno).
- `prisma/schema.prisma`: `datasource db` trocado de `sqlite` para `postgresql`.
- `src/lib/prisma.ts`: adapter trocado de `@prisma/adapter-better-sqlite3` para `@prisma/adapter-neon` (via WebSocket, usando o pacote `ws`) — necessário porque o app usa `prisma.$transaction([...])`, que a variante HTTP-only do adapter Neon não suporta bem.
- `prisma.config.ts`: usa `DATABASE_URL_UNPOOLED` (conexão direta, sem pgbouncer) para `db push`/`migrate`, já que operações de schema não funcionam bem atrás do pooler.
- Todos os scripts utilitários em `scripts/*.mjs` (list-users, seed-users, check-*, reset-*, process-all-recaps, test-*) atualizados pro mesmo adapter, e passaram a carregar `.env` via `dotenv` (antes não precisavam, pois o SQLite não dependia de env var).
- `dev.db` e `prisma/dev.db` removidos (não são mais usados).
- Dados: começamos vazios em produção (sem migrar clientes/tarefas de teste do SQLite local). Os 3 usuários do squad foram recriados no Postgres via `seed-users.mjs` (mesma senha inicial de sempre).
- Validado localmente: `npm run build` limpo, login real via credentials, dashboard/tarefas/clientes carregando, criação de tarefa + reflexo na tabela de clientes (cache invalidando certo) — tudo contra o Postgres novo.
- **Pendente:** confirmar que a Vercel já injetou `DATABASE_URL`/`DATABASE_URL_UNPOOLED` automaticamente via integração Neon (deve ter ocorrido ao conectar o banco ao projeto); as demais env vars (`RESEND_*`, `GROQ_API_KEY`, `GOOGLE_CLIENT_*`, `NEXTAUTH_*`, `ALLOWED_EMAILS`) ainda precisam ser configuradas manualmente.

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
