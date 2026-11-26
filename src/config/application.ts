import type { Metadata } from "next";
import { messages } from "@/i18n";
import { parseEnvironment } from "./environment";
import { project } from "./project";

const { siteUrl } = parseEnvironment({
  VERSE_SITE_URL: process.env.VERSE_SITE_URL,
});

export const application = {
  ...project,
  deployment: { siteUrl },
  metadata: {
    applicationName: project.brand,
    title: messages.metadata.title,
    description: messages.metadata.description,
    ...(siteUrl && {
      metadataBase: new URL(siteUrl),
      alternates: { canonical: project.routes.customer },
    }),
  } satisfies Metadata,
};
