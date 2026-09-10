import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Criptografia em repouso pra senha de ERP e segredo TOTP de cliente — o dado mais
// sensível que a plataforma guarda hoje (acesso real a sistema financeiro de terceiro).
// AES-256-GCM (autenticado: um blob adulterado falha ao descriptografar em vez de
// devolver lixo silenciosamente) com chave só do servidor, nunca enviada ao navegador.
//
// Isso NÃO é criptografia de ponta a ponta — o servidor consegue descriptografar (é
// assim que o TOTP é calculado e a senha é revelada sob pedido). Protege contra vazamento
// do banco de dados (dump/backup roubado, acesso indevido ao Postgres), não contra o
// próprio processo do app sendo comprometido. É o nível de proteção pragmático de um
// cofre de credenciais interno — não o de um gerenciador de senhas com zero-knowledge.
//
// NUNCA cai em texto puro por engano: sem a chave configurada, encryptSecret/
// decryptSecret preferem quebrar alto a gravar ou ler algo sem cifrar.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // padrão recomendado pro GCM (96 bits)

function getKey(): Buffer {
  const raw = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY não configurada — sem ela não é seguro gravar nem ler senha/segredo OTP de cliente."
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY precisa ser uma chave de 32 bytes em base64 (gere com: openssl rand -base64 32).");
  }
  return key;
}

// Formato do blob: "v1:<iv base64>:<authTag base64>:<ciphertext base64>" — versionado
// desde já, pra dar pra trocar de algoritmo no futuro sem quebrar o que já foi gravado.
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(":");
}

export function decryptSecret(blob: string): string {
  const key = getKey();
  const [version, ivB64, tagB64, dataB64] = blob.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) {
    throw new Error("Formato de credencial cifrada desconhecido.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plain = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return plain.toString("utf8");
}
