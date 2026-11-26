import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { CatalogResults } from "@/components/customer/catalog";
import { project } from "@/config/project";
import { customerMessages as m } from "@/i18n/customer-ro";
import {
  catalogDatabase,
  pageFilters,
  publicMetadata,
} from "@/infrastructure/customer/pages";
import { slug as validSlug } from "@/modules/catalog/validation";
import {
  publicCategories,
  publishedPatterns,
} from "@/modules/customer/public-catalog";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const getCategory = cache(async (slug: string) => {
  const db = catalogDatabase();
  return db && validSlug.safeParse(slug).success
    ? (await publicCategories(db, slug))[0]
    : undefined;
});

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const category = await getCategory(slug);
  return category
    ? publicMetadata(
        category.name,
        category.description || m.categoryDescription,
        project.routes.categories + "/" + slug,
      )
    : { robots: { index: false } };
}

export default async function Page({ params, searchParams }: Props) {
  await connection();
  const { slug } = await params;
  const db = catalogDatabase();
  const category = await getCategory(slug);
  if (!category || !db) notFound();
  const { filters, invalid } = pageFilters(await searchParams);
  const result = await publishedPatterns(db, { ...filters, category: slug });
  const base = project.routes.categories + "/" + slug;
  return (
    <section className="wrap grid gap-6 py-12">
      <a className="text-link w-fit" href={project.routes.categories}>
        {m.categories}
      </a>
      <h1 className="font-serif text-5xl">{category.name}</h1>
      <p className="whitespace-pre-wrap">{category.description}</p>
      <CatalogResults
        {...result}
        filters={{ ...filters, category: slug }}
        categories={[]}
        base={base}
        invalid={invalid}
        categoryPage
      />
    </section>
  );
}
