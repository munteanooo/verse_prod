import type { MetadataRoute } from "next";
import { application } from "@/config/application";
import { catalogDatabase } from "@/infrastructure/customer/pages";
import {
  discoverableSlugs,
  publicCategories,
} from "@/modules/customer/public-catalog";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = application.deployment.siteUrl;
  if (!origin) return [];
  const db = catalogDatabase();
  const [patterns, categories] = db
    ? await Promise.all([discoverableSlugs(db), publicCategories(db)])
    : [[], []];
  const routes = application.routes;
  return [
    routes.customer,
    routes.patterns,
    routes.categories,
    ...patterns.map(({ slug }) => routes.patterns + "/" + slug),
    ...categories.map(({ slug }) => routes.categories + "/" + slug),
  ].map((path) => ({ url: new URL(path, origin).href }));
}
