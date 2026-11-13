import { Building2 } from "lucide-react";
import { Linkify } from "@/components/Linkify";
import type { FormularioInicialPipefy } from "@/lib/pipefy";

export type FormularioInicial = FormularioInicialPipefy;

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-ink-dim mb-0.5">{label}</div>
      <p className="text-sm text-ink-soft">{value}</p>
    </div>
  );
}

// Contexto inicial do cliente vindo do Pipefy (pipe "1.1 Funil de Vendas - CFOaaS") — mesmo
// espírito read-only do PipefyClientBlock. `data` já vem pronto de page.tsx (buscado uma
// vez só no carregamento da página, reaproveitando o cache de 2h de
// getFormularioInicialCardsPipefy) — achado pelo usuário: a versão anterior buscava via
// fetch do navegador toda vez que a aba montava, então trocar de aba e voltar disparava uma
// chamada nova à API do Pipefy de novo, deixando a aba lenta a cada entrada.
export function FormularioInicialTab({ data }: { data: FormularioInicial | null }) {
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <Building2 size={28} className="text-border" />
        <p className="text-ink-mid text-sm">Não achei esse cliente no Pipefy (funil de vendas).</p>
        <p className="text-ink-faint text-xs max-w-sm">
          Só busca entre os negócios já fechados (&ldquo;Contrato assinado&rdquo;/&ldquo;Ganho&rdquo;) — nomes muito diferentes
          do cadastrado no Pipefy podem não casar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-2 gap-x-6 gap-y-4 bg-surface border border-surface-3 rounded-xl p-4">
        <Field label="Empresa" value={data.empresa} />
        <Field label="Razão Social" value={data.razaoSocial} />
        <Field label="CNPJ" value={data.cnpj} />
        <Field label="Setor" value={data.setor} />
        <Field label="UF / Município" value={[data.uf, data.municipio].filter(Boolean).join(" · ") || null} />
        <Field label="ERP" value={[data.erp, data.erpOutro].filter(Boolean).join(" — ") || null} />
        <Field label="Faturamento" value={data.faturamento} />
        <Field label="Regime Tributário" value={data.regimeTributario} />
        <Field label="Data de assinatura do contrato" value={data.dataAssinatura} />
        {data.produtos && data.produtos.length > 0 && <Field label="Produtos contratados" value={data.produtos.join(", ")} />}
      </section>

      {(data.contatoNome || data.contatoEmail || data.contatoTelefone) && (
        <section className="bg-surface border border-surface-3 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Contato</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Nome" value={data.contatoNome} />
            <Field label="E-mail" value={data.contatoEmail} />
            <Field label="Telefone" value={data.contatoTelefone} />
          </div>
        </section>
      )}

      {(data.financeiroNome || data.financeiroEmail || data.financeiroTelefone) && (
        <section className="bg-surface border border-surface-3 rounded-xl p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Responsável financeiro</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Field label="Nome" value={data.financeiroNome} />
            <Field label="E-mail" value={data.financeiroEmail} />
            <Field label="Telefone" value={data.financeiroTelefone} />
          </div>
        </section>
      )}

      {data.anotacoesQualificacao && (
        <section className="bg-surface border border-surface-3 rounded-xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-2">Anotações da qualificação</h3>
          <p className="text-sm text-ink-soft whitespace-pre-wrap break-words">
            <Linkify text={data.anotacoesQualificacao} />
          </p>
        </section>
      )}

      {data.resumoVendaIA && (
        <details className="bg-surface border border-surface-3 rounded-xl p-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-faint">Resumo da venda (IA)</summary>
          <p className="text-sm text-ink-soft whitespace-pre-wrap break-words mt-2">
            <Linkify text={data.resumoVendaIA} />
          </p>
        </details>
      )}
    </div>
  );
}
