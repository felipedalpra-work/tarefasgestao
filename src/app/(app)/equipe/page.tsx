import { auth } from "@/lib/auth";
import { getUsers } from "@/lib/queries";
import { EquipeClient } from "./EquipeClient";

export default async function EquipePage() {
  const session = await auth();
  const squadId = session!.user.squadId;
  const users = await getUsers(squadId);

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-ink">Equipe</h1>
        <p className="text-ink-mid text-sm mt-0.5">Organograma do squad — adicione, edite e remova membros</p>
      </div>

      <EquipeClient initialUsers={users} />
    </div>
  );
}
