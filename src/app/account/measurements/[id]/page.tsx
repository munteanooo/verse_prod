import { publishedDefinitions } from "@/modules/customer/public-catalog";
import { notFound } from "next/navigation";
import { ProfileEditor } from "@/components/customer/profile-editor";
import { project } from "@/config/project";
import { customerMessages as m } from "@/i18n/customer-ro";
import { requireAccount } from "@/infrastructure/auth/access";
import { catalogDatabase } from "@/infrastructure/customer/pages";
import { id } from "@/modules/catalog/validation";
import { readProfile } from "@/modules/customer/profiles";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireAccount();
  const { id: key } = await params;
  if (!id.safeParse(key).success) notFound();
  const db = catalogDatabase()!;
  const [profile, definitions] = await Promise.all([
    readProfile(db, user.id, key),
    publishedDefinitions(db),
  ]);
  if (!profile) notFound();
  return (
    <>
      <a href={project.routes.measurements} className="text-link w-fit">
        {m.profiles}
      </a>
      <h1 className="font-serif text-4xl">{profile.name}</h1>
      <ProfileEditor definitions={definitions} existing={profile} />
    </>
  );
}
