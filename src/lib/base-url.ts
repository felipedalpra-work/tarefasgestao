// URL base da plataforma para links em emails, Slack, etc.
// Configure APP_URL no .env quando rodar fora do localhost.
// Se ninguém configurar, cai nas variáveis que a própria Vercel injeta automaticamente
// em todo deploy — assim o link ainda funciona em produção mesmo sem configuração manual
// (sem esse fallback, virava um link morto pra "http://localhost:3000").
export function getBaseUrl(): string {
  if (process.env.APP_URL) return process.env.APP_URL;
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
