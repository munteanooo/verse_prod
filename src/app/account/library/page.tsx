import { PublicShell } from "@/components/layout/public-shell";
import { LibraryAction } from "@/components/customer/library-action";
import { requireAccount } from "@/infrastructure/auth/access";
import { catalogDatabase } from "@/infrastructure/customer/pages";
import { project } from "@/config/project";
import { documentMessages as m } from "@/i18n/documents-ro";
import { libraryPatterns } from "@/modules/customer/public-catalog";

export const metadata = { robots: { index: false, follow: false } };

export default async function Page() {
  const { user } = await requireAccount();
  const db = catalogDatabase()!;
  const items = await libraryPatterns(db, user.id);
  return (
    <PublicShell>
      <section className="wrap grid max-w-3xl gap-5 py-12">
        <h1 className="font-serif text-4xl">{m.library}</h1>
        {items.length ? (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li
                className="grid items-center gap-3 py-4 sm:grid-cols-[1fr_auto]"
                key={item.id}
              >
                <a
                  className="text-link"
                  href={project.routes.patterns + "/" + item.slug}
                >
                  {item.name}
                </a>
                <LibraryAction patternId={item.id} />
              </li>
            ))}
          </ul>
        ) : (
          <p>{m.libraryEmpty}</p>
        )}
      </section>
    </PublicShell>
  );
}
