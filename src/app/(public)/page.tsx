import Image from "next/image";
import { BookOpen, Ruler, Scissors } from "lucide-react";
import { ActionLink } from "@/components/ui/button";
import { project } from "@/config/project";
import { messages } from "@/i18n";

const stepIcons = [BookOpen, Ruler, Scissors] as const;

export default function HomePage() {
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
          <ActionLink href={`#${sections.featured}`}>{home.action}</ActionLink>
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
        <h2 id="featured-title">{home.featuredTitle}</h2>
        <p className="section-intro">{home.featuredDescription}</p>
        <ul className="pattern-grid">
          {home.patterns.map(({ name, detail, shape }) => (
            <li key={name}>
              <div
                className={`pattern-image pattern-image--${shape}`}
                aria-hidden="true"
              >
                <span />
              </div>
              <h3>{name}</h3>
              <p>{detail}</p>
            </li>
          ))}
        </ul>
      </section>

      <section
        className="category-section"
        id={sections.categories}
        aria-labelledby="category-title"
      >
        <div className="wrap category-inner">
          <h2 id="category-title">{home.categoriesTitle}</h2>
          <ul>
            {home.categories.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      </section>

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
