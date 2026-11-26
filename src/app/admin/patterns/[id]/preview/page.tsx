import { notFound } from "next/navigation";
import { PatternReview } from "@/components/catalog/review";
import { PatternActions } from "@/components/catalog/pattern-actions";
import { patternsHref } from "@/components/catalog/paths";
import { catalogMessages as m } from "@/i18n/catalog-ro";
import { adminPattern } from "@/infrastructure/catalog/admin";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string | string[] }>;
}) {
  const { id } = await params;
  const { version: selected } = await searchParams;
  const number = selected === undefined ? undefined : Number(selected);
  if (
    number !== undefined &&
    (Array.isArray(selected) ||
      !Number.isInteger(number) ||
      number < 1 ||
      number > 2_147_483_647)
  )
    notFound();
  const { pattern, version, versions, category, definitions, draft } =
    await adminPattern(id, number);
  const current = versions[0]?.id === version.id;
  return (
    <section className="mt-5 grid gap-5">
      <div className="flex flex-wrap gap-3">
        <a className="text-link" href={patternsHref}>
          {m.back}
        </a>
        {!pattern.archivedAt && (
          <a className="text-link" href={patternsHref + "/" + id + "/edit"}>
            {m.edit}
          </a>
        )}
      </div>
      <h2 className="font-serif text-3xl">
        {m.preview} · {m.version} {version.number}
      </h2>
      <details>
        <summary className="cursor-pointer">{m.history}</summary>
        <ul className="mt-2 flex flex-wrap gap-2">
          {versions.map((entry) => (
            <li key={entry.id}>
              <a
                className="text-link"
                aria-current={entry.id === version.id ? "page" : undefined}
                href={
                  patternsHref + "/" + id + "/preview?version=" + entry.number
                }
              >
                {m.version} {entry.number} · {m[entry.state]}
              </a>
            </li>
          ))}
        </ul>
      </details>
      <PatternReview
        draft={draft}
        definitions={definitions}
        category={version.categoryName ?? undefined}
        active={Boolean(category && !category.archived)}
      />
      {current && (
        <PatternActions
          id={id}
          archived={Boolean(pattern.archivedAt)}
          draft={version.state === "DRAFT"}
        />
      )}
    </section>
  );
}
