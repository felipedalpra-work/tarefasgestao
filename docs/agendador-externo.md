# Agendador externo pontual (aviso de tarefa no horário)

## Por que existe

O aviso de "hora de fazer a tarefa" (tarefa com **Horário** preenchido, incluindo as
recorrentes tipo "importação toda terça e sexta às 9h") depende de alguém chamar
`/api/cron/task-reminders` de tempo em tempo. Quem faz isso hoje é o
`.github/workflows/cron.yml` (GitHub Actions).

**O problema:** o `schedule` do GitHub Actions não é pontual. Medição real feita em
2026-08-31, nas 20 execuções anteriores deste repositório: intervalos de **7 min a
428 min**, incluindo um buraco de 7 horas de madrugada. Pra sincronizar Gmail isso é
só atraso; pra um aviso "às 9h" isso quebra a utilidade do recurso.

O resto (Gmail, calendário, alertas de prazo, briefing, digest) continua no GitHub
Actions — só o `task-reminders` precisa ser pontual.

## Configuração (uma vez, no cron-job.org)

1. Criar conta gratuita em <https://cron-job.org> (UptimeRobot ou qualquer serviço de
   ping serve igual — o que importa é chamar a URL a cada 5 min).
2. **Create cronjob** com:
   - **URL:** `https://tarefasgestao-zeta.vercel.app/api/cron/task-reminders`
   - **Schedule:** every 5 minutes
   - **Request method:** GET
3. Autenticação — nas opções avançadas, o **jeito preferido** é mandar o header:

   ```
   Authorization: Bearer <CRON_SECRET>
   ```

   Se o plano gratuito não permitir header customizado, usar o secret na URL:

   ```
   https://tarefasgestao-zeta.vercel.app/api/cron/task-reminders?key=<CRON_SECRET>
   ```

   O `?key=` funciona igual, mas o secret aparece no histórico/log do serviço — só
   usar se não tiver header.
4. O valor do `<CRON_SECRET>` é o mesmo que já está nas env vars da Vercel (e no
   `.env` local). Copiar de lá — não precisa criar um novo.

## Como saber se está funcionando

- Resposta esperada: `{"ok":true,"job":"task-reminders"}` com HTTP 200.
- HTTP 401 = secret errado (ou não configurado na Vercel).
- O histórico de execuções do próprio cron-job.org mostra os horários reais — é ali
  que se confirma a pontualidade.
- Sinal no app: tarefa com horário marcado pra hoje gera notificação no sino e DM no
  Slack logo depois da hora (uma vez por dia por tarefa).

## Se quiser desligar depois

Pausar o cronjob no serviço. O `task-reminders` continua sendo chamado pelo GitHub
Actions no slot de 5 min (só volta a ser impontual). Nada quebra: o job é idempotente
— rodar de novo não duplica ocorrência de tarefa nem notificação.
