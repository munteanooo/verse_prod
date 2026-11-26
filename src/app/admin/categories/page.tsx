import { Library } from "@/components/catalog/library";
import { inputClass } from "@/components/catalog/classes";
import { Button } from "@/components/ui/button";
import { catalogMessages as m } from "@/i18n/catalog-ro";
import { adminCatalog } from "@/infrastructure/catalog/admin";
import { listCategories } from "@/modules/catalog/service";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { db } = await adminCatalog();
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.slice(0, 100) : "";
  const rows = await listCategories(db, query);
  return (
    <section className="mt-5 grid gap-5">
      <h2 className="font-serif text-3xl">{m.categories}</h2>
      <form className="flex flex-wrap items-end gap-3">
        <label>
          {m.search}
          <input
            className={inputClass}
            name="q"
            maxLength={100}
            defaultValue={query}
          />
        </label>
        <Button type="submit">{m.search}</Button>
      </form>
      <Library kind="categories" rows={rows} />
    </section>
  );
}
