import { PatternActions } from "@/components/catalog/pattern-actions";
import { patternsHref } from "@/components/catalog/paths";
import { Wizard } from "@/components/catalog/wizard";
import { catalogMessages as m } from "@/i18n/catalog-ro";
import { adminPattern } from "@/infrastructure/catalog/admin";
import { listCategories, listDefinitions } from "@/modules/catalog/service";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { db, pattern, version, draft, definitions, category } =
    await adminPattern(id);
  const readOnly = Boolean(pattern.archivedAt) || version.state !== "DRAFT";
  const [categories, available] = readOnly
    ? [[], []]
    : await Promise.all([
        listCategories(db, "", true),
        listDefinitions(db, "", true),
      ]);
  if (category && !categories.some((option) => option.id === category.id))
    categories.push(category);
  const options = [
    ...definitions,
    ...available.filter(
      (entry) => !definitions.some((item) => item.id === entry.id),
    ),
  ];
  return (
    <section className="mt-5 grid gap-5">
      <a className="text-link w-fit" href={patternsHref}>
        {m.back}
      </a>
      <h2 className="font-serif text-3xl">{draft.name || m.unnamed}</h2>
      <p>
        {m.version} {version.number} ·{" "}
        {m[pattern.archivedAt ? "ARCHIVED" : version.state]}
      </p>
      {readOnly ? (
        <>
          <a className="text-link" href={patternsHref + "/" + id + "/preview"}>
            {m.preview}
          </a>
          <PatternActions
            id={id}
            archived={Boolean(pattern.archivedAt)}
            draft={false}
          />
        </>
      ) : (
        <Wizard
          id={id}
          versionId={version.id}
          revision={version.revision}
          initial={draft}
          options={categories}
          definitions={options}
        />
      )}
    </section>
  );
}
