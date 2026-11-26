import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Price } from "@/components/customer/catalog";
import { SizeTool } from "@/components/customer/size-tool";
import { project } from "@/config/project";
import { catalogMessages as c } from "@/i18n/catalog-ro";
import { customerMessages as m } from "@/i18n/customer-ro";
import { authorize } from "@/infrastructure/auth/access";
import {
  catalogDatabase,
  getPublicPattern,
  publicMetadata,
} from "@/infrastructure/customer/pages";
import { showLength } from "@/modules/catalog/validation";
import { listProfiles } from "@/modules/customer/profiles";

type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const pattern = await getPublicPattern(slug);
  return pattern
    ? publicMetadata(
        pattern.name,
        pattern.summary,
        project.routes.patterns + "/" + slug,
      )
    : { robots: { index: false } };
}

export default async function Page({ params }: Props) {
  const requestHeaders = await headers();
  const { slug } = await params;
  const pattern = await getPublicPattern(slug);
  if (!pattern) notFound();
  const db = catalogDatabase();
  const actor = await authorize(requestHeaders);
  const profiles = db && actor ? await listProfiles(db, actor.user.id) : [];
  return (
    <article className="wrap grid min-w-0 gap-8 py-10 [overflow-wrap:anywhere]">
      <a className="text-link w-fit" href={project.routes.patterns}>
        {m.back}
      </a>
      <div className="grid gap-6 md:grid-cols-2 md:items-center">
        <div className="grid aspect-[3/2] place-items-center bg-muted p-6 text-muted-foreground">
          {m.imagePending}
        </div>
        <div className="grid gap-3">
          <a
            className="text-link w-fit"
            href={project.routes.categories + "/" + pattern.categorySlug}
          >
            {pattern.category}
          </a>
          <h1 className="font-serif text-5xl">{pattern.name}</h1>
          <p>{pattern.summary}</p>
          <p>
            {pattern.difficulty && c[pattern.difficulty] + " · "}
            <Price pattern={pattern} />
          </p>
        </div>
      </div>
      <div className="max-w-prose space-y-3">
        <h2 className="font-serif text-3xl">{c.description}</h2>
        <p className="whitespace-pre-wrap">{pattern.description}</p>
        <h2 className="font-serif text-3xl">{c.materials}</h2>
        <p className="whitespace-pre-wrap">{pattern.materials}</p>
        <h2 className="font-serif text-3xl">{c.instructions}</h2>
        <p className="whitespace-pre-wrap">{pattern.instructions}</p>
      </div>
      <section className="grid gap-3">
        <h2 className="font-serif text-3xl">{c.steps[1]}</h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {pattern.pieces.map((piece, index) => (
            <li key={index} className="space-y-1 border border-border p-4">
              <h3 className="font-semibold">{piece.name}</h3>
              <p className="whitespace-pre-wrap">{piece.description}</p>
              <p>
                {c.quantity} {piece.quantity}
              </p>
              {piece.fabric && (
                <p>
                  {c.fabric} · {piece.fabric}
                </p>
              )}
              {piece.fold && <p>{c.fold}</p>}
              {piece.mirrored && <p>{c.mirrored}</p>}
              {piece.grainline && (
                <p>
                  {c.grainline} · {piece.grainline}
                </p>
              )}
              {piece.seam !== null && (
                <p>
                  {c.seam} · {showLength(piece.seam)}
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
      <SizeTool
        slug={slug}
        fields={pattern.fields}
        sizes={pattern.sizes}
        profiles={profiles}
        authenticated={Boolean(actor)}
      />
    </article>
  );
}
