import { PatternImage } from "./pattern-image";
import { ActionLink, Button } from "@/components/ui/button";
import { inputClass } from "@/components/catalog/classes";
import { project } from "@/config/project";
import { catalogMessages as c } from "@/i18n/catalog-ro";
import { customerMessages as m } from "@/i18n/customer-ro";
import { currencyDigits, difficulties } from "@/modules/catalog/validation";
import type {
  CatalogFilters,
  PatternCard,
} from "@/modules/customer/public-catalog";

export function Price({ pattern }: { pattern: PatternCard }) {
  const amount =
    pattern.price === "PREMIUM" && pattern.amount && pattern.currency
      ? new Intl.NumberFormat("ro", {
          style: "currency",
          currency: pattern.currency,
        }).format(pattern.amount / 10 ** currencyDigits(pattern.currency))
      : null;
  return (
    <span>
      {c[pattern.price]}
      {amount && " · " + amount}
    </span>
  );
}

export function PatternCards({ patterns }: { patterns: PatternCard[] }) {
  return (
    <ul className="grid gap-7 sm:grid-cols-2 lg:grid-cols-3">
      {patterns.map((pattern) => (
        <li
          key={pattern.slug}
          className="min-w-0 border-b border-border pb-5 [overflow-wrap:anywhere]"
        >
          <div className="mb-4">
            <PatternImage id={pattern.coverId} alt={pattern.coverAlt} />
          </div>
          <p className="text-sm text-muted-foreground">
            {pattern.category}
            {pattern.difficulty && " · " + c[pattern.difficulty]}
          </p>
          <h3 className="my-2 font-serif text-2xl">
            <a
              className="text-link"
              href={project.routes.patterns + "/" + pattern.slug}
            >
              {pattern.name}
            </a>
          </h3>
          <p>{pattern.summary}</p>
          <p className="mt-2 font-semibold">
            <Price pattern={pattern} />
          </p>
        </li>
      ))}
    </ul>
  );
}

export function CatalogResults({
  rows,
  next,
  filters,
  categories,
  base,
  categoryPage,
  invalid,
}: {
  rows: PatternCard[];
  next: boolean;
  filters: CatalogFilters;
  categories: { slug: string; name: string }[];
  base: string;
  categoryPage?: boolean;
  invalid: boolean;
}) {
  function href(page: number) {
    const params = new URLSearchParams({
      page: String(page),
      q: filters.q,
      sort: filters.sort,
    });
    if (filters.category && !categoryPage)
      params.set("category", filters.category);
    if (filters.difficulty) params.set("difficulty", filters.difficulty);
    if (filters.price) params.set("price", filters.price);
    return base + "?" + params.toString();
  }
  return (
    <>
      <form
        method="get"
        action={base}
        className="grid items-end gap-4 border-y border-border py-5 sm:grid-cols-2 lg:grid-cols-3"
      >
        <label>
          {m.search}
          <input
            className={inputClass}
            name="q"
            maxLength={100}
            defaultValue={filters.q}
          />
        </label>
        {!categoryPage && (
          <label>
            {c.category}
            <select
              className={inputClass}
              name="category"
              defaultValue={filters.category ?? ""}
            >
              <option value="">{m.all}</option>
              {categories.map((cat) => (
                <option key={cat.slug} value={cat.slug}>
                  {cat.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {c.difficulty}
          <select
            className={inputClass}
            name="difficulty"
            defaultValue={filters.difficulty ?? ""}
          >
            <option value="">{m.all}</option>
            {difficulties.map((value) => (
              <option key={value} value={value}>
                {c[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {m.classification}
          <select
            className={inputClass}
            name="price"
            defaultValue={filters.price ?? ""}
          >
            <option value="">{m.all}</option>
            <option value="FREE">{c.FREE}</option>
            <option value="PREMIUM">{c.PREMIUM}</option>
          </select>
        </label>
        <label>
          {m.sort}
          <select
            className={inputClass}
            name="sort"
            defaultValue={filters.sort}
          >
            <option value="recent">{m.recent}</option>
            <option value="name">{m.alpha}</option>
          </select>
        </label>
        <div>
          <Button type="submit">{m.apply}</Button>
        </div>
      </form>
      {invalid && <p role="status">{m.invalidFilters}</p>}
      {rows.length ? (
        <PatternCards patterns={rows} />
      ) : (
        <p role="status">{m.empty}</p>
      )}
      {(next || filters.page > 1) && (
        <nav className="flex flex-wrap items-center gap-4" aria-label={c.page}>
          {filters.page > 1 && (
            <ActionLink href={href(filters.page - 1)}>{c.previous}</ActionLink>
          )}
          <span>
            {c.page} {filters.page}
          </span>
          {next && filters.page < 1000 && (
            <ActionLink href={href(filters.page + 1)}>{c.next}</ActionLink>
          )}
        </nav>
      )}
    </>
  );
}
