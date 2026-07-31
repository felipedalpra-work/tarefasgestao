# Changelog

Registro manual de mudanças relevantes neste projeto (não é um repositório git, então este arquivo é a fonte de histórico).

Formato de cada entrada: `## AAAA-MM-DD` seguido de bullets curtos descrevendo o que mudou e por quê (quando não for óbvio).

## 2026-07-30 (filtro de prazo no Kanban)

- `/kanban` ganhou o mesmo filtro de prazo já usado em `/tasks`: atalhos (Todos/Atrasadas/Hoje/Esta semana/Sem prazo) + período customizado, combinando com os filtros de responsável e cliente que já existiam. `setParams` do Kanban passou a aceitar `null` pra remover parâmetro da URL (igual `/tasks`), necessário pra limpar `dueFrom`/`dueTo` ao trocar de atalho.

## 2026-07-30 (múltiplos acessos por cliente na aba Oxy)

- Antes, a aba "Oxy" de cada cliente tinha um único campo "Modo de acesso" (nunca preenchido por ninguém — conferi no banco: 0 clientes com esse campo usado). Não dava pra representar cliente com mais de uma empresa/CNPJ, cada uma com seu próprio ERP e forma de acesso — e olhando os dados reais de ERP, isso já era um problema de verdade: vários clientes têm valores tipo "Lince / Próximo ERP em estudo" ou "Agrodados (loja) / SellSoft + CATU (legado)" espremidos num campo só.
- Novo modelo `ClientLogin` (empresa, ERP, modo de acesso) — lista, não campo único. Nova seção "Acessos (ERP / login)" na aba Oxy: adiciona quantas linhas precisar, cada uma editável e removível independente. `GET/POST /api/clients/[name]/logins` + `PATCH/DELETE /api/clients/[name]/logins/[id]`, mesmo padrão de rotas aninhadas já usado pra Subtasks de tarefa.
- Exclusão de cliente (`DELETE /api/clients/[name]`) agora também apaga os `ClientLogin` daquele cliente — senão ficariam órfãos no banco.
- Validado com dados sintéticos (criados e removidos depois): duas empresas pro mesmo cliente, listagem, edição e o cascade delete todos bateram certo.

## 2026-07-30 (filtro Tudo/Reuniões/Tarefas em /calendar)

- Além do filtro por pessoa, `/calendar` (`CalendarGrid.tsx`) ganhou um segundo filtro pra alternar entre ver tudo, só reuniões (eventos do Google Calendar) ou só tarefas — os dois filtros combinam (ex: só as tarefas do Felipe, ou só as reuniões da Tainara).

## 2026-07-30 (filtro por pessoa em /calendar — cruza reunião e tarefa)

- Pedido do usuário: poder ver a agenda de cada um (ou de 2-3 pessoas juntas), cruzando reuniões do Google Calendar com tarefas, num mesmo filtro — mesmo padrão de multi-seleção já usado em Kanban/Tarefas.
- Problema de base: `CalendarEvent` não guardava **quem** do squad participa de cada reunião — só `client`/`title`/datas. A sincronização (`calendar-sync.ts`) roda por usuário (`syncCalendarForUser`), mas nada registrava isso na tabela.
- Novo campo `attendeeUserIds String[]` em `CalendarEvent`. Durante a sincronização, os e-mails da lista `attendees` do Google são casados (sem diferenciar maiúsculas/minúsculas) contra `User.email`; quem não é do squad (contato do cliente, por ex.) é ignorado. Quem sincronizou sempre entra na lista, mesmo que o Google não liste o dono do calendário como attendee.
- `/calendar` (`CalendarGrid.tsx`) ganhou a mesma faixa de filtro multi-seleção do Kanban/Tarefas — filtra reunião (por `attendeeUserIds`) e tarefa (por responsável) juntas; vazio = mostra todo mundo.
- Validado com dados sintéticos (banco real, removidos depois): resolução de e-mail case-insensitive com contato externo corretamente ignorado, array persistindo e relendo certo, e as 3 combinações do filtro (pessoa específica, pessoa não convidada, "Todos") bateram como esperado.

## 2026-07-30 (Tainara não conseguia logar — "Adicionar membro" não dava acesso de verdade)

- Causa: "Adicionar membro" em Configurações → Equipe (`POST /api/users`) cria a linha em `User` só com nome/e-mail/cargo, sem senha — a ideia é a pessoa entrar direto pelo Google, já que o callback `signIn` (`src/lib/auth.ts`) libera qualquer e-mail que já tenha uma linha em `User`. Só que sem `allowDangerousEmailAccountLinking`, o NextAuth recusava esse primeiro login (existe `User` com esse e-mail, mas nenhuma `Account` do Google ainda vinculada) — erro `OAuthAccountNotLinked`, que a tela de `/login` mostra como a mensagem genérica "Esse e-mail ainda não tem acesso liberado no squad." Todo mundo adicionado só por esse formulário (não pelo script inicial de senha) ficava nessa situação, não só a Tainara.
- Correção: `allowDangerousEmailAccountLinking: true` no provider do Google (`src/lib/auth.ts`) — seguro aqui porque o callback `signIn` já funciona como allowlist (só libera e-mail com `User` pré-cadastrado; não abre a porta pra qualquer conta Google).
- Desbloqueio imediato: defini a senha inicial padrão do squad (`o2squad2024`, mesma dos outros) direto no banco pra Tainara — validado com `bcrypt.compare` antes de avisar que estava resolvido.
- Atualizei `scripts/seed-users.mjs` (estava com Humberto, que já saiu) pra refletir o squad atual.

## 2026-07-30 (adicionar cliente manualmente em /clientes)

- Antes, um cliente só aparecia na tabela depois de gerar alguma atividade (tarefa, reunião ou recap) ou de alguém mexer numa linha já existente — não tinha como cadastrar um cliente novo do zero direto na plataforma. Botão "Adicionar Cliente" em `/clientes` (`ClientsTable.tsx`) abre um modal só com o nome; o resto das colunas (Saúde, ERP, Status, Implantação Oxy etc.) fica com os defaults de sempre (`ativo` / `não iniciado` / `verde`) pra preencher depois na própria tabela.
- Novo `POST /api/clients`: valida duplicidade **sem diferenciar maiúsculas/minúsculas contra as 4 fontes** que compõem a carteira (ClientNote + eventos + recaps + tarefas) — não só contra outros ClientNote — porque cliente não é entidade própria, é string espalhada em várias tabelas; sem essa checagem ampla, "fismatek" e "Fismatek" virariam dois clientes diferentes na tabela.
- Estado vazio da página (antes só em `page.tsx`) migrou pra dentro de `ClientsTable`, porque agora o botão de adicionar precisa aparecer mesmo com a carteira zerada.
- Validado contra o banco real (script descartável): duplicidade com case diferente detectada corretamente, criação com os defaults certos, segunda tentativa do mesmo nome bloqueada, e o registro de teste removido no final — banco voltou ao estado original.

## 2026-07-30 (estatísticas no painel de Automações)

- `/automacoes` ganhou uma visão geral: execuções nos últimos 30 dias, taxa de sucesso, contagem de erros e a automação mais usada (por total de execuções) — a pedido do usuário, que queria enxergar quantas vezes cada rotina já rodou, erros e qual é mais usada.
- Cada card de automação ganhou um histórico visual (últimos 10 runs como quadradinhos verde/vermelho, com tooltip de data e status) + contagem de sucesso/erro total.
- Painel de "Erros recentes" (últimos 5, entre todas as automações) aparece só quando existe pelo menos um erro registrado.
- Novo `GET /api/automations/stats` (protegido por sessão, separado do `GET /api/automations` que a página já fazia polling a cada 30s, pra não pesar esse ciclo com as agregações). Calcula tudo em memória a partir de `AutomationRun` (sem groupBy do Prisma) — simples de dar manutenção, e rápido o suficiente pro volume esperado (poucas dezenas de execuções por automação).
- Validado com dados sintéticos criados e removidos via script descartável: taxa de sucesso, filtro de 30 dias, "mais usada" e lista de erros recentes bateram certo antes de eu limpar o banco de volta ao estado original.

## 2026-07-30 (painel de Automações — visibilidade + controle das rotinas Oxy)

- Código recebido via patch de outra sessão (Claude Cowork), aplicado com `git am` na branch `feature/automacoes-painel` pra preservar a autoria, revisado (typecheck com Prisma Client regenerado localmente + lint) e mesclado na `main` depois de confirmar com o usuário.
- Novos modelos `Automation`, `AutomationRun`, `AutomationCommand` (`prisma/schema.prisma`) — guardam só o status reportado pelas rotinas externas (GetConnect/Babyland → Oxy CFO Hub, lembrete Zé do Flor), que hoje rodam como tarefas agendadas do Claude/Cowork fora deste app.
- `POST /api/automations/report`: a rotina externa reporta status (sucesso/erro) ao final de cada execução. `GET /api/automations`: alimenta a página `/automacoes` (nova, com item no Sidebar → grupo Sistema). `POST /api/automations/[id]/commands`: o painel dispara "Rodar agora"/"Pausar"/"Reativar". `GET .../commands/pending` + `POST .../ack`: uma tarefa-ponte do Claude consome a fila e confirma quando processa.
- Autenticação: ações do painel exigem sessão (qualquer pessoa do squad); as chamadas da rotina/bridge externa usam bearer token via nova env `AUTOMATIONS_SECRET` (mesmo padrão do `N8N_WEBHOOK_SECRET` — escopo isolado, não toca em Task/Cliente/Usuário).
- **Pendente pra terminar de funcionar**: configurar `AUTOMATIONS_SECRET` nas env vars da Vercel (Settings → Environment Variables) e rodar `npx prisma db push` pra criar as tabelas novas no banco — nenhum dos dois foi feito ainda por falta de acesso a partir daqui.

## 2026-07-24 (lembrete de fechamento incompleto para de mandar no Slack)

- `checkFechamentoIncompleto` (`src/lib/reminders.ts`), parte do job `deadlines` (roda 8h e 17h BRT via GitHub Actions), mandava `📋 Fechamento de MM/AAAA de {cliente} está incompleto` todo dia pro Slack de todo o squad, a pedido do usuário parou de fazer barulho.
- Mudou só o último argumento de `broadcast(...)` de `true` pra `false` — mesmo padrão já usado em `checkOnboardingDelays` pra lembretes menos críticos. Continua criando a notificação in-app (sino) normalmente, só não dispara mais DM no Slack.

## 2026-07-24 (detecção de duplicidade não considerava reuniões recorrentes)

- `findDuplicateNote` (`src/lib/duplicate-detection.ts`) marcava como duplicada qualquer sugestão com título normalizado + cliente iguais a uma tarefa aberta ou sugestão pendente — sem olhar quando isso aconteceu. Reuniões recorrentes (semanais/mensais) com o mesmo cliente tendem a gerar o mesmo título genérico toda vez ("Enviar relatório mensal", "Follow-up com cliente"), então toda ocorrência nova virava "duplicada" de uma antiga, mesmo sendo semanas ou meses depois.
- Critério escolhido: além de título+cliente baterem, agora também exige que as datas estejam próximas — dentro de ~2 semanas (prazo da sugestão, ou data de criação quando não tem prazo). `findDuplicateNote` passou a receber um terceiro parâmetro opcional (`dueDate`) para essa comparação; atualizado nos dois pontos que chamam a função (`process-recap.ts` e `webhooks/n8n/route.ts`).
- Validado com script descartável (só leitura) contra o banco real + teste isolado da janela de tempo: 5 dias de diferença ainda conta como duplicata, 30 dias (ocorrência do mês seguinte) não conta mais.

## 2026-07-24 (link "Ver tarefa" do Slack não abria — apontava pra localhost)

- Causa: `getBaseUrl()` (`src/lib/base-url.ts`) só olhava `APP_URL`/`NEXT_PUBLIC_APP_URL`; sem essas variáveis configuradas na Vercel, caía direto no fallback `http://localhost:3000` — daí o link do Slack (e de qualquer outro lugar que usa `getBaseUrl()`: comentário com @menção, briefing de reunião, digest semanal) virar um link morto pra quem não está com o servidor local rodando.
- Adicionei um fallback antes do localhost: `VERCEL_PROJECT_PRODUCTION_URL`/`VERCEL_URL`, variáveis que a própria Vercel injeta automaticamente em todo deploy — então o link funciona em produção mesmo que ninguém tenha configurado `APP_URL` manualmente.
- Recomendo mesmo assim configurar `APP_URL` nas variáveis de ambiente do projeto na Vercel, apontando pro domínio customizado (se tiver um) — sem isso, o link vai usar o domínio padrão `*.vercel.app` da Vercel, que funciona mas não é o mais bonito. Não tenho acesso ao painel da Vercel pra fazer essa parte.

## 2026-07-24 (corrige prazo de tarefa aparecendo um dia antes)

- Causa raiz: o `<input type="date">` manda "2026-07-28", e `new Date("2026-07-28")` sempre interpreta isso como meia-noite **UTC**. Ao exibir com `format()`/`toLocaleDateString()` (que leem a data no fuso local do navegador), qualquer fuso atrás de UTC — como Brasília, UTC-3 — mostra o dia anterior, porque meia-noite UTC do dia 28 já é 21h do dia 27 em Brasília.
- Adicionei `dueDateOnly()` em `src/lib/utils.ts`: lê os componentes ano/mês/dia em UTC e reconstrói como meia-noite local, garantindo que o dia exibido/comparado seja sempre o que a pessoa digitou, em qualquer fuso. Também padronizei `isTaskOverdue()` (antes cada tela reimplementava o cálculo de forma ligeiramente diferente).
- Apliquei nos pontos onde o `dueDate` era lido com `new Date(...)`/`toLocaleDateString` puro: `TaskCard`, `TaskDetailPanel` (cartões e modal usados em Kanban e Tarefas), `CalendarGrid` (o bug reportado — tarefa do dia 28 caindo na célula do dia 27), `/tasks` (filtro de prazo), `/week` (Minha Semana) e `/dashboard`, e a lista de tarefas em `/clientes/[slug]`.
- Não mexi nos e-mails/Slack automáticos (`email.ts`, `slack.ts`, `deadline-check.ts`, `weekly-digest.ts`) — esses rodam via cron no servidor (Vercel, fuso UTC), então não apresentam esse sintoma hoje, e a matemática de prazo/dias restantes ali é lógica de negócio (quando disparar o lembrete), não só exibição — não quis arriscar mudar o timing dos lembretes automáticos sem isso ter sido pedido.
- Não precisou de migração de dado: o valor salvo no banco (meia-noite UTC) já estava certo, o bug era só na hora de ler/exibir.

## 2026-07-24 (filtro de cliente e de prazo na listagem de Tarefas)

- `/tasks` só tinha filtro de responsável e de status. Agora tem também filtro de **cliente** (dropdown com a carteira completa, via `/api/clients` — mesma fonte já usada no Kanban após a correção de hoje) e de **prazo**.
- Filtro de prazo tem atalhos (Todos, Atrasadas, Hoje, Esta semana, Sem prazo — mesmo vocabulário já usado em `/week`) e um modo "Período" com dois campos de data (de/até) pra faixa customizada.
- Todos os filtros continuam na URL (`?client=`, `?due=`, `?dueFrom=`, `?dueTo=`), então dá pra compartilhar o link já filtrado ou dar refresh sem perder o filtro — mesmo padrão dos filtros existentes.

## 2026-07-24 (lapizinho de edição nas Sugestões da IA, antes de adicionar ao Kanban)

- Antes, ao revisar uma sugestão vinda de Meet Recap ou do workflow n8n em `/sugestoes-ia`, só dava pra ajustar o prazo (no modal que aparece ao clicar "Adicionar") e, no caso do n8n, escolher o responsável. Título, descrição, prioridade e cliente vinham travados como a IA extraiu — se a IA errou algo, só dava pra aceitar torto ou descartar.
- `src/app/(app)/sugestoes-ia/page.tsx`: cada sugestão ganhou um lapizinho (mesmo padrão do `TaskDetailPanel` usado em Kanban/Tarefas) que abre um formulário inline pra editar título, descrição, prioridade, prazo, cliente e responsável antes de adicionar. As opções de responsável (pessoa do squad ou "Cliente") agora valem tanto pra sugestão de Meet Recap quanto de n8n — antes só o n8n tinha esse seletor.
- Edição fica só no estado local até clicar "Adicionar" — nada é salvo na sugestão original até esse momento. Se qualquer campo for alterado (incluindo o prazo, como já era antes), a sugestão de origem (`RecapSuggestion`/`ExternalSuggestion`) é marcada como `edited` em vez de `accepted` ao vincular a tarefa criada — mesmo controle de precisão da IA que já existia, só que agora cobre todos os campos editáveis, não só o prazo.

## 2026-07-24 (corrige filtro de cliente no Kanban, que só listava 3 opções)

- No `/kanban`, o dropdown de clientes era um drill-down: só listava clientes que apareciam nas tarefas dos responsáveis já selecionados no filtro acima. Como a página pré-seleciona o usuário logado como responsável ao carregar, o dropdown acabava mostrando só os clientes das tarefas atribuídas a ele mesmo (ex: 3 de 23 clientes da carteira).
- `src/app/(app)/kanban/page.tsx`: lista de clientes agora vem de `GET /api/clients` (mesma fonte usada no `NewTaskModal`, que junta `ClientNote` + eventos + recaps + tarefas — a carteira completa), independente de quem está selecionado no filtro de responsável.
- Testado contra o banco real (script descartável, só leitura): confirmado que o usuário "Felipe" via só 3 clientes com a lógica antiga; com a correção, os 23 clientes da carteira aparecem.

## 2026-07-23 (sidebar vira blocos com drill-down, pra não poluir a tela)

- A sidebar tinha 11 itens soltos numa lista só. Agora só `Dashboard` fica solto no topo; o resto virou 4 blocos colapsáveis (accordion): **Tarefas** (Minha Semana, Tarefas, Kanban, Calendário), **Clientes** (Clientes, Tratativas), **IA** (Meet Recaps, Sugestões da IA) e **Sistema** (Logs, Configurações).
- Por padrão todos os blocos vêm fechados — só abre o bloco que contém a página atual (calculado a partir da rota, não fica salvo). Cliques manuais em outros blocos ficam lembrados via `localStorage` entre sessões. Mais de um bloco pode ficar aberto ao mesmo tempo (não é accordion exclusivo).
- `src/components/Sidebar.tsx`: array `nav` virou `topLevel` (Dashboard) + `navGroups` (os 4 blocos). Badge de sugestões pendentes da IA (que antes só aparecia no item "Sugestões da IA") agora também aparece no cabeçalho do bloco "IA" quando ele está fechado, pra não sumir o aviso.

## 2026-07-21 (detalhe da tarefa vira modal central, em vez de painel lateral)

- `TaskDetailPanel` (usado em /kanban, /tasks e agora nos deep-links do calendário) deixou de deslizar da direita (`fixed right-0 h-full`) pra abrir centralizado na tela como modal (`max-w-lg max-h-[85vh]`), a pedido do usuário — achou melhor assim.
- Estrutura interna não mudou (header fixo, meta/subtarefas fixos, aba de comentários/atividade com scroll próprio, formulário de comentário fixo embaixo) — só a moldura externa.

## 2026-07-21 (calendário mostra todas as tarefas do dia, não só entregas ligadas a reunião)

- Antes, `/calendar` só mostrava tarefa dentro do painel de uma reunião (e só se o cliente da tarefa batesse com o cliente da reunião do dia). Tarefa sem cliente, ou com cliente sem reunião marcada, nunca aparecia no calendário.
- `getCalendarData` (`src/app/(app)/calendar/page.tsx`) agora também monta uma lista de **todas** as tarefas com prazo no mês visível, independente de cliente/reunião — passada como prop `tasks` pro `CalendarGrid`.
- Visão Mês: cada dia mostra até 3 tarefas com prazo naquele dia (ícone de check, título, cor por estado — azul pendente, vermelho atrasada, cinza riscado se concluída), com "+N tarefas" se passar disso. Clicar leva pra `/tasks?task=<id>` (mesmo deep-link que notificação e Slack já usam).
- Visão Agenda: reescrita de "uma linha por reunião" pra "um bloco por dia" — assim um dia só com tarefa (sem reunião nenhuma) também aparece, não só dias com reunião.
- Testado contra o banco real (script descartável, só leitura): 5 das 11 tarefas existentes têm prazo no mês corrente e caem nos dias certos.

## 2026-07-21 (botão de lembrete no Slack por tarefa)

- Cada tarefa com responsável ganhou um botão "Lembrar" ao lado do nome dele no detalhe da tarefa (`TaskDetailPanel`) — manda uma DM no Slack cobrando a tarefa, sob demanda (diferente da notificação automática que já existia só na atribuição/conclusão).
- Novo `notifyTaskReminder` em `src/lib/slack.ts` e `POST /api/tasks/[id]/remind`. Reaproveita a config de Slack já existente em Configurações (bot token + Slack User ID por pessoa) — se não tiver configurado pra aquela pessoa, retorna erro claro em vez de falhar silenciosamente.
- Tarefa sem responsável (ex: `deliverTo: "o2"`, do cliente) não mostra o botão — não tem pra quem mandar.

## 2026-07-21 (pausar sugestões de tarefa vindas de Meet Recap)

- O usuário quer, por enquanto, só tarefas vindas do workflow n8n — pediu pra desativar as sugestões que a IA gera a partir dos Meet Recaps do Gmail, com um jeito fácil de religar depois.
- Novo `Setting` (`meet_recap_suggestions_enabled`, helpers em `src/lib/settings.ts`) controla isso. **Já deixei desligado agora** (upsert direto no banco) — não esperei o clique no toggle.
- `syncUserGmail` (`src/lib/gmail-sync.ts`) continua sincronizando o conteúdo dos Meet Recaps normalmente (histórico em `/recaps` intacto) — só pula a chamada de `processRecap` (extração via Groq) quando o flag está desligado. Recaps que chegarem enquanto tiver desligado ficam com `processedAt: null`; ao religar, a própria sincronização seguinte já processa todo o atraso automaticamente (não só os novos), sem precisar reprocessar um por um.
- O botão manual "Reprocessar com a IA" em `/recaps` (`POST /api/recaps/[id]/process`) continua funcionando mesmo com o flag desligado — é uma ação explícita da pessoa, diferente do pipeline automático.
- Toggle em Configurações → seção "Meet Recaps (IA)" (`/api/settings/meet-recap`, GET/PUT). Sugestões do n8n (`ExternalSuggestion`) e criação manual de tarefa não são afetadas — só o pipeline de IA do Meet Recap.

## 2026-07-21 (excluir cliente)

- Novo `DELETE /api/clients/[name]` — como "cliente" não é entidade própria (é string espalhada em `Task`/`CalendarEvent`/`MeetRecap`/`Tratativa`/`SetupMeeting`/`FechamentoMensal`, mais o perfil em `ClientNote`), excluir um cliente apaga, numa transação, todas as linhas dessas tabelas que apontam pro nome — inclui cascade de `Subtask`/`TaskActivity`/`TaskLink`/`TaskComment`/`RecapSuggestion`. Ação irreversível.
- UI em dois lugares: ícone de lixeira por linha em `/clientes` (confirmação inline com contagem de tarefas/reuniões/recaps) e botão "Excluir cliente" no cabeçalho de `/clientes/[slug]` (confirmação mais forte — precisa digitar o nome do cliente, já que ali dá pra ver o volume completo de dados que seriam perdidos).
- Testado direto contra o Postgres do Neon (script descartável, cliente fake `__TESTE_CLAUDE_DELETE_CLIENT__` sem colidir com dado real): criei uma linha em cada tabela afetada + filhos em cascade, rodei a transação de exclusão e confirmei zero sobras em todas elas.

## 2026-07-20 (rascunho de e-mail no Gmail do Felipe pra tarefa do cliente vencida)

- Descoberta: `checkDeadlines` (`src/lib/deadline-check.ts`) só olha `task.assignee` — uma tarefa atribuída ao cliente (`assigneeId: null` + `deliverTo: "o2"`) nunca gerava alerta de prazo pra ninguém, mesmo vencida.
- Nova `checkClientTasksOverdue()` no mesmo arquivo: pra tarefa do cliente vencida (e ainda não tratada), cria um **rascunho** — nunca envia — no Gmail do Felipe Dalpra (`src/lib/gmail-draft.ts`), com o corpo já redigido como se fosse pro cliente (menciona a pendência, contexto da reunião de origem se tiver, prazo vencido) pra ele revisar, completar o destinatário (não temos e-mail de cliente cadastrado na plataforma) e decidir se envia.
- Novo campo `Task.clientDraftCreatedAt`: garante que o rascunho é criado **uma única vez** por tarefa (diferente do padrão de lembrete "1x por dia" de `reminders.ts` — rascunho repetido todo dia sujaria a caixa).
- `baseTemplate()` em `src/lib/email.ts` ganhou o ícone real da marca (os anéis do `LogoIcon.tsx`, com cor fixa em vez de `currentColor` que não funciona em e-mail) — melhora todos os e-mails do sistema, não só esse.
- **Escopo Google novo**: `gmail.compose` adicionado ao provider em `src/lib/auth.ts` (antes só tinha `gmail.readonly`/`calendar.readonly`). **O Felipe precisa reconectar a conta Google em Configurações depois desse deploy** — confirmei no banco que a conta dele só tem o escopo antigo; sem reconectar, a criação de rascunho falha com "insufficient authentication scopes" (testei e reproduzi esse erro exato, é o esperado até a reconexão).
- Job de cron `deadlines` (`/api/cron/deadlines`) passou a chamar essa checagem também.

## 2026-07-20 (mostrar reunião de origem — assunto e data — na tarefa)

- Novos campos `meetingTitle`/`meetingDate` em `Task` e `ExternalSuggestion`. Cliente já era copiado pra `Task` na criação — só faltava assunto/data da reunião.
- Meet Recap: `/sugestoes-ia` já tinha o `Recap` completo em mãos no aceite (`subject`, `createdAt`) — só passou a mandar isso pro `POST /api/tasks`, sem consulta nova no backend.
- n8n: `POST /api/webhooks/n8n` aceita `meetingTitle`/`meetingDate` opcionais no body. Ainda não vêm de lá (a colega precisa adicionar esses 2 campos no node HTTP Request dela, referenciando `$node['07 | Meeting Meta...'].json.meeting_title`/`.meeting_date` — instruções passadas a ela); até isso acontecer, tarefas do n8n não mostram essa seção.
- `TaskDetailPanel` ganhou a linha "Reunião de origem" (assunto + data), só aparece quando `task.meetingTitle` existe. Participantes ficou de fora por decisão do usuário — nenhum dos dois fluxos captura isso hoje, exigiria extração por IA nova.
- **Backfill**: as 13 tarefas `meet_recap` já existentes sem esses campos foram atualizadas retroativamente (buscando o `MeetRecap` pelo `sourceRef`). Tarefas antigas do n8n não entraram no backfill — o `sourceRef` delas é só texto livre concatenado, sem como separar assunto/data com segurança.

## 2026-07-20 (filtro de pessoa multi-seleção + filtro de cliente com drill-down no Kanban)

- Filtro de pessoa no Kanban (`/kanban`) deixou de ser seleção única e virou multi-seleção — dá pra combinar, por exemplo, Felipe + Tainara e ver só as tarefas dessas duas pessoas juntas. "Todos" limpa a seleção.
- Novo filtro de cliente (dropdown), que aparece do lado do filtro de pessoa. É drill-down de propósito: as opções de cliente só mostram os clientes que aparecem nas tarefas das pessoas já selecionadas — em vez de um filtro fixo pra cada combinação pessoa×cliente (que explodiria em opções), são dois filtros independentes que se combinam (E lógico entre os dois).
- Estado dos dois filtros vai pra URL (`?assignee=id1,id2&client=Nome`), então dá pra compartilhar/favoritar uma combinação específica.
- Se a pessoa selecionada mudar e o cliente escolhido não tiver mais tarefa nenhuma nessa combinação, o filtro de cliente volta pra "Todos os clientes" automaticamente (evita ficar com filtro "travado" mostrando zero tarefas sem explicação).

## 2026-07-20 (escolher responsável — pessoa do squad ou "Cliente" — nas sugestões do n8n)

- Em `/sugestoes-ia`, cards de sugestão vindos do n8n ganharam um seletor "Responsável": pessoa do squad, "Cliente ({nome do cliente})", ou em branco (mantém o comportamento de sempre — cai pra quem clicar "Adicionar").
- Reaproveitado `Task.deliverTo` (campo que já existia, usado em `NewTaskModal`/`calendar`/`meeting-briefing`) em vez de criar campo novo: `deliverTo: "o2"` = tarefa do cliente (ele entrega pra O2) — é a convenção real já em uso nesses 3 lugares.
- **Achado**: o comentário do prompt da IA em `process-recap.ts` descreve o significado de `deliverTo` ao contrário do que os outros 3 lugares fazem. Inofensivo hoje (esse campo da IA nunca é persistido — `RecapSuggestion` não tem coluna `deliverTo`), mas documentado em memória pra não confundir quem for religar esse fio depois.
- `POST /api/tasks` ganhou `noAssignee: true` — força `assigneeId: null` mesmo sem mandar um valor, porque o comportamento padrão (`body.assigneeId || session.user.id`) sempre cai pra quem criou/aceitou se não vier nada; sem esse flag não tinha como deixar uma tarefa de fato sem responsável.
- `TaskCard` e `TaskDetailPanel` mostram "Cliente" no lugar do responsável quando `!assignee && deliverTo === "o2"` (antes disso, tarefa sem assignee simplesmente não mostrava nada nesse campo).
- Testado via Prisma direto (sem sessão, então sem clique real no navegador): tarefa criada com `assigneeId: null, deliverTo: "o2"` e confirmado que o formato bate com o que os componentes esperam.

## 2026-07-20 (detecção de sugestão duplicada + aba "Duplicadas")

- Novo helper `findDuplicateNote(title, client)` (`src/lib/duplicate-detection.ts`): normaliza título/cliente (minúsculo, sem acento/pontuação) e checa igualdade exata contra `Task` abertas (`status != "done"`), outras `RecapSuggestion` pendentes e outras `ExternalSuggestion` pendentes do mesmo cliente. Sem cliente identificado, não checa nada (não dá pra comparar com segurança).
- `processRecap` (`src/lib/process-recap.ts`) e `POST /api/webhooks/n8n` chamam esse helper antes de gravar a sugestão — se bater, ela já nasce com `status: "duplicate"` e `duplicateNote` preenchido, em vez de `"pending"`.
- Novos campos: `status` de `RecapSuggestion`/`ExternalSuggestion` ganha o valor `"duplicate"`; ambos os modelos ganham `duplicateNote String?`.
- `/sugestoes-ia` ganhou duas abas: "Pendentes" (comportamento de sempre) e "Duplicadas" — mostra o motivo da duplicidade em cada card e permite "Adicionar mesmo assim" (mesmo fluxo de aceite de sempre) pra quem achar que a detecção foi precipitada.
- É comparação por **igualdade exata** após normalização, não similaridade aproximada — decisão deliberada pra evitar esconder tarefas só parecidas; o botão "Adicionar mesmo assim" é a válvula de escape pros casos que a checagem exata não pegar.
- Testado via webhook do n8n: mesmo título+cliente de uma tarefa aberta → duplicate; cliente diferente → pending; título diferente → pending; sem cliente → pending; mesmo título+cliente de outra sugestão externa ainda pendente → duplicate.

## 2026-07-20 (login com Google na tela de entrada)

- Botão "Continuar com Google" em `/login`, ao lado do form de e-mail/senha — reaproveita o provider Google que já existia em `src/lib/auth.ts` (até então só usado em Configurações pra conectar Gmail/Calendar, nunca exposto como opção de login).
- Motivo: membro novo da equipe (ver seção de gestão de equipe abaixo) não tem senha cadastrada — só dá pra logar via Google. O callback `signIn` do NextAuth já restringe a e-mails que já existem em `User`, então continua seguro (ninguém de fora consegue criar conta só clicando no botão).
- Página dividida em `page.tsx` (server, chrome) + `login-form.tsx` (client, com `useSearchParams` dentro de `Suspense`) — mesmo padrão já usado em `/reset-password`, necessário porque `useSearchParams` fora de `Suspense` quebra o build.
- Se o login com Google for rejeitado (e-mail sem acesso), a página mostra uma mensagem de erro lendo `?error=` da URL (antes esse caso não tinha nenhum feedback visual).

## 2026-07-20 (cargo por pessoa + gestão de equipe em Configurações)

- Novo campo `cargo` (texto livre) no `model User` (`prisma/schema.prisma`) — só um rótulo de exibição, não é permissão/enum.
- `POST /api/users` (criar membro), `PATCH /api/users/[id]` (editar nome/cargo) e `DELETE /api/users/[id]` (remover) — todos autenticados por sessão. O `DELETE` primeiro conta `Task` (assigneeId/createdById), `TaskComment` e `Tratativa` vinculados à pessoa e bloqueia com 409 se houver algo pendente, porque essas relações não têm `onDelete: Cascade` e o Postgres rejeitaria a exclusão de qualquer jeito — preferimos um erro claro explicando o que precisa ser reatribuído.
- Nova seção "Equipe" em `/settings`: lista quem faz parte do squad, cargo editável inline, remover com confirmação inline (sem modal novo), formulário pra adicionar gente nova.
- Importante: login com Google só é liberado (`src/lib/auth.ts`, callback `signIn`) se o e-mail já existir em `User` — "adicionar" alguém na equipe é o que cria essa linha antes da pessoa tentar logar.
- Mudança real de equipe aplicada: **Humberto saiu** (conta excluída — verificado antes que ele tinha zero tarefas/comentários/tratativas vinculados, exclusão seguro) e **Tainara Konzen** entrou (analista financeira, `tainara.konzen@o2inc.com.br` — provavelmente a mesma colega do workflow n8n conectado antes). Cargos: Felipe = Estagiário F&P, Gustavo = CFO, Tainara = Analista Financeira.

## 2026-07-20 (workflow n8n como fonte de sugestões)

- Novo modelo `ExternalSuggestion` (`prisma/schema.prisma`): sugestão de tarefa vinda de fonte externa, sem depender de `MeetRecap` (diferente da `RecapSuggestion`, que é 1:1 amarrada a um recap).
- `POST /api/webhooks/n8n`: recebe os itens do workflow n8n de uma colega de squad (que hoje só mandam pra uma lista no Slack), autenticado por `N8N_WEBHOOK_SECRET` (mesmo padrão Bearer do `CRON_SECRET` em `/api/cron/[job]`). Cria uma `ExternalSuggestion` pendente por item — não vira tarefa direto.
- `GET /api/suggestions/external` e `PATCH /api/suggestions/external/[id]`: leitura/descarte da sugestão, autenticados por sessão (mesmo contrato do fluxo de Meet Recap).
- `POST /api/tasks` aceita `externalSuggestionId` pra vincular a tarefa criada de volta à sugestão (mesmo mecanismo do `recapSuggestionId`).
- `/sugestoes-ia` unificado: mostra sugestões de Meet Recap e do n8n na mesma lista de revisão, com "Adicionar"/"Descartar" pros dois tipos.
- O workflow do n8n não define responsável (isso continua manual) — ao aceitar, a tarefa cai pra quem clicou "Adicionar" e é reatribuída depois pelo Kanban, como já acontecia.
- `N8N_WEBHOOK_SECRET` precisa ser adicionado nas env vars da Vercel pra funcionar em produção (só existe no `.env` local por enquanto).
- Depois de ver o JSON real do workflow (node `11 | Slack Lists | Build Tasks Payload`): prioridade lá é `P0`/`P1`/`P2`, não `high`/`medium`/`low`. `POST /api/webhooks/n8n` agora normaliza isso (`P0→high`, `P1→medium`, `P2→low`, case-insensitive; valor não reconhecido vira `null`, mesmo fallback que a UI já trata como "média").
- `/sugestoes-ia` mostra o `sourceRef` (referência da reunião de origem, ex. `"O2 Inc. & Cliente — 20/07/2026"`) no lugar do texto genérico "n8n", quando presente — mesmo papel que o `subject` do recap tem pras sugestões de Meet Recap.
- O workflow dela categoriza cada item como `tarefas_internas`/`tarefas_cliente`/`tarefas_bpo` — decidimos aceitar os três tipos como sugestão (não só as internas), porque acompanhar pendência do cliente/BPO também é parte do trabalho do squad (ver playbook CFOaaS); quem revisar em `/sugestoes-ia` descarta o que não for relevante.

## 2026-07-17 (login interativo com efeito "wow")

- Novo componente `LoginFX` (`src/components/LoginFX.tsx`): fundo vivo nas telas de auth — bolhas de oxigênio subindo que desviam do cursor, aurora verde que persegue o mouse com atraso, e clique/toque em qualquer lugar dispara anéis concêntricos verdes se expandindo (eco do logo O2). Canvas com rAF, cap de DPR em 2x e ~70 partículas no máximo; respeita `prefers-reduced-motion` (desliga tudo).
- `TiltCard` (mesmo arquivo): tilt 3D sutil no card conforme a posição do mouse (só pointer de mouse, não touch), com retorno suave ao sair.
- Animações de entrada (`animate-login-enter`, logo → card em sequência) e logo "respirando" (`animate-logo-breathe`) em `globals.css`.
- Aplicado em `/login`, `/forgot-password` e `/reset-password` (compartilham o mesmo visual).
- Escolha do usuário via pergunta: "tudo no máximo" (anéis + partículas + aurora + tilt), calibrado pra não virar poluição visual.

## 2026-07-13 (parabéns no Slack ao concluir tarefa)

- `notifyTaskCompleted` (`src/lib/slack.ts`): manda uma DM no Slack pra quem concluiu a tarefa, parabenizando e citando o nome da tarefa (e o cliente, se tiver).
- Disparado em `PATCH /api/tasks/[id]` sempre que `status` muda de algo diferente de `"done"` para `"done"` — pega os dois caminhos que levam a isso (arrastar no Kanban e marcar como concluída no painel de detalhe), já que os dois passam por essa mesma rota.
- Vai pra quem *marcou* como concluída (`session.user.id`), não necessariamente o responsável original da tarefa — é uma mensagem de reconhecimento pessoal, não uma notificação de mudança de status.
- Se a pessoa não tiver Slack configurado (`slack_user_<id>` no Setting), a função simplesmente não faz nada — mesmo padrão de fallback silencioso já usado em `notifyTaskAssigned`/`notifyUser`.
- Testado enviando uma DM real de teste (mensagem clara "[TESTE]") pro usuário com Slack configurado — confirmado `ok: true` na resposta da API do Slack. Script de teste removido depois.

## 2026-07-13 (logo real da O2 Inc.)

- Novo componente `LogoIcon` (`src/components/LogoIcon.tsx`): ícone SVG vetorial do logo oficial da O2 Inc. (dois anéis concêntricos), recriado a partir do PDF de marca enviado pelo usuário — medi as proporções reais dos anéis em pixels (raio/espessura) pra reproduzir fielmente, não só "parecido".
- Substituiu o texto solto "O2" (sem ícone) em: `Sidebar` (header desktop + barra mobile), `/login`, `/forgot-password`, `/reset-password`. O texto "O2 SQUAD" continua do lado do ícone — não trocamos pelo wordmark completo "O2 INC." porque este é o app do squad, não o institucional.
- `favicon.ico` regerado (16/32/48/256px, PNG-in-ICO) com o mesmo ícone, verde sobre fundo escuro, batendo com o tema dark do app.
- Testado visualmente com Playwright (screenshot real do `/login` e mockup do header do Sidebar) antes de commitar — sem servidor de imagem/conversão de PDF disponível no ambiente (sem poppler/ImageMagick/python), usei `pdfjs-dist` + `@napi-rs/canvas` num projeto node à parte (scratchpad) só pra extrair e medir o logo; nada disso entrou no repo.

## 2026-07-13 (modal de prazo ao adicionar sugestão da IA)

- Novo componente `DeadlineConfirmModal` (`src/components/`): ao clicar em "Adicionar" numa sugestão de tarefa da IA (no botão rápido, sem passar pelo formulário de edição completo), agora abre um modal perguntando se quer definir um prazo antes de confirmar — pré-preenchido com o prazo que a IA sugeriu, se tiver. Deixar em branco = sem prazo.
- Aplicado em `/recaps` e em `/sugestoes-ia` (as duas telas onde dá pra aceitar uma sugestão direto). O fluxo de "editar antes de adicionar" (lápis) não ganhou o modal — já tem o campo de prazo visível ali, seria redundante.
- Se o prazo escolhido no modal for diferente do sugerido pela IA, a sugestão é marcada como `edited` (em vez de `accepted`) — mesma lógica de acurácia já existente.
- O prazo já aparecia automaticamente na mensagem do Slack (`notifyTaskAssigned`, código existente) sempre que a tarefa tem `dueDate` — não precisou mudar nada lá, só garantir que o modal alimenta esse campo corretamente.
- Testado ponta a ponta: sugestão sem prazo original + prazo definido no modal → task criada com o prazo certo, sugestão marcada `edited` e vinculada à task. Dados de teste removidos depois.

## 2026-07-10 (lembretes: filtra Slack)

- Dos 4 lembretes novos, só **Tratativa com prazo vencido** e **Fechamento mensal incompleto** continuam indo pro Slack — decisão do usuário pra reduzir ruído. Onboarding atrasado e sugestões da IA paradas ficam só na notificação in-app (sino). `broadcast`/`notifyOne` em `reminders.ts` ganharam um parâmetro `sendSlack`.

## 2026-07-10 (lembretes proativos)

**4 novos alertas, reaproveitando a infraestrutura de notificação já existente (in-app + Slack):**
- `src/lib/reminders.ts`, plugado no job `deadlines` (mesmo horário dos alertas de prazo de tarefa, 8h/17h):
  - **Onboarding atrasado**: qualquer marco D+2..D+90 (CFO alocado, kickoff, Setup, Diagnóstico, Oxy) que passou do prazo sem a data real preenchida, pra clientes ativos.
  - **Tratativa com prazo vencido**: `dataPrevistaFinalizacao` no passado e status ainda não `concluida`. Se a tratativa tem responsável definido, notifica só ele; sem responsável, notifica todo mundo.
  - **Fechamento mensal incompleto**: perto da virada do mês (dias 25-31 checando o mês corrente, dias 1-5 checando o mês anterior) — se o checklist de `FechamentoMensal` não estiver 100% marcado.
  - **Sugestões da IA paradas**: mais de 3 dias como `pending` sem revisão, um alerta agregado com a contagem.
- Todos usam um dedup por dia (mesmo `type` + `link` não notifica de novo no mesmo dia) — testado rodando o job duas vezes seguidas e confirmando que não duplica.
- Onboarding/Fechamento/Recap-parado notificam todo o squad (broadcast); Tratativa notifica o responsável específico quando definido.
- Testado ponta a ponta: cliente de teste com onboarding 100 dias atrás (6 marcos atrasados → 24 notificações pros 4 usuários), tratativa com e sem responsável (broadcast vs. direcionada), sugestão parada há 4 dias. Dados de teste e notificações removidos depois.

## 2026-07-09 (cron real + Sugestões da IA)

**Bug de infraestrutura corrigido: automação não rodava de verdade em produção:**
- `node-cron` (usado em `src/instrumentation.ts` pra sincronizar Gmail a cada 5 min, calendário a cada 30 min, alertas de prazo, briefing e digest semanal) depende de um processo Node sempre vivo. Na Vercel (serverless), a função "congela" entre requisições — os timers nunca disparavam de verdade em produção. Só funcionava em dev local (`npm run dev`).
- Nova rota protegida `GET /api/cron/[job]` (jobs: `gmail-sync`, `calendar-sync`, `deadlines`, `briefing`, `digest`), autenticada por header `Authorization: Bearer <CRON_SECRET>`.
- Novo workflow `.github/workflows/cron.yml`: como o plano é Vercel Hobby (Cron Jobs nativo só roda 1x/dia), o agendamento real passou a ser o GitHub Actions, batendo nos mesmos horários de antes (gmail a cada 5 min, calendário a cada 30 min, alertas 8h/17h BRT, briefing 18h BRT, digest segunda 8h BRT).
- `instrumentation.ts`: node-cron agora só registra quando `!process.env.VERCEL` (ou seja, só em dev local) — evita rodar (e falhar silenciosamente) em produção.
- **Pendente de configuração pelo usuário:** adicionar `CRON_SECRET` como env var no projeto da Vercel, e como secret do repositório no GitHub (Settings → Secrets and variables → Actions).
- **Nota:** ao testar a rota `/api/cron/gmail-sync` com o secret real, isso disparou uma sincronização de Gmail de verdade (mesmo banco compartilhado dev/prod) — trouxe recaps reais (Bairral, Fismatek) com sugestões de tarefa pendentes reais, sem criar tarefa nenhuma automaticamente (confirma que o fix de duplicação continua valendo). Não foram apagados — ficaram como sugestões reais aguardando revisão.

**Nova página "Sugestões da IA" (`/sugestoes-ia`):**
- Lista plana com todas as sugestões de tarefa ainda pendentes de revisão, de todos os recaps, sem precisar expandir cada recap um por um — pedido do usuário pra facilitar o acesso.
- Cada sugestão mostra o recap de origem (com link pra abrir e editar lá, se precisar) e os botões Adicionar/Descartar.
- Item novo no menu lateral com contador de pendentes (atualiza a cada 60s).

## 2026-07-09 (recaps 2)

- Página `/recaps`: cada recap expandido ganhou o botão "Ver e-mail original", mostrando o corpo bruto do e-mail que a IA analisou pra gerar as sugestões — permite comparar o texto original com o que a IA extraiu antes de aceitar/rejeitar. O campo `body` já vinha da API, só não era exibido.

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
