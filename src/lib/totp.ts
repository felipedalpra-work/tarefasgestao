import { createHmac } from "crypto";

// TOTP (RFC 6238) sobre HOTP (RFC 4226) — o mesmo algoritmo que Google Authenticator,
// Authy etc. usam pra gerar o código de 6 dígitos que muda a cada 30s. Implementado com
// `crypto` nativo do Node (sem dependência nova) porque é um algoritmo curto e bem
// documentado, mas a lógica de truncamento é fácil de errar por 1 bit — por isso
// `hotp()` é testado à parte contra os vetores oficiais do RFC 4226 Apêndice D antes de
// confiar nela com segredo de cliente de verdade.

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

// Decodifica Base32 (RFC 4648) — é como todo app autenticador representa o segredo TOTP
// pra digitar/colar (só letras maiúsculas e 2-7, sem caracteres ambíguos como 0/1/O/I).
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = "";
  for (const char of clean) {
    const val = BASE32_ALPHABET.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function isValidBase32Secret(input: string): boolean {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  return clean.length >= 16; // segredo TOTP de verdade tem pelo menos 16 caracteres (80 bits)
}

// HOTP puro (RFC 4226) — contador em vez de tempo. Separado do TOTP pra poder testar
// contra os vetores oficiais do RFC sem precisar mockar hora nenhuma.
export function hotp(secret: Buffer, counter: number, digits = 6): string {
  const counterBuf = Buffer.alloc(8);
  // RFC exige o contador como 8 bytes big-endian; Number só é seguro até 2^53, mas o
  // contador de 30s não chega nem perto disso em nenhuma data plausível
  counterBuf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  counterBuf.writeUInt32BE(counter >>> 0, 4);

  const hmac = createHmac("sha1", secret).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const truncated =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);

  return String(truncated % 10 ** digits).padStart(digits, "0");
}

const STEP_SECONDS = 30;

// Código atual + quantos segundos faltam pra ele trocar (pra UI desenhar a contagem
// regressiva sem precisar buscar de novo a cada segundo — só quando a janela vira).
export function currentTotp(secretBase32: string, atMs: number = Date.now()): { code: string; secondsRemaining: number } {
  const counter = Math.floor(atMs / 1000 / STEP_SECONDS);
  const secondsRemaining = STEP_SECONDS - (Math.floor(atMs / 1000) % STEP_SECONDS);
  return { code: hotp(base32Decode(secretBase32), counter), secondsRemaining };
}
