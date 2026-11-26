import { identityMessages as m } from "@/i18n/identity-ro";
import { requireAdmin } from "@/infrastructure/auth/access";

export default async function AdminPage() {
  await requireAdmin();
  return <p className="mt-5">{m.adminIntro}</p>;
}
