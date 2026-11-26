import { CreatePattern } from "@/components/catalog/pattern-actions";
import { catalogMessages as m } from "@/i18n/catalog-ro";
import { requireAdmin } from "@/infrastructure/auth/access";

export default async function Page() {
  await requireAdmin();
  return (
    <section className="mt-5 grid gap-4">
      <h2 className="font-serif text-3xl">{m.newPattern}</h2>
      <p>{m.stepHints[0]}</p>
      <CreatePattern />
    </section>
  );
}
