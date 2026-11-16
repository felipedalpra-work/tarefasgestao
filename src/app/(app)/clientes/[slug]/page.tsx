import { getClientDetail, getUsers } from "@/lib/queries";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { Building2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientTabs } from "./ClientTabs";
import { PipefyClientBlock } from "@/components/PipefyClientBlock";
import { DeleteClientButton } from "./DeleteClientButton";
import {
  getGustavoMeetings,
  meetingsForClient,
  getOnboardingCards,
  onboardingSummaryForClient,
  type PipefyMeeting,
  type OnboardingCard,
  type FormularioInicialPipefy,
} from "@/lib/pipefy";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  return { title: `${decodeURIComponent(slug)} — O2 Squad` };
}

export default async function ClientePage({ params }: Props) {
  const { slug } = await params;
  const client = decodeURIComponent(slug);

  const session = await auth();
  if (!session?.user?.id) notFound();

  // Tudo buscado em paralelo — achado real: a tela do cliente demorava muito (às vezes
  // travava de vez) porque os fetches do Pipefy (reuniões/temperatura, jornada de
  // onboarding) rodavam um depois do outro em vez de ao mesmo tempo, cada um já sendo uma
  // chamada paginada à API externa. Cada fetch do Pipefy é best-effort — tem timeout próprio
  // (ver gql() em lib/pipefy.ts) e aqui vira lista vazia em caso de erro, pra nunca impedir
  // o resto da página (dados do banco) de carregar.
  const [data, users, gustavoMeetings, onboardingCards] = await Promise.all([
    getClientDetail(session.user.squadId, client),
    getUsers(session.user.squadId),
    getGustavoMeetings().catch((): PipefyMeeting[] => []),
    getOnboardingCards().catch((): OnboardingCard[] => []),
  ]);

  const { events, recaps, tasks, clientNote, tratativas } = data;

  if (events.length === 0 && recaps.length === 0 && tasks.length === 0 && !clientNote) {
    notFound();
  }

  const lastMeeting = events.length > 0 ? new Date(events[0].startAt) : null;

  const pipefyMeetings = meetingsForClient(gustavoMeetings, client);
  const onboarding = onboardingCards.length > 0 ? onboardingSummaryForClient(onboardingCards, client) : null;

  // contexto comercial do Pipefy (pipe "1.1 Funil de Vendas - CFOaaS") — não busca mais ao
  // vivo aqui: esse dado nunca muda depois que o negócio fecha (achado pelo usuário), então
  // é capturado uma vez pelo sync diário (syncFormularioInicialForSquad, pipefy-sync.ts) e
  // gravado em ClientNote.formularioInicial — aqui é só leitura do que já veio no mesmo
  // fetch do banco de cima, sem chamada nova ao Pipefy.
  const formularioInicial = (clientNote?.formularioInicial as FormularioInicialPipefy | null) ?? null;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      {/* Back */}
      <Link href="/clientes" className="inline-flex items-center gap-1.5 text-sm text-ink-dim hover:text-ink mb-6 transition-colors">
        <ArrowLeft size={14} />
        Clientes
      </Link>

      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-o2-green/10 flex items-center justify-center shrink-0">
          <Building2 size={22} className="text-o2-green" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-ink">{client}</h1>
          {lastMeeting && (
            <p className="text-sm text-ink-dim mt-0.5">
              Última reunião: {lastMeeting.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </p>
          )}
        </div>
        {isAdmin(session) && (
          <DeleteClientButton
            client={client}
            counts={{ tasks: tasks.length, events: events.length, recaps: recaps.length, tratativas: tratativas.length }}
          />
        )}
      </div>

      <PipefyClientBlock meetings={pipefyMeetings} onboarding={onboarding} />

      <ClientTabs
        events={events.map((e) => ({ ...e, startAt: new Date(e.startAt).toISOString(), endAt: new Date(e.endAt).toISOString() }))}
        recaps={recaps.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString(), processedAt: r.processedAt ? new Date(r.processedAt).toISOString() : null }))}
        tasks={tasks.map((t) => ({ ...t, dueDate: t.dueDate ? new Date(t.dueDate).toISOString() : null }))}
        tratativas={tratativas.map((t) => ({
          ...t,
          dataPrevistaFinalizacao: t.dataPrevistaFinalizacao ? new Date(t.dataPrevistaFinalizacao).toISOString() : null,
          churnData: t.churnData ? new Date(t.churnData).toISOString() : null,
          createdAt: new Date(t.createdAt).toISOString(),
        }))}
        users={users}
        currentUserId={session.user.id}
        client={client}
        formularioInicial={formularioInicial}
      />
    </div>
  );
}
