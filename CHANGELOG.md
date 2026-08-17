# Changelog

Registro manual de mudanças relevantes neste projeto (não é um repositório git, então este arquivo é a fonte de histórico).

Formato de cada entrada: `## AAAA-MM-DD` seguido de bullets curtos descrevendo o que mudou e por quê (quando não for óbvio).

## 2026-08-13 (bateria de regressão completa antes de liberar pra outros squads + correção de robustez)

- Pedido do usuário: rodar testes de verdade garantindo que está tudo certo antes de anunciar a plataforma pros outros squads. Escrita e rodada uma suite de 47 checagens reais contra o servidor (mesmo banco Neon compartilhado dev+prod de sempre — não existe um Postgres local separado neste projeto, confirmado no `.env`), cobrindo tudo que mudou nas últimas etapas: isolamento multi-tenant (2 squads adversariais com cliente de mesmo nome, tarefa, automação — nada vaza entre eles), signup (slugs únicos, squad novo nasce vazio), ciclo de vida completo de convite (criar → aceitar por link → reenviar invalidando o token antigo → sobreviver à remoção do membro), as 13 restrições admin-only (excluir cliente, controlar automação, remover/promover gente, todas as configs de squad), webhook do n8n resolvendo por secret, e o onboarding (nasce pendente, aparece, conclui, some). Todas as 47 passaram. Squads/usuários de teste removidos depois — confirmado que só sobraram os 3 squads reais (O2, CFO partners, Squadito).
- **Achado durante o teste, corrigido**: 6 páginas (`dashboard`, `week`, `tratativas`, `clientes`, `calendar`, `equipe`) confiavam que o layout já tinha barrado sessão nula (`session!.user...`, non-null assertion) em vez de checar explicitamente — sob certas condições de renderização do Next 16, isso gerava um erro feio no log do servidor pra requisição sem sessão (o redirect pro `/login` ainda acontecia certo no final, mas com um `TypeError` sujando o log no meio do caminho). Todas as 6 ganharam a checagem explícita `if (!session) redirect("/login")`, mesmo padrão já usado no layout.
- **Veredito**: pode liberar pros outros squads — nenhuma falha de isolamento, permissão ou fluxo encontrada.

## 2026-08-13 (onboarding animado no primeiro login — fecha o plano de 5 etapas)

- Última etapa do plano: nada guiava quem acabou de criar o squad (ou acabou de aceitar um convite) a configurar o essencial — a pessoa caía direto no dashboard vazio.
- **`User` ganhou `onboardingCompletedAt`** (nullable, `db push` aditivo) — `null` = ainda não viu. **Backfill obrigatório** rodado antes de ligar: todo usuário já existente (não só os 3 da O2 — também squads reais que já se cadastraram sozinhos via `/signup` desde que a plataforma virou multi-tenant) foi marcado como já onboarded, pra ninguém ver o modal aparecer do nada num login normal.
- **Novo `<OnboardingGate>`** (`src/components/OnboardingGate.tsx`), plugado no layout autenticado ao lado do `Toaster`/`AiAssistant` — reaproveita a mesma identidade visual do login/signup (`LoginFX`, `TiltCard`, `animate-login-enter`/`animate-fade-in`), sem inventar nenhum efeito novo. Wizard curto com indicador de progresso:
  - Todo mundo: boas-vindas → conectar Google → concluído.
  - Só admin (quem cria o squad): mais 2 passos — Slack (bot token opcional) e um aviso sobre Meet Recap/Minuta de cobrança/n8n, que ficam pra configurar depois em Configurações.
  - **Todo passo é pulável** ("Pular tudo" sempre visível) — nunca bloqueia o resto do app. O progresso persiste em `localStorage` só pra sobreviver ao redirect de "Conectar Google" (senão voltava sempre pro passo 1).
  - `PATCH /api/users/me/onboarding` (novo) marca como concluído — usado tanto ao terminar quanto ao pular.
- **Validado com 7 checagens reais**: usuário novo (signup e convite) nasce sem `onboardingCompletedAt`; a primeira página autenticada já mostra o modal (confirmado no HTML renderizado no servidor); concluir via PATCH grava no banco e a mesma página deixa de mostrar o modal na visita seguinte; e os usuários que já existiam (O2 + squads que já tinham se cadastrado) continuam com o campo preenchido pelo backfill, sem ver nada surgir do nada.
- Nota técnica: mesmo ajuste de "reiniciar o servidor de dev depois de `db push` + `prisma generate`" que apareceu na etapa de convites — o processo já rodando mantinha o Prisma Client antigo em memória.

## 2026-08-13 (histórico de convites: pendente/aceito/expirado + reenviar)

- Quarta etapa do plano: não havia nenhum jeito de saber quem foi convidado e ainda não aceitou, nem de reenviar um convite. O link só aparecia uma vez, na hora, e sumia se a página fosse recarregada.
- **Novo model `Invite`** (`prisma/schema.prisma`, `db push` aditivo), de propósito **sem relação com `User`** — diferente do antigo `PasswordResetToken` (que cascade-deletava junto quando o membro era removido), o histórico de convite agora sobrevive mesmo que a pessoa seja removida do squad depois.
- `POST /api/users` (convidar membro) passa a criar um `Invite` em vez de reaproveitar a tabela do "esqueci minha senha". `POST /api/auth/reset-password` (mesma URL/página de sempre) checa `Invite` primeiro e cai no fluxo antigo se não achar — nada mudou pra quem só está redefinindo a própria senha.
- **Aceite via Google também passa a contar**: antes, entrar direto com Google nunca "batia" em token nenhum — a pessoa ficava para sempre como pendente mesmo já usando a plataforma normalmente. Agora o callback `signIn` (`src/lib/auth.ts`) marca o convite como aceito nesse caminho também.
- **Nova sub-aba "Convites"** em `/equipe` (admin-only): lista com badge de status (Aceito/Pendente/Expirado), quem convidou, quando, e um botão **Reenviar** — gera um token novo (invalida o anterior) e reenvia por Slack se já tiver o Slack ID salvo pra essa pessoa.
- **Validado com bateria completa contra o servidor real** (18 checagens): convite cria `Invite` (não mais `PasswordResetToken`); aparece pendente em `GET /api/invites`; aceitar via link marca `acceptedAt` e a pessoa loga no squad certo; a mesma marcação funciona pro caminho de aceite via Google; reenviar invalida o token antigo e o novo funciona; e o convite **sobrevive** à remoção do membro (não cascateia mais). Dados de teste removidos depois.
- Nota técnica: o `prisma db push` só atualiza o banco — o processo do servidor já rodando continuava com o Prisma Client antigo em memória (sem o model `Invite`) até reiniciar. Servidor de desenvolvimento reiniciado pra pegar o client novo antes de validar.

## 2026-08-13 (referência de permissões em Equipe)

- Terceira etapa do plano: nenhum lugar do app explicava, de forma direta, o que Admin pode fazer que Membro não pode.
- Nova sub-aba **"Permissões"** em `/equipe` (ao lado de Organograma/Membros): duas listas — o que é admin-only (convidar/remover/promover membro, configurar Slack/Meet Recap/n8n/Minuta de cobrança, excluir cliente, controlar automação) e o que qualquer membro já faz normalmente (tarefas, clientes, tratativas, sugestões da IA, assistente, próprio cargo). É documentação viva da regra — não vem do banco, não é uma permissão configurável nova (mantém os 2 níveis Admin/Membro já decididos).
- Validado: typecheck/lint limpos, aba aparece na tela de um squad de teste real.

## 2026-08-13 (Configurações em abas + corrige controles que falhavam silenciosamente pra membro)

- Segunda etapa do plano: usuário achou `/settings` confusa — tudo empilhado numa pilha vertical só, sem separação clara entre o que é pessoal, do squad, ou do Slack.
- **Três abas** (mesmo padrão pílula já usado em `/equipe` e `/sugestoes-ia`): "Perfil" (perfil + conexão Google, pessoal), "Squad" (Meet Recaps, Minuta de cobrança, n8n — tudo squad-wide), "Slack" (bot token, Slack ID por membro, notificações por tipo). Nenhuma rota de API nova, só reorganização visual.
- **Corrigida uma inconsistência de UX** encontrada na auditoria da etapa anterior: os controles de Meet Recap/Slack/Notificações continuavam clicáveis pra membro comum, mas a API já rejeitava com 403 — a pessoa preenchia, clicava salvar, e só recebia um erro genérico sem entender por quê. Agora esses controles vêm `disabled` com a mesma frase que "Minuta de cobrança" já usava ("Só admin do squad pode alterar/configurar"), consistente em toda a tela.
- Validado: typecheck/lint limpos, e um teste real contra o servidor confirmando que as 3 abas aparecem pra um squad de teste.

## 2026-08-13 (fecha 2 buracos reais de permissão: excluir cliente e controlar automação)

- Primeira etapa de um plano maior pedido pelo usuário (histórico de convites, permissões mais claras, Configurações reorganizada, onboarding animado). Auditoria completa de tudo que é `isAdmin` hoje encontrou 2 ações destrutivas/operacionais liberadas pra qualquer membro do squad, quando deveriam ser só do admin (mesmo nível de "remover membro", que já é admin-only).
- **`DELETE /api/clients/[name]`** (excluir cliente inteiro, com cascade de tarefas/reuniões/recaps/tratativas — irreversível) agora exige admin. Botão "Excluir cliente" só aparece na tela pra quem é admin.
- **`POST /api/automations/[id]/commands`** (rodar agora/pausar/reativar automação) agora exige admin. Pra quem não é admin, os botões da tela `/automacoes` viram um texto "Só admin controla".
- `ClientLogin` (empresa/ERP/modo de acesso do cliente) foi avaliado e decidido **não** entrar como gap — são campos descritivos, não credenciais reais, então continuam editáveis por qualquer membro.
- Validado contra o servidor real: squad de teste com 1 admin + 1 membro comum, confirmado que o membro recebe 403 nas duas ações e o admin consegue as duas. Dados de teste removidos depois.

## 2026-08-13 (corrige sessão travada com perfil desatualizado — botão "Adicionar" sumia)

- Usuário relatou: na aba Equipe → Membros, o botão de adicionar membro não aparecia — só via os 3 membros já existentes, sem opção de colocar mais (mesmo sendo admin de verdade no banco).
- **Causa raiz**: `src/lib/auth.ts`, callback `jwt` — `token.squadId`/`token.role` só eram gravados no token dentro do `if (user)`, bloco que só roda no exato momento do login. Depois disso, a sessão (cookie JWT) nunca mais atualizava esses dois campos — ficava para sempre com o valor de quando a pessoa logou. Quem estava com sessão aberta desde antes de "role" existir (ou desde antes de virar admin) ficava com `role` desatualizado ou ausente até deslogar e logar de novo — e o botão "Adicionar" é justamente `{isAdmin && (...)}`.
- Bug irmão, mais sério: mudar o perfil de alguém em Equipe → Membros também não tinha efeito nenhum na sessão já aberta dessa pessoa — ela continuaria (ou deixaria de) ver os controles de admin só depois de deslogar/logar.
- **Corrigido**: o callback `jwt` agora busca squadId/role do banco em toda chamada (não só no login), usando o `id` do usuário já salvo no token. Uma sessão aberta passa a refletir mudança de perfil na próxima requisição, sem precisar deslogar.
- **Validado com um teste que prova exatamente o cenário do bug**: logou, confirmou `role: admin` na sessão, mudou o role pra "member" direto no banco (simulando outra pessoa alterando o perfil), conferiu que a MESMA sessão (sem novo login) já refletia `role: member` na chamada seguinte — e voltou a refletir "admin" ao reverter. Squad de teste removido depois.
- Quem já estava com a plataforma aberta deve ver o botão "Adicionar" aparecer sozinho na próxima navegação — não precisa deslogar.

## 2026-08-13 (ajustes na aba Equipe: mais visível + organograma só de visualização)

- Dois ajustes pedidos pelo usuário logo depois da aba Equipe entrar no ar: (1) o item "Equipe" estava escondido dentro do grupo recolhível "Sistema" no menu; (2) não queria a ação de adicionar pessoa embutida direto no organograma.
- **"Equipe" virou item de topo no menu lateral**, ao lado de "Dashboard" — sempre visível, sem precisar abrir nenhum grupo.
- **`/equipe` agora tem duas sub-abas**: "Organograma" (só visualização — clicar num card mostra nome/cargo/perfil num painel de leitura, sem nenhum controle de edição, sem o botão de adicionar que existia antes) e "Membros" (toda a gestão: cargo editável, perfil Admin/Membro, remover, formulário de adicionar com o link de convite — o que antes estava misturado no organograma).
- Validado contra o servidor real: as duas abas renderizam, o link "Equipe" aparece fora do grupo "Sistema" no menu.

## 2026-08-13 (nova aba Equipe com organograma visual)

- Pedido do usuário: a gestão de equipe vivia espremida dentro de Configurações — queria uma aba própria, com organograma visual e interativo.
- **Nova página `/equipe`** (item novo no menu lateral, grupo "Sistema"): organograma com admins numa fileira no topo (marcados com uma coroa) e membros embaixo, conectados por linhas — usa o componente `UserAvatar` já existente (foto do Google quando tem, senão inicial colorida). Clicar num card abre um painel de detalhe/edição embaixo (cargo, perfil Admin/Membro, remover — mesmas regras de permissão de antes: cargo qualquer um edita, perfil e remoção só admin). Um card tracejado "Adicionar" (só admin vê) abre o mesmo formulário de convite de sempre (nome/email/cargo/perfil/Slack ID + link de convite depois de criar).
- **Removido de Configurações**: a seção "Equipe" saiu de lá inteira (estado, funções e JSX) — a gestão de time agora mora só em `/equipe`. O resto de Configurações (Google, Meet Recap, Minuta de cobrança, n8n, Slack) não mudou nada.
- Nenhuma rota de API nova nem mudança de permissão — reaproveita exatamente `GET /api/users`, `POST /api/users`, `PATCH/DELETE /api/users/[id]` e `GET /api/settings/slack` que já existiam.
- **Validado**: typecheck/lint limpos; teste real contra o servidor (squad de teste, admin + membro adicionados pela API de verdade) confirmando que a página renderiza com os dados certos (nomes, cargo) e que Configurações continua funcionando sem a seção removida. Layout visual (linhas do organograma, hover, expandir painel) não foi conferido num navegador de verdade — só o HTML gerado no servidor — vale um olhar visual rápido.

## 2026-08-13 (corrige link de convite quebrado em produção + convite passa a ir pelo Slack)

- Usuário reportou que o link de convite (feature de mais cedo hoje) abria `undefined/reset-password?token=...` em produção — página de erro, e o email nem chegava.
- **Causa raiz**: `POST /api/users` (e, descoberto de quebra, o `forgot-password` também, mesmo bug, pré-existente) montava a URL com `process.env.NEXTAUTH_URL` direto — essa variável não está configurada na Vercel, então virava literalmente a string `"undefined"` na frente da URL. Já existia um helper certo pra isso (`src/lib/base-url.ts`, `getBaseUrl()` — usado nos links de Slack de tarefa/comentário/digest) com fallback automático pras variáveis que a própria Vercel injeta (`VERCEL_URL`/`VERCEL_PROJECT_PRODUCTION_URL`), sem precisar configurar nada a mais. Os dois pontos passaram a usar esse helper.
- **Convite deixou de ir por email, passa a ir por DM do Slack**: a pedido do usuário (email não é confiável pra isso). Novo campo "Slack ID" no formulário de "Adicionar membro" (só aparece se o squad já tem o Slack configurado) — preenchendo, o convite (link + contexto de quem convidou/squad) é mandado direto por DM assim que o membro é criado, e o Slack User ID já fica salvo pra esse membro (mesma Setting usada pelas notificações de tarefa — não precisa configurar de novo depois em Integração Slack). `sendInviteEmail` (código de mais cedo hoje) foi removido — não estava sendo usado mais.
- O link de convite (com botão de copiar) continua sempre aparecendo na tela, independente do Slack — cobre o caso de squad sem Slack configurado, ou de a DM falhar (token inválido etc., sem quebrar o convite em si).
- **Validado contra o servidor real**: confirmado que a URL gerada não contém mais `"undefined"`; convite sem Slack configurado não tenta nada (`slackSent: false` sem erro); convite com Slack ID mas bot token inválido tenta a DM, falha graciosamente (Slack rejeita o token) sem quebrar a criação do membro, e mesmo assim persiste o mapeamento `slack_user_<id>`; fluxo completo de convite → definir senha → login → sessão com o squad certo continua funcionando ponta a ponta. Dados de teste removidos depois.

## 2026-08-13 (link de convite pro membro novo entrar no squad)

- Bug relatado pelo usuário: "Adicionar membro" em Configurações → Equipe criava o `User` na base, mas não mostrava nada pro admin copiar/mandar pra pessoa — o único jeito de entrar era ela ter Google com aquele e-mail exato, e alguém avisar por fora do sistema (Slack, WhatsApp) que a conta existia. Não tinha link, não tinha senha, não tinha aviso automático nenhum.
- **`POST /api/users` agora gera um link de convite de verdade**: reaproveitado o mesmo mecanismo já existente do "esqueci minha senha" (`PasswordResetToken` — token aleatório, só o hash SHA-256 é salvo, expira, é de uso único), só que com validade de 7 dias em vez de 1h (convite de time não é tão urgente quanto redefinir senha). O link (`/reset-password?token=...`) deixa a pessoa definir a própria senha e entrar por credenciais — sem depender de Google.
- **Duas formas de chegar até a pessoa**: (1) email automático (`sendInviteEmail`, novo, em `src/lib/email.ts`, reaproveitando o template/Resend que já existia) mencionando o squad e quem convidou; (2) o link também volta na resposta da API e agora aparece na própria tela de Configurações, num campo com botão de copiar — pra quem preferir mandar por outro canal, ou se o email falhar (a UI avisa quando isso acontece, sem quebrar o fluxo — o membro já foi criado de qualquer forma).
- Continua funcionando o Google também: quem já tem conta Google com aquele e-mail pode entrar direto por ali, sem precisar do link (mecanismo antigo inalterado).
- **Validado fim-a-fim contra o servidor real**: criado um squad de teste com admin, admin convidou um membro pela API de verdade, extraído o token do `inviteUrl` retornado, chamado `/api/auth/reset-password` com esse token pra definir senha, login com email+senha nova — sessão resultante confirmada com o **mesmo `squadId` do admin** que convidou (não um squad novo) e `role: "member"`. Squad e usuários de teste removidos depois.

## 2026-08-13 (n8n e minuta de cobrança por squad — fecha o resto do plano multi-tenant)

- Última pendência do plano multi-tenant: as duas integrações que ainda resolviam pra um squad fixo (a O2), sem jeito de outro squad configurar as próprias.
- **Secret do webhook n8n por squad** (`src/lib/settings.ts`): antes era 1 secret global (`N8N_WEBHOOK_SECRET`) e a rota resolvia sempre pro squad "o2-inc" hardcoded. Agora cada squad gera o próprio secret em Configurações (só admin vê/gera — é uma credencial, não uma preferência) e a rota `/api/webhooks/n8n` (mesma URL de sempre, não precisou mudar o que o n8n chama) descobre de qual squad é a chamada pelo próprio secret recebido, em vez de olhar a URL. Botão "Gerar novo secret" com confirmação (invalida o anterior — quem já configurou precisa atualizar o header no workflow).
- **Dono da minuta de cobrança por squad**: `gmail-draft.ts` tinha um e-mail fixo no código (`felipe.dalpra@o2inc.com.br`) como quem recebe o rascunho de cobrança de tarefa vencida do cliente. Virou uma `Setting` por squad (mesmo padrão do "conta Gmail do Meet Recap"), configurável em Configurações → Minuta de cobrança, com um `<select>` dos membros do squad. Sem ninguém selecionado, o recurso fica desligado (antes era sempre ligado pro Felipe) — não dá pra adivinhar um dono padrão razoável pra um squad novo.
- **Achado durante essa etapa, não coberto na migração anterior**: `src/lib/deadline-check.ts` (`checkDeadlines`/`checkClientTasksOverdue`, rodado pelo cron `/api/cron/[job]` a cada dia) ainda usava `prisma` cru, sem squad nenhum — buscava tarefa vencida **do banco inteiro**. Virou "for each squad" (mesmo padrão de `reminders.ts`/`weekly-digest.ts`), e o botão manual "Verificar prazos" (`/api/tasks/deadline-check`) passou a escopar só pro squad de quem clicou — sem isso, um membro de outro squad conseguiria disparar e-mail de prazo e rascunho de cobrança usando dado de squad alheio.
- **Validado com dados sintéticos reais**: 2 squads de teste, cada um com secret n8n próprio — confirmado que o webhook resolve pro squad certo por secret (não por URL), que secret inválido é rejeitado, que a sugestão de cada squad só aparece pra ele, e que o dono de minuta de um squad não "vaza" pro outro mesmo tentando usar o `userId` errado sob a squadId errada (lookup `{id, squadId}` retorna null). Confirmado também que o secret e o dono de minuta da O2 continuam exatamente iguais a antes (backfill preservou o valor do env var atual e o e-mail do Felipe) — a integração real não foi interrompida.

## 2026-08-13 (cadastro público de squad + perfil Admin/Membro)

- Continuação da fundação multi-tenant de mais cedo hoje: agora qualquer squad de CFOaaS consegue criar a própria conta sozinho, sem precisar que a O2 crie manualmente.
- **`/signup`**: tela pública (mesmo visual de `/login`) — nome do squad, nome/email/senha de quem está criando. `POST /api/auth/signup` cria `Squad` + `User` (`role: "admin"`) numa transação só, slug gerado a partir do nome do squad com desempate automático em caso de colisão. Sem verificação de email (mesmo padrão informal já usado no convite de membro). Login automático logo depois de criar a conta, cai direto no dashboard. Link "Criar squad" adicionado no rodapé de `/login`.
- **Seletor de perfil em Configurações → Equipe**: quem é admin agora vê um `<select>` Admin/Membro em cada linha de membro do time (a API `/api/users/[id]` já aceitava `role` desde a etapa anterior, só faltava a UI) e escolhe o perfil de quem está convidando. Quem é membro comum não vê o formulário de convite nem o botão de remover — só visualiza o perfil de cada colega, sem poder mexer.
- **Validado fim-a-fim contra o banco real** (não só typecheck): criado um squad de teste via `curl` direto na API de cadastro, login com as credenciais recém-criadas confirmado (fluxo padrão de CSRF do NextAuth), sessão resultante conferida (`squadId`/`role: "admin"` corretos e diferentes do squad da O2), e confirmado que esse squad novo vê zero tarefas/clientes/resultados de busca mesmo com a O2 tendo dado real no banco — prova de isolamento igual à da etapa anterior, agora pelo fluxo de cadastro de verdade. Squad e usuário de teste removidos depois.
- Ainda pendente (próxima etapa, não incluída aqui): secret do n8n por squad (hoje ainda resolve só pro squad da O2) e o email dono da minuta de cobrança (`gmail-draft.ts`) virar configuração por squad em vez de hardcoded.

## 2026-08-13 (fundação multi-tenant: cada squad, seus próprios dados)

- Início da transformação da plataforma de "app da O2" pra "plataforma que qualquer squad de CFOaaS pode usar" — squad próprio, admin (CFO), time convidado, dados isolados. Essa entrada cobre a fundação (schema + motor de isolamento + migração de todas as rotas); o cadastro público (`/signup`) e o seletor de perfil na tela de convite ficam pra próxima etapa — a API já aceita `role`, só falta a UI.
- **Novo model `Squad`** (id, name, slug) + `squadId` em todo model de negócio (Task, ClientNote, ClientLogin, SetupMeeting, Tratativa, MeetRecap, ExternalSuggestion, CalendarEvent, FechamentoMensal, Automation, Notification, Setting) + `User.squadId`/`User.role` ("admin" | "member"). Unicidades que eram globais (nome de cliente, `Setting.key`, `Automation.key`, `gmailId`, `googleId`, etc.) viraram compostas com `squadId` — sem isso, dois squads não conseguiriam ter cliente com o mesmo nome, por exemplo.
- **Migração dos dados existentes**: criado o squad "O2 Inc.", todas as ~1000 linhas existentes (23→59 tasks reais desde então, 43 recaps, 668 notifications, etc.) foram preenchidas com esse squadId num script de backfill, com verificação de 100% de cobertura antes de tornar a coluna obrigatória. Todo mundo que já tinha acesso (Felipe, Gustavo, Tainara) virou `role: "admin"` — ninguém perde acesso que já tinha; squads novos criados depois terão só 1 admin (quem cria) por padrão.
- **Motor de isolamento** (`src/lib/tenant-prisma.ts`): em vez de confiar em cada rota lembrar de filtrar por squad manualmente, um Prisma Client Extension injeta `squadId` automaticamente em toda leitura/escrita dos models de negócio — `forSquad(squadId)` devolve um client já escopado. Confirmado direto contra o banco antes de generalizar: `findUnique`/`update`/`delete` com ID de outro squad retornam null / "record not found" em vez de vazar ou alterar a linha errada.
- **Sessão ganhou squad/role**: `src/lib/auth.ts` agora carrega `squadId`/`role` do banco pro JWT/sessão (mesmo padrão já usado pro `user.id`). Novo `src/lib/authz.ts` (`isAdmin`) protege rotas de configuração do squad (convidar/remover membro, Slack, Gmail, notificações) — só admin mexe, membro comum não.
- **~60 arquivos migrados** pro client escopado (rotas de tarefas/clientes/recaps/tratativas/sugestões, `src/lib/queries.ts` — as 8 queries cacheadas —, Slack, Settings, jobs de cron). Durante a migração, a checagem de tipo (não só busca de texto) revelou vários pontos que **compilavam mas vazariam dado entre squads silenciosamente** — rotas que buscavam Subtask/TaskLink/TaskActivity/RecapSuggestion só por `taskId`/`recapId` sem confirmar que a Task/Recap pai era do squad certo (`/api/tasks/[id]/subtasks`, `/links`, `/activity`, `/api/recaps/[id]/process`, `/api/recaps/[id]/suggestions/[id]`), e rotas de listagem que buscavam tudo sem filtro nenhum (`/api/recaps`, `/api/search`, `/api/suggestions/external`, `/api/calendar/[id]`, `/api/automations/*`). Todas corrigidas. `/api/logs` nem tinha checagem de autenticação — corrigido também.
- **Jobs de cron viram "for each squad"**: `checkAllReminders`, `sendWeeklyDigest` passam a iterar todos os squads e escopar cada checagem/notificação; `syncUserGmail`/`syncCalendarForUser` resolvem o squad da própria conta Google sendo sincronizada; `sendMeetingBriefings` resolve o squad de cada reunião. Três pontos que eram vazamento de confidencialidade de verdade (não só falta de filtro) e foram corrigidos: os poucos-exemplos do prompt de IA em `process-recap.ts` (puxavam sugestões aceitas/rejeitadas de qualquer squad), o dedup em `duplicate-detection.ts` (comparava tarefas/sugestões de todo mundo) e as 7 ferramentas do assistente de IA em `assistant-tools.ts` (respondia com dado de qualquer squad).
- **Automações continuam só da O2** (decisão do produto — não é recurso genérico ainda): `ensureKnownAutomations` e o webhook de report resolvem explicitamente o squad "O2 Inc." pelo slug.
- **n8n** (`/api/webhooks/n8n`) por enquanto também resolve só pro squad da O2 — precisa de secret/rota por squad antes de outro squad configurar isso (marcado com TODO no código, é a próxima etapa de integração).
- **Validado com dados sintéticos reais** (não só typecheck): criados 2 squads de teste com o MESMO nome de cliente (o caso mais perigoso, já que isso só passou a ser permitido agora) — confirmado que cada squad só vê/edita seus próprios dados, que `findUnique`/`update` por ID de outro squad falha, e que `create` injeta o squadId certo automaticamente. Dados de teste removidos depois.
- **Achado durante a própria validação**: o primeiro `prisma db push` (tornando squadId obrigatório) não incluiu a troca das constraints únicas — rodei de novo com as constraints compostas depois de confirmar (com uma query direta) que não havia nenhuma combinação duplicada que impedisse a migração.

## 2026-08-13 (memória do assistente de IA + tratamento de limite diário do Groq)

- Pedido do usuário: o assistente lembrar de interações passadas quando for relevante, em vez de esquecer tudo ao recarregar a página.
- Novo modelo `AssistantMessage` (por pessoa, não por squad todo) guarda cada mensagem trocada. `GET /api/assistant/messages` carrega o histórico quando o painel abre; `DELETE` limpa (botão "Nova conversa" no cabeçalho, só aparece quando já tem conversa). `POST /api/assistant/chat` mudou de contrato: em vez do cliente mandar a conversa inteira toda vez, agora manda só a mensagem nova (`{message}`) — o servidor busca as últimas `ASSISTANT_HISTORY_LIMIT` (30) trocas dessa pessoa no banco, monta o contexto e já salva os dois lados da troca.
- Aplicado com `prisma db push` (tabela nova, aditivo — não mexe em nada existente).
- Durante a validação (rodando pergunta real contra o Groq), apareceu um problema de infraestrutura, não de código: a conta Groq tem cota diária de 100.000 tokens, **compartilhada** entre a extração de Meet Recaps e esse assistente novo — toda a bateria de testes desse recurso consumiu a cota do dia, e passou a estourar limite (429). Antes disso quebrava com "Erro ao consultar o assistente." sem explicação; agora detecta `RateLimitError` especificamente (sem tentar de novo à toa, já que ia bater no mesmo limite) e responde algo claro: "Bati no limite diário de uso da IA (cota compartilhada com a extração dos Meet Recaps) — tenta de novo daqui a pouco." Se o assistente for usado com frequência, vale considerar upgrade do plano Groq (Dev Tier) — hoje as duas features dividem a mesma cota.
- Validado: persistência (grava/lê/limpa) confirmada direto contra o banco real; o próprio limite de cota serviu de teste real do tratamento de erro novo. A semântica de "lembrar quando relevante" já tinha sido confirmada num teste anterior (pergunta com pronome referenciando o turno anterior) — o mecanismo é o mesmo, só a origem do histórico mudou de client-side pra banco.

## 2026-08-13 (correção do assistente de IA: saudação e erro de tipo em ferramenta)

- Bug relatado pelo usuário logo após o lançamento: dizer só "ola" fazia o assistente despejar um raio-x inteiro de urgências (deveria só cumprimentar de volta), e a pergunta "quem realizou mais tarefas?" retornava "Erro ao consultar o assistente."
- Causa do erro: o Groq validou a chamada de `search_tasks` e **rejeitou a resposta inteira** (400) porque o modelo mandou `"limit": "100"` (string) onde o schema pedia número — isso derrubava a conversa toda, sem nenhuma pista pro usuário do que aconteceu. Confirmado direto no `PlatformLog` (categoria `ai-assistant`).
- Corrigido em duas camadas: (1) `limit` e `days` agora aceitam number OU string no schema das ferramentas (`type: ["number", "string"]`), e o código sempre converte com `Number(...)` antes de usar — não confia mais no tipo que o modelo mandou; (2) a chamada ao Groq ganhou um fallback: se a validação de ferramenta falhar mesmo assim, tenta de novo sem ferramentas (resposta só em texto) em vez de estourar erro pro usuário.
- Causa da saudação: o prompt dizia pra usar `get_urgent_items` "se a pergunta for genérica" — o modelo interpretou "ola" como genérico. Adicionada regra explícita: saudação/conversa fiada não aciona nenhuma ferramenta, só responde naturalmente.
- Revalidado com as duas perguntas exatas que quebraram — "ola" agora só cumprimenta, e "quem realizou mais tarefas?" responde certo (conferido contra o banco: Felipe 8, Gustavo 3, Tainara 1 tarefas concluídas).

## 2026-08-13 (assistente de IA flutuante)

- Pedido do usuário: um botão no canto inferior direito (ícone da O2) que abre um chat pra perguntar em linguagem natural sobre o que está acontecendo na plataforma, usando o Groq já conectado.
- Escolhida a abordagem de **tool-calling** (em vez de só empilhar um resumo no prompt): o Groq decide sozinho quais dados buscar de acordo com a pergunta, chamando funções que rodam queries reais no Postgres. Escala melhor conforme a base cresce, já que não precisa carregar "tudo" em todo prompt.
- `src/lib/assistant-tools.ts`: 7 ferramentas, todas **somente leitura** de propósito (mesma filosofia das Sugestões da IA — a IA nunca age sozinha, só informa): `get_urgent_items` (tarefas atrasadas, tratativas vencidas, onboarding atrasado, fechamento incompleto, sugestões da IA paradas), `search_tasks`, `get_client_overview`, `list_clients`, `get_upcoming_meetings`, `get_pending_ai_suggestions`, `get_tratativas`.
- `src/app/api/assistant/chat/route.ts`: loop padrão de tool-calling (manda mensagens+ferramentas pro Groq, executa as ferramentas que ele pedir, manda o resultado de volta, repete até ele responder em texto ou até 5 rodadas).
- `src/components/AiAssistant.tsx`: botão flutuante + painel de chat, montado no layout autenticado (`(app)/layout.tsx`) — aparece em qualquer tela logada.
- Durante a validação, achei e corrigi um bug real: buscar cliente sem acento (ex. "cafe arrumado") não achava "Café Arrumado", porque `contains` do Postgres não ignora acento sozinho. Extraí o normalizador de texto (NFD + remove acento) que já existia em `duplicate-detection.ts` pra `src/lib/utils.ts` (`normalizeText`, reaproveitado nos dois lugares) e o assistente passou a resolver o nome "oficial" do cliente comparando contra a carteira em `ClientNote` antes de qualquer busca.
- Validado com perguntas reais direto na API (sessão autenticada): raio-x de urgências, visão de cliente por nome com acento/caixa diferente, cliente inexistente, e uma conversa de 2 turnos com pronome ("e alguma delas tá atrasada?") — todas as respostas conferidas contra o banco real.

## 2026-08-07 (limpeza dos dados de teste)

- A pedido do usuário: saindo da fase de testes, apagadas todas as 23 Tasks (com cascata de 1 subtask, 53 atividades, 1 comentário, 1 link), os 43 MeetRecap (com cascata de 104 RecapSuggestion) e as 164 ExternalSuggestion (n8n) — tudo que alimentava Kanban/Tarefas/Sugestões da IA/Meet Recaps.
- Não tocado: clientes (`ClientNote`, 21), eventos de calendário (`CalendarEvent`, 74), Tratativas, Onboarding, Fechamento, Acessos (Oxy), Automações, Logs e Configurações — só o que foi pedido.
- Backup em JSON de tudo que foi apagado salvo em `backups/` (fora do git, adicionado ao `.gitignore` — contém dado real de cliente) antes de rodar o `deleteMany`, pra dar pra restaurar manualmente se precisar.

## 2026-08-06 (taxa de acerto da IA por cliente)

- Pedido do usuário: a taxa de acerto em `/recaps` era só uma média geral — não dava pra saber em qual cliente a IA erra mais.
- `GET /api/recaps/accuracy` passou a retornar também `byClient`: mesma conta (aceitas/editadas/rejeitadas → % de acerto), agrupada pelo cliente do recap, só com quem já tem pelo menos 1 sugestão avaliada, ordenado do pior acerto pro melhor (quem tem problema aparece primeiro). Sugestão sem cliente identificado entra em "Sem cliente identificado".
- Na tela, um "Ver por cliente" expande a lista embaixo do resumo geral, com cor por faixa (vermelho <50%, amarelo <80%, verde ≥80%).

## 2026-08-06 (dedup no upload manual de transcrição)

- Pedido do usuário: o upload manual (adicionado antes) não tinha proteção contra enviar a mesma transcrição duas vezes — o dedup por `gmailId` do Gmail não existe pra manual, e o cliente só é conhecido depois que a IA já processou, então não dá pra comparar "título+cliente" como o dedup de tarefa faz.
- Nova `findSimilarRecap()` (`src/lib/duplicate-detection.ts`) compara com recaps recentes (qualquer origem) por duas vias: **título** normalizado igual enviado há menos de 7 dias (pega reenvio por engano do mesmo arquivo), ou **conteúdo** muito parecido (similaridade de tokens ≥ 55%) enviado no último mês (pega mesma transcrição com título diferente).
- `POST /api/recaps/upload` roda essa checagem antes de criar o recap (evita gastar chamada de IA à toa); se achar parecido, responde 409 com o motivo. O modal mostra um aviso amarelo com "Enviar mesmo assim" (reenvia com `force: true`, pulando a checagem).
- Validado com 3 cenários sintéticos: título igual → pega; conteúdo igual com título diferente → pega (83% de similaridade); conteúdo sem nada a ver → não pega nada.

## 2026-08-06 (correção da busca global — Cmd+K)

- A busca global (`CommandPalette` + `/api/search`) já existia, mas tinha dois bugs reais, confirmados direto no banco: (1) `contains` do Prisma no Postgres é sensível a maiúsculas/minúsculas por padrão — buscar "bairral" minúsculo não achava o cliente "Bairral"; (2) a lista de clientes da busca só vinha de tarefas/recaps/eventos que já bateram na busca — cliente cadastrado só em `ClientNote` (carteira, sem nenhuma atividade ainda) nunca aparecia. Tinha 14 clientes nessa situação.
- Corrigido: todo `contains` ganhou `mode: "insensitive"`; `ClientNote` virou uma quarta fonte de cliente na busca (mesmas 4 fontes que `/api/clients` já usa). Também troquei o critério de "quais clientes aparecem": agora só entra quem tem o **nome** batendo com o texto buscado, não qualquer cliente que apareceu de carona porque o título de uma tarefa dele bateu por outro motivo.
- Validado direto contra o banco (antes/depois) e depois via `/api/search` com sessão real: "bairral" e "scien" agora acham "Bairral"/"Grupo Bairral" e "Sciensa" corretamente.

## 2026-08-05 (upload manual de transcrição em Meet Recaps)

- Pedido do usuário: nem toda reunião gera um Meet Recap por e-mail (ex.: reunião fora do Google Meet, ou cujo e-mail não chegou/não foi rotulado) — precisava de um jeito de jogar a transcrição na IA do mesmo jeito, sem depender do Gmail.
- Novo botão "Enviar transcrição" em `/recaps`, ao lado de "Sincronizar Gmail". Abre um modal (`UploadRecapModal`) com título da reunião + transcrição (cole o texto ou escolha um arquivo `.txt`, que é lido no navegador e joga o conteúdo na caixa de texto). Ao enviar, `POST /api/recaps/upload` cria o `MeetRecap` (`source: "manual"`) e já roda `processRecap` na hora — mesma extração por IA usada nos recaps do Gmail (mesmo prompt, mesmos poucos-exemplos de acerto/erro, mesma detecção de duplicidade), sem depender do toggle de pausa (que só afeta o processamento em lote do Gmail): quem sobe a transcrição já quer ver o resultado.
- Sugestões geradas caem na mesma tela de revisão do recap (expande automaticamente), com o mesmo editar/aceitar/descartar de sempre — e também aparecem em `/sugestoes-ia`, sem nenhuma mudança lá.
- Schema: `MeetRecap.gmailId` virou opcional (só os sincronizados do Gmail têm; upload manual não tem e-mail de origem) e ganhou `source` ("gmail" | "manual", default "gmail" — os 38 recaps existentes continuam com `gmailId` preenchido e viraram `source: "gmail"` automaticamente) e `uploadedById` (quem enviou, só preenchido no manual). Aplicado com `prisma db push` (aditivo, sem perda de dado — conferido: as 38 linhas existentes mantiveram `gmailId`).
- Validado rodando `processRecap` de verdade contra uma transcrição sintética (via `tsx`, sem precisar do servidor): identificou corretamente 3 tarefas, incluindo responsável e prazo relativo mencionados no texto — mesmo comportamento dos recaps do Gmail. Dados de teste removidos depois.

## 2026-08-05 (Meet Recaps da Tainara não sincronizavam)

- Bug relatado pelo usuário: depois de restringir a sincronização de Meet Recaps a uma única conta (2026-07-30), a conta da Tainara parou de trazer recaps novos — sem erro visível na tela.
- Causa raiz: `syncUserGmail` (`src/lib/gmail-sync.ts`) buscava mensagens com `q: "label:Meet_Recap"` (underscore) — uma string fixa, herdada de quando só a conta do Felipe sincronizava, cujo rótulo no Gmail dele é literalmente `Meet_Recap`. O Gmail não trata separador de nome de rótulo como equivalente entre si na busca por `label:`: uma conta com o rótulo escrito com espaço (`Meet Recap`, o caso da Tainara) só é encontrada com hífen ou aspas (`label:meet-recap` / `label:"Meet Recap"`), nunca com underscore. Resultado: a busca sempre retornava 0 mensagens pra Tainara — nenhuma exceção, nenhum log de erro, só nada sincronizado (por isso parecia "não estar rodando").
- Confirmado direto contra as duas contas reais: `label:Meet_Recap` retorna 201 resultados na caixa do Felipe e 0 na da Tainara; `label:"Meet Recap"` é o inverso.
- Correção: nova `findMeetRecapLabelId()` resolve o rótulo certo por nome normalizado (minúsculo, sem espaço/hífen/underscore) via `gmail.users.labels.list`, e a busca de mensagens passou a usar `labelIds: [id]` em vez de uma string de busca — independe de qual grafia a pessoa usou ao criar o rótulo na própria conta.
- Validado rodando o job real (`GET /api/cron/gmail-sync` local, com `CRON_SECRET`): antes da correção a Tainara sincronizava 0 recaps; depois, 20 recaps novos e reais entraram no banco (de 18 pra 38 registros em `MeetRecap`) na primeira execução.

## 2026-08-03 (aba "Excluídos" nas Sugestões da IA)

- Pedido do usuário: até então, descartar uma sugestão (Meet Recap ou n8n) tirava ela da tela pra sempre (`reject()` só filtrava do estado local) — sem forma de ver o que foi descartado nem de desfazer um descarte por engano.
- As rotas `PATCH /api/recaps/[id]/suggestions/[suggestionId]` e `PATCH /api/suggestions/external/[id]` já aceitavam `status: "rejected"` e até tinham `STATUS_VALUES` prevendo volta pra `"pending"` — só faltava expor isso na UI, nenhuma mudança de backend foi necessária.
- Nova aba "Excluídos" em `/sugestoes-ia`, ao lado de Pendentes/Duplicadas, listando sugestões com `status: "rejected"`. Cada card lá mostra só um botão "Restaurar" (volta pra Pendentes, de onde dá pra editar/adicionar normalmente de novo). `reject()` passou a atualizar o status local em vez de remover a sugestão da lista (`withStatus`), então ela migra de aba na hora sem precisar recarregar.
- Validado com `npx tsc` e `npx eslint` limpos (só o warning pré-existente de `useEffect`/`load()` que já existia antes nesse arquivo).

## 2026-08-03 (filtro "Cliente" no responsável, em Tarefas e Kanban)

- Pedido do usuário: nas telas de Tarefas e Kanban, o filtro de responsável só listava pessoas do squad — não dava pra filtrar as tarefas que o próprio cliente entrega (`deliverTo: "o2"`, sem `assignee`), que hoje só apareciam misturadas com "sem responsável".
- Novo botão "Cliente" (ícone de prédio) ao lado dos avatares de responsável, usando o mesmo padrão de sentinela já existente em Sugestões da IA (`CLIENT_CHOICE`) — aqui como `CLIENT_FILTER_ID = "__client__"`. Em `/tasks` entra no `<select>`/toggle único de responsável; em `/kanban` entra no multi-select de responsáveis (`toggleAssignee`), já que lá dá pra combinar vários.
- `src/app/(app)/tasks/page.tsx`: `matchesPerson()` trata o sentinela como "sem assignee e deliverTo === 'o2'". `src/app/(app)/kanban/page.tsx`: mesma lógica em `matchesAssignee()`, aplicada em `colTasksOf`.
- Validado com `npx tsc` e `npx eslint` limpos (só os warnings pré-existentes de `useEffect`/`load()` já presentes nesses dois arquivos antes desta mudança).

## 2026-07-31 (barra de abas do cliente cortada)

- A barra de 8 abas em `/clientes/[nome]` (Reuniões/Meet Recaps/Tarefas/Onboarding/Tratativas/Fechamento/Oxy/Notas) usava `flex-1` sem `overflow-x-auto` no container — cada aba tenta dividir a largura igualmente, mas não encolhe abaixo do próprio conteúdo (ícone + rótulo + contador), e a página não tinha rolagem horizontal pra sobra. Resultado: cortava.
- `src/app/(app)/clientes/[slug]/ClientTabs.tsx`: cada aba passou de `flex-1` pra `shrink-0 whitespace-nowrap` (fica do tamanho do próprio conteúdo, não estica nem quebra o texto) e o container ganhou `overflow-x-auto` (rola horizontalmente se ainda assim não couber tudo, em vez de cortar).

## 2026-07-30 (botão "Salvar e adicionar" nas Sugestões da IA)

- Editar uma sugestão exigia dois passos: Editar → Salvar → (sair do modo edição) → Adicionar → confirmar prazo num modal separado. Novo botão "Salvar e adicionar" no próprio formulário de edição faz tudo num clique — usa o prazo que acabou de ser editado ali em cima, sem reabrir o modal de confirmação (redundante nesse caso).
- `accept()` (`src/app/(app)/sugestoes-ia/page.tsx`) ganhou um parâmetro opcional (`currentOverride`) pra usar o rascunho recém-editado direto, em vez de reler do estado `overrides` — evitava um bug sutil de state assíncrono (o `setOverrides` do clique não estaria refletido ainda se `accept` lesse do state na mesma função).
- O botão "Salvar" sozinho continua existindo (só comita a edição, sem criar a tarefa ainda) — útil pra quem quer editar várias sugestões antes de decidir quais adicionar.

## 2026-07-30 (desligar notificação do Slack por tipo, em Configurações → Integração Slack)

- A pedido do usuário: cada tipo de notificação do Slack agora liga/desliga independente, em vez de tudo-ou-nada. Lista completa (10 tipos, agrupados em Tarefas / Lembretes automáticos / Resumos): tarefa atribuída, tarefa concluída, lembrete manual ("Lembrar"), menção em comentário, tratativa vencida, onboarding atrasado, fechamento incompleto, sugestões da IA paradas, resumo semanal, briefing de reunião.
- Guardado num JSON só (`notification_slack_prefs` em `Setting`) em vez de uma linha por tipo — mais fácil de adicionar tipo novo depois sem função nova. Cada tipo tem um default que reproduz o comportamento de hoje (ex: fechamento incompleto já nasce desligado, porque foi desligado antes a pedido do usuário) — ligar o painel não muda nada até alguém mexer.
- Desligar um tipo só afeta a mensagem no **Slack** — a notificação in-app (sino) continua normal em todos os casos; isso é intencional, o pedido era especificamente sobre o Slack.
- `notifyTaskReminder` (o botão "Lembrar" manual) retorna um erro explicativo se estiver desligado, em vez de falhar silenciosamente — é uma ação que a pessoa clica de propósito, então precisa saber por que não foi.
- Validado com dados sintéticos direto no banco (liga/desliga um tipo, confere que os outros ficam intactos) e restaurado ao estado original depois.

## 2026-07-30 (Meet Recaps sincronizam só de uma conta Gmail)

- Problema levantado pelo usuário: agora que a Tainara também conectou o Google, `syncAllUsers` (gmail-sync) passou a buscar Meet Recaps na caixa de todo mundo com conta ligada. Um mesmo e-mail de recap (reunião com mais de uma pessoa do squad convidada) chega em cada caixa com `gmailId` diferente — vira dois `MeetRecap` separados pro mesmo encontro, com sugestão de tarefa extraída duas vezes, potencialmente divergente. Gera duplicidade e ruído em `/recaps` e `/sugestoes-ia`.
- Correção: nova configuração "Conta Gmail sincronizada" (Configurações → Meet Recaps (IA)) — quando definida, `syncUserGmail` (`src/lib/gmail-sync.ts`) não faz nada pras demais contas. Sem configurar, mantém o comportamento antigo (sincroniza de todas), mesmo padrão de "ausência de Setting = comportamento histórico" já usado no toggle de sugestões.
- Já apliquei direto no banco (sem esperar o clique na tela): só a conta da Tainara sincroniza Meet Recaps a partir de agora — é quem de fato participa das reuniões de cliente.

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
