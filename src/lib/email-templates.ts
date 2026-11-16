// Construção pura de HTML de e-mail pro cliente — sem nenhuma dependência de servidor
// (Node/Prisma/googleapis), de propósito: isso é o que permite esse arquivo ser importado
// tanto por rotas de servidor (envio de verdade) quanto por um componente "use client" (pré-
// visualização instantânea no navegador, sem round-trip de rede — mesma função dos dois
// lados, então pré-visualização e envio nunca divergem).
//
// Identidade visual da O2 (gradiente verde→cinza, logo, frase de marca, itens numerados em
// círculo verde) — mesmo padrão já usado em outros e-mails da O2 (ex.: fechamento mensal via
// n8n), adaptado aqui pra pendências/tarefas em vez de perguntas de fechamento.
const O2_GREEN = "#6BF169";
const O2_DARK = "#494949";
const O2_LOGO_URL = "https://cdn.prod.website-files.com/678fefd80f4431a275d6f39c/696655fa4a1ef257c894567f_logo_o2.svg";

// Modelo padrão do e-mail de pendências mandado pro cliente na aba "E-mail" da Revisão
// Semanal, usado quando nem o cliente nem o squad configuraram um próprio (ver
// getClientEmailTemplate/setClientEmailTemplate em settings.ts e ClientNote.emailTemplate).
// O token {{tarefas}} vira a lista das tarefas marcadas.
export const DEFAULT_CLIENT_EMAIL_TEMPLATE = `Olá, tudo bem?

Segue abaixo o resumo das pendências em aberto para acompanhamento:

{{tarefas}}

Qualquer dúvida, estamos à disposição.

Abraços,
Equipe O2`;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Lista de tarefas (bloco onde toda linha começa com "• ") vira itens numerados em círculo
// verde — mesmo componente visual do padrão de referência da O2, só que numerando tarefas
// em vez de perguntas de fechamento mensal.
function renderTaskListBlock(lines: string[]): string {
  const rows = lines
    .map((line, i) => {
      const text = escapeHtml(line.slice(2));
      const isLast = i === lines.length - 1;
      return `
        <tr>
          <td style="padding:14px 0;${isLast ? "" : `border-bottom:1px solid #e5e7eb;`}vertical-align:top;">
            <table cellpadding="0" cellspacing="0" role="presentation"><tr>
              <td style="vertical-align:top;width:32px;">
                <div style="background:${O2_GREEN};color:${O2_DARK};width:24px;height:24px;border-radius:50%;text-align:center;line-height:24px;font-weight:bold;font-size:12px;">${i + 1}</div>
              </td>
              <td style="vertical-align:top;padding-left:4px;font-size:14px;color:${O2_DARK};">${text}</td>
            </tr></table>
          </td>
        </tr>`;
    })
    .join("");
  return `<div style="background:#f9fafb;border-radius:8px;padding:8px 20px;margin:0 0 28px 0;">
    <table cellpadding="0" cellspacing="0" role="presentation" style="width:100%;border-collapse:collapse;">${rows}</table>
  </div>`;
}

// Converte o texto puro já editado na tela (parágrafos separados por linha em branco; bloco
// só com linhas "• " vira lista de tarefas) no HTML de verdade do e-mail, com a identidade
// visual da O2. `subject` vira o título grande do cabeçalho — pré-visualização e envio usam
// o mesmo assunto que aparece ali, sem surpresa entre o que se vê e o que se manda.
export function buildWeeklyClientEmailHtml({ subject, bodyText }: { subject: string; bodyText: string }): string {
  const blocks = bodyText.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);

  const bodyHtml = blocks
    .map((block) => {
      const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
      const isTaskList = lines.length > 0 && lines.every((l) => l.startsWith("• "));
      if (isTaskList) return renderTaskListBlock(lines);
      return `<p style="margin:0 0 16px 0;font-size:15px;color:${O2_DARK};">${lines.map(escapeHtml).join("<br/>")}</p>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:640px;margin:0 auto;color:${O2_DARK};line-height:1.6;">

    <div style="background:linear-gradient(135deg,${O2_GREEN} 0%,${O2_DARK} 100%);padding:32px 28px;border-radius:8px 8px 0 0;text-align:center;">
      <img src="${O2_LOGO_URL}" alt="O2 Inc." style="height:48px;width:auto;margin-bottom:16px;display:inline-block;">
      <p style="color:#ffffff;font-size:16px;margin:0 0 20px 0;font-style:italic;opacity:0.95;letter-spacing:0.5px;">
        Compreender pessoas, oxigenar negócios.
      </p>
      <div style="border-top:1px solid rgba(255,255,255,0.3);padding-top:20px;">
        <h2 style="color:#ffffff;font-size:24px;font-weight:bold;margin:0;line-height:1.2;">${escapeHtml(subject)}</h2>
      </div>
    </div>

    <div style="padding:28px;background:#ffffff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
      ${bodyHtml}
    </div>

  </div>
</body>
</html>`;
}
