export async function register() {
  // node-cron só funciona com um processo Node sempre vivo. Em produção (Vercel),
  // as funções são serverless e ficam "congeladas" entre requisições — os timers
  // do node-cron nunca chegam a disparar de verdade. Lá, quem aciona esses jobs
  // é um agendador externo (GitHub Actions) batendo em /api/cron/[job].
  // Aqui em dev local (processo sempre vivo) o node-cron funciona normalmente.
  if (process.env.NEXT_RUNTIME === "nodejs" && !process.env.VERCEL) {
    const { default: cron } = await import("node-cron");
    const { syncAllUsers } = await import("./lib/gmail-sync");
    const { checkDeadlines } = await import("./lib/deadline-check");
    const { checkAllReminders } = await import("./lib/reminders");
    const { syncAllCalendars } = await import("./lib/calendar-sync");
    const { sendMeetingBriefings } = await import("./lib/meeting-briefing");
    const { sendWeeklyDigest } = await import("./lib/weekly-digest");

    // sincroniza Gmail (Meet_Recap) a cada 5 minutos
    cron.schedule("*/5 * * * *", async () => {
      try { await syncAllUsers(); }
      catch (err) { console.error("[cron] gmail sync:", err); }
    });

    // sincroniza Google Calendar a cada 30 minutos
    cron.schedule("*/30 * * * *", async () => {
      try { await syncAllCalendars(); }
      catch (err) { console.error("[cron] calendar sync:", err); }
    });

    // alertas de prazo (tarefas, onboarding, tratativas, fechamento, sugestões da IA): 8h e 17h
    cron.schedule("0 8 * * *", async () => {
      try { await checkDeadlines(); await checkAllReminders(); }
      catch (err) { console.error("[cron] deadline check 8h:", err); }
    });

    cron.schedule("0 17 * * *", async () => {
      try { await checkDeadlines(); await checkAllReminders(); }
      catch (err) { console.error("[cron] deadline check 17h:", err); }
    });

    // briefing de reunião: todo dia às 18h (avisa sobre reuniões do dia seguinte)
    cron.schedule("0 18 * * *", async () => {
      try {
        await syncAllCalendars(); // garante calendário atualizado
        await sendMeetingBriefings();
      }
      catch (err) { console.error("[cron] meeting briefing:", err); }
    });

    // digest semanal: toda segunda às 8h
    cron.schedule("0 8 * * 1", async () => {
      try { await sendWeeklyDigest(); }
      catch (err) { console.error("[cron] weekly digest:", err); }
    });

    console.log("[cron] ✓ Gmail sync        — a cada 5 min");
    console.log("[cron] ✓ Calendar sync     — a cada 30 min");
    console.log("[cron] ✓ Alertas de prazo  — 8h e 17h");
    console.log("[cron] ✓ Briefing reunião  — 18h (para reuniões do dia seguinte)");
    console.log("[cron] ✓ Digest semanal    — segunda às 8h");
  }
}
