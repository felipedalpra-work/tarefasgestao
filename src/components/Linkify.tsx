// Mesmo texto livre de sempre (whitespace-pre-wrap), só que qualquer URL http(s) dentro
// dele vira link clicável — usado onde a extração por IA cola um link cru (ex.: "📎 Ata:
// <url>" no Meet Recap) e a pessoa tinha que selecionar/copiar manualmente.
const SPLIT_ON_URL = /(https?:\/\/[^\s<>"']+)/g;
// regex SEM /g separada de propósito pra esse teste — reusar a mesma instância global em
// vários .test() mantém o "lastIndex" entre chamadas e dá resultado errado a partir da 2a
const IS_URL = /^https?:\/\//;

export function Linkify({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  const parts = text.split(SPLIT_ON_URL);
  return (
    <>
      {parts.map((part, i) =>
        IS_URL.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-o2-green hover:underline break-words"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        ) : (
          part
        )
      )}
    </>
  );
}
