import { connection } from "next/server";
import { project } from "@/config/project";
import { customerMessages as m } from "@/i18n/customer-ro";
import {
  catalogDatabase,
  publicMetadata,
} from "@/infrastructure/customer/pages";
import { publicCategories } from "@/modules/customer/public-catalog";

export const metadata = publicMetadata(
  m.categories,
  m.categoryDescription,
  project.routes.categories,
);

export default async function Page() {
  await connection();
  const db = catalogDatabase();
  const categories = db ? await publicCategories(db) : [];
  return (
    <section className="wrap grid gap-6 py-12">
      <h1 className="font-serif text-5xl">{m.categories}</h1>
      {categories.length ? (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <li
              className="min-w-0 border border-border p-5 [overflow-wrap:anywhere]"
              key={category.slug}
            >
              <h2 className="font-serif text-2xl">
                <a
                  className="text-link"
                  href={project.routes.categories + "/" + category.slug}
                >
                  {category.name}
                </a>
              </h2>
              <p className="whitespace-pre-wrap">{category.description}</p>
              <p className="mt-3 text-sm text-muted-foreground">
                {m.catalog} · {category.count}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>{m.emptyHome}</p>
      )}
    </section>
  );
}
