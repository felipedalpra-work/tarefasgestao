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
   - **URL** — copiar com o `https://` e sem barra no fim:

     ```
     https://tarefasgestao-zeta.vercel.app/api/cron/task-reminders
     ```

     Sem o `https://`, o serviço assume `http://` e leva **308** (o Vercel redireciona
     pra https, e o cron-job.org não segue redirect). Com barra no fim, o Next
     redireciona igual. Nos dois casos o job nunca executa de verdade.
   - **Schedule:** every 5 minutes
   - **Request method:** GET
   - **Time zone:** America/Sao_Paulo (não muda nada num intervalo de 5 min, mas
     deixa o histórico legível)
3. Autenticação: em **Headers**, adicionar

   | Key | Value |
   | --- | --- |
   | `Authorization` | `Bearer <CRON_SECRET>` |

   O `Bearer ` faz parte do valor. O plano gratuito do cron-job.org permite header
   customizado, então é esse o caminho.

   ⚠️ **Deixar o toggle "Requires HTTP authentication" DESLIGADO.** Ele é HTTP Basic
   auth (usuário/senha) e ocupa o mesmo header `Authorization` que a rota precisa —
   ligado, sobrescreve o Bearer e a chamada volta 401.

4. Se algum dia o serviço usado não permitir header customizado, existe o fallback
   de mandar o secret na URL:

   ```
   https://tarefasgestao-zeta.vercel.app/api/cron/task-reminders?key=<CRON_SECRET>
   ```

   Funciona igual, mas o secret aparece no histórico/log do serviço — usar só nesse
   caso.
5. O valor do `<CRON_SECRET>` é o mesmo que já está nas env vars da Vercel (e no
   `.env` local, `Get-Content .env | Select-String CRON_SECRET`). Copiar de lá — não
   precisa criar um novo.

## Como saber se está funcionando

- Usar o botão **TEST RUN** do cron-job.org antes de confiar no agendamento.
- Resposta esperada: `{"ok":true,"job":"task-reminders"}` com HTTP 200.
- HTTP 401 = secret errado, não configurado na Vercel, ou o toggle de Basic auth
  ligado por cima do header (ver aviso acima).
- HTTP 308 = URL sem `https://` ou com barra no fim (ver passo 2). Comprovado:
  `http://` responde 308 com `Location` da URL https completa, barra no fim responde
  308 com `Location: /api/cron/task-reminders`, e a URL correta responde 200.
- O histórico de execuções do próprio cron-job.org mostra os horários reais — é ali
  que se confirma a pontualidade.
- Sinal no app: tarefa com horário marcado pra hoje gera notificação no sino e DM no
  Slack logo depois da hora (uma vez por dia por tarefa).

## Se quiser desligar depois

Pausar o cronjob no serviço. O `task-reminders` continua sendo chamado pelo GitHub
Actions no slot de 5 min (só volta a ser impontual). Nada quebra: o job é idempotente
— rodar de novo não duplica ocorrência de tarefa nem notificação.
