import { connection } from "next/server";
import { PatternCards } from "@/components/customer/catalog";
import { customerMessages as c } from "@/i18n/customer-ro";
import { catalogDatabase } from "@/infrastructure/customer/pages";
import {
  catalogFilters,
  publicCategories,
  publishedPatterns,
} from "@/modules/customer/public-catalog";
import Image from "next/image";
import { BookOpen, Ruler, Scissors } from "lucide-react";
import { ActionLink } from "@/components/ui/button";
import { project } from "@/config/project";
import { messages } from "@/i18n";

const stepIcons = [BookOpen, Ruler, Scissors] as const;

export default async function HomePage() {
  await connection();
  const db = catalogDatabase();
  const [featured, categories] = db
    ? await Promise.all([
        publishedPatterns(db, catalogFilters.parse({})),
        publicCategories(db),
      ])
    : [{ rows: [] }, []];
  const featuredPatterns = featured.rows.slice(0, 3);
  const categoryLinks = categories.filter(({ count }) => count > 0).slice(0, 3);
  const { home } = messages;
  const { sections } = project;

  return (
    <>
      <section className="wrap hero">
        <div className="hero-copy">
          <p className="eyebrow">{home.eyebrow}</p>
          <h1>
            {home.title}
            <br />
            <em>{home.titleAccent}</em>
          </h1>
          <p className="intro">{home.intro}</p>
          <ActionLink href={`#${sections.featured}`}>{c.catalog}</ActionLink>
        </div>
        <figure className="hero-figure">
          <div className="hero-image">
            <Image
              src="/images/linen-shirt.jpg"
              alt={home.imageAlt}
              fill
              preload
              sizes="(max-width: 760px) 94vw, 60vw"
            />
          </div>
          <figcaption>{home.imageCaption}</figcaption>
        </figure>
      </section>

      <section
        className="wrap editorial-section"
        id={sections.featured}
        aria-labelledby="featured-title"
      >
        <h2 id="featured-title">
          {featuredPatterns.length ? c.catalog : c.collection}
        </h2>
        <p className="section-intro">
          {featuredPatterns.length ? c.catalogDescription : c.emptyHome}
        </p>
        {featuredPatterns.length > 0 && (
          <PatternCards patterns={featuredPatterns} />
        )}
        <div className="mt-6">
          <ActionLink href={project.routes.patterns}>{c.catalog}</ActionLink>
        </div>
      </section>

      {categoryLinks.length > 0 && (
        <section
          className="category-section"
          id={sections.categories}
          aria-labelledby="category-title"
        >
          <div className="wrap category-inner">
            <h2 id="category-title">{c.categories}</h2>
            <ul>
              {categoryLinks.map((category) => (
                <li key={category.slug}>
                  <a
                    className="text-link"
                    href={project.routes.categories + "/" + category.slug}
                  >
                    {category.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section
        className="wrap editorial-section process"
        id={sections.process}
        aria-labelledby="process-title"
      >
        <h2 id="process-title">{home.processTitle}</h2>
        <ol className="process-grid">
          {home.steps.map(({ title, detail }, index) => {
            const Icon = stepIcons[index];
            return (
              <li key={title}>
                <Icon aria-hidden="true" size={25} strokeWidth={1.5} />
                <h3>{title}</h3>
                <p>{detail}</p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="category-section" aria-labelledby="benefits-title">
        <div className="wrap category-inner">
          <h2 id="benefits-title">{home.benefits.title}</h2>
          <p className="max-w-prose text-muted-foreground">
            {home.benefits.detail}
          </p>
        </div>
      </section>
    </>
  );
}
