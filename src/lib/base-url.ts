// URL base da plataforma para links em emails, Slack, etc.
// Configure APP_URL no .env quando rodar fora do localhost.
export function getBaseUrl(): string {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}
