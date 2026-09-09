import { prisma } from "./prisma";
import { forSquad } from "./tenant-prisma";
import { google } from "googleapis";
import { log } from "./logger";

// Cria um evento de verdade no Google Calendar de quem pediu — mesmo padrão de auth do
// sync em calendar-sync.ts (token da própria pessoa, sem service account). É uma ação
// mais sensível que qualquer outra do assistente: aparece na agenda REAL da pessoa, não
// só no espelho interno, e se tiver convidado dispara e-mail de convite de verdade — por
// isso não aceita convidados nesta primeira versão, e é sempre confirmada antes.
//
// A permissão que cobre isso (calendar.events) só existe pra quem RECONECTOU o Google
// depois de 2026-09-08 (era calendar.readonly antes) — accounts antigas não têm o escopo
// e a chamada à API falha com 403/insufficient scope, tratado abaixo com mensagem clara
// em vez de erro cru.

export type CalendarEventInput = {
  title: string;
  client: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM, horário de Brasília
  durationMinutes: number;
  description: string | null;
};

export type CreateEventResult =
  | { ok: true; googleId: string; startAt: Date; endAt: Date }
  | { ok: false; error: string; needsReconnect?: boolean };

export async function createCalendarEvent(userId: string, input: CalendarEventInput): Promise<CreateEventResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { squadId: true, name: true, email: true } });
  if (!user) return { ok: false, error: "Usuário não encontrado." };

  const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
  if (!account?.access_token) {
    return { ok: false, error: "Sua conta Google não está conectada. Entre em Configurações para conectar.", needsReconnect: true };
  }

  const startAt = new Date(`${input.date}T${input.time}:00-03:00`);
  if (isNaN(startAt.getTime())) return { ok: false, error: "Data ou horário inválido." };
  const endAt = new Date(startAt.getTime() + input.durationMinutes * 60000);

  try {
    const oauth2 = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2.setCredentials({ access_token: account.access_token, refresh_token: account.refresh_token ?? undefined });
    const calendar = google.calendar({ version: "v3", auth: oauth2 });

    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody: {
        summary: input.title,
        description: input.description ?? undefined,
        start: { dateTime: startAt.toISOString(), timeZone: "America/Sao_Paulo" },
        end: { dateTime: endAt.toISOString(), timeZone: "America/Sao_Paulo" },
      },
      // sem convidado nesta versão — não manda e-mail de convite pra ninguém
      sendUpdates: "none",
    });

    const googleId = res.data.id;
    if (!googleId) return { ok: false, error: "O Google não devolveu o evento criado." };

    // espelha na hora — sem isso a reunião só apareceria em /calendar depois do próximo
    // sync (calendar-sync roda pelo cron), e a pessoa acabou de pedir "agora"
    const db = forSquad(user.squadId);
    await db.calendarEvent.upsert({
      where: { squadId_googleId: { squadId: user.squadId, googleId } },
      update: { title: input.title, client: input.client ?? "", startAt, endAt, attendeeUserIds: [userId] },
      create: { squadId: user.squadId, googleId, title: input.title, client: input.client ?? "", startAt, endAt, attendeeUserIds: [userId] },
    });

    await log("ai-assistant", `Evento criado no Google Calendar: "${input.title}"`, { detail: `por ${user.name ?? user.email}` });
    return { ok: true, googleId, startAt, endAt };
  } catch (err) {
    const message = String(err);
    // 403/insufficient scope é o sintoma exato de conta ainda não reconectada pro
    // escopo novo — diferencia isso de qualquer outro erro pra dar a instrução certa
    const needsReconnect = /insufficient|403|invalid_grant|insufficientPermissions/i.test(message);
    await log("ai-assistant", "Erro ao criar evento no Google Calendar", { level: "error", detail: message });
    return {
      ok: false,
      error: needsReconnect
        ? "Sua conta Google ainda não tem permissão pra criar evento na agenda — precisa reconectar em Configurações."
        : "Não consegui criar o evento no Google Calendar agora.",
      needsReconnect,
    };
  }
}
