import { prisma } from "./prisma";

type Level = "info" | "warn" | "error";

export async function log(
  category: string,
  message: string,
  options: { level?: Level; detail?: string } = {}
) {
  const { level = "info", detail } = options;
  try {
    await prisma.platformLog.create({
      data: { level, category, message, detail: detail ?? null },
    });
  } catch {
    // never throw from logger
    console.error("[logger] failed to write log:", message);
  }
}
