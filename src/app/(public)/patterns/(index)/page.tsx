import { connection } from "next/server";
import { CatalogResults } from "@/components/customer/catalog";
import { project } from "@/config/project";
import { customerMessages as m } from "@/i18n/customer-ro";
import {
  catalogDatabase,
  pageFilters,
  publicMetadata,
} from "@/infrastructure/customer/pages";
import {
  publicCategories,
  publishedPatterns,
} from "@/modules/customer/public-catalog";

export const metadata = publicMetadata(
  m.catalog,
  m.catalogDescription,
  project.routes.patterns,
);

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const db = catalogDatabase();
  const { filters, invalid } = pageFilters(await searchParams);
  const [result, categories] = db
    ? await Promise.all([publishedPatterns(db, filters), publicCategories(db)])
    : [{ rows: [], next: false }, []];
  return (
    <section className="wrap grid gap-6 py-12">
      <h1 className="font-serif text-5xl">{m.catalog}</h1>
      <p>{m.catalogDescription}</p>
      <CatalogResults
        {...result}
        filters={filters}
        categories={categories}
        base={project.routes.patterns}
        invalid={invalid}
      />
    </section>
  );
}
