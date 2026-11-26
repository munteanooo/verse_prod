import { inputClass } from "@/components/catalog/classes";
import { patternsHref } from "@/components/catalog/paths";
import { ActionLink, Button } from "@/components/ui/button";
import { catalogMessages as m } from "@/i18n/catalog-ro";
import { adminCatalog } from "@/infrastructure/catalog/admin";
import {
  listCategories,
  listPatterns,
  patternFilters,
} from "@/modules/catalog/service";
import { states } from "@/modules/catalog/validation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { db, actor } = await adminCatalog();
  const input = patternFilters.safeParse(await searchParams);
  const filters = input.success ? input.data : { q: "", page: 1 };
  const [results, categories] = await Promise.all([
    listPatterns(db, actor, filters),
    listCategories(db),
  ]);
  const date = new Intl.DateTimeFormat("ro", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Chisinau",
  });

  function pageHref(page: number) {
    const query = new URLSearchParams({ page: String(page) });
    if (filters.q) query.set("q", filters.q);
    if (filters.category) query.set("category", filters.category);
    if (filters.state) query.set("state", filters.state);
    return patternsHref + "?" + query.toString();
  }

  return (
    <section className="mt-5 grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-3xl">{m.patterns}</h2>
        <ActionLink href={patternsHref + "/new"}>{m.newPattern}</ActionLink>
      </div>
      <form className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]">
        <label>
          {m.search}
          <input
            name="q"
            className={inputClass}
            maxLength={100}
            defaultValue={filters.q}
          />
        </label>
        <label>
          {m.category}
          <select
            name="category"
            className={inputClass}
            defaultValue={filters.category ?? ""}
          >
            <option value="">{m.all}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {m.status}
          <select
            name="state"
            className={inputClass}
            defaultValue={filters.state ?? ""}
          >
            <option value="">{m.all}</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {m[state]}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit">{m.search}</Button>
      </form>
      {results.rows.length === 0 && <p>{m.noResults}</p>}
      <ul className="divide-y divide-border">
        {results.rows.map((row) => (
          <li className="grid gap-2 py-4 md:grid-cols-[1fr_auto]" key={row.id}>
            <div>
              <h3 className="font-semibold">{row.name || m.unnamed}</h3>
              <p className="text-sm">
                {row.category || m.unselected} ·{" "}
                {m[row.archivedAt ? "ARCHIVED" : row.state]} · {m.version}{" "}
                {row.number}
              </p>
              <p className="text-sm text-muted-foreground">
                {m.owner} {row.owner} · {m.updated} {date.format(row.updatedAt)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!row.archivedAt && (
                <ActionLink href={patternsHref + "/" + row.id + "/edit"}>
                  {m.edit}
                </ActionLink>
              )}
              <a
                className="text-link"
                href={patternsHref + "/" + row.id + "/preview"}
              >
                {m.preview}
              </a>
            </div>
          </li>
        ))}
      </ul>
      {(results.next || filters.page > 1) && (
        <nav className="flex flex-wrap items-center gap-3" aria-label={m.page}>
          {filters.page > 1 && (
            <a className="text-link" href={pageHref(filters.page - 1)}>
              {m.previous}
            </a>
          )}
          <span>
            {m.page} {filters.page}
          </span>
          {results.next && filters.page < 1000 && (
            <a className="text-link" href={pageHref(filters.page + 1)}>
              {m.next}
            </a>
          )}
        </nav>
      )}
    </section>
  );
}
