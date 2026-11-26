import { cache } from "react";
import type { Metadata } from "next";
import { application } from "@/config/application";
import { getIdentity } from "@/infrastructure/auth/service";
import {
  catalogFilters,
  publishedPattern,
} from "@/modules/customer/public-catalog";

export const catalogDatabase = () => getIdentity()?.db;
export const getPublicPattern = cache(async (slug: string) => {
  const db = catalogDatabase();
  return db ? publishedPattern(db, slug) : undefined;
});

export function publicMetadata(
  title: string,
  description: string,
  path: string,
): Metadata {
  const { siteUrl } = application.deployment;
  return {
    title: title + " | " + application.brand,
    description,
    ...(siteUrl && { alternates: { canonical: path } }),
    openGraph: {
      title,
      description,
      ...(siteUrl && { url: path }),
      siteName: application.brand,
    },
  };
}

export function pageFilters(
  data: Record<string, string | string[] | undefined>,
) {
  const parsed = catalogFilters.safeParse(data);
  return {
    filters: parsed.success ? parsed.data : catalogFilters.parse({}),
    invalid: !parsed.success,
  };
}
