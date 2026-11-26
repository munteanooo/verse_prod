import { ProfileEditor } from "@/components/customer/profile-editor";
import { project } from "@/config/project";
import { customerMessages as m } from "@/i18n/customer-ro";
import { requireAccount } from "@/infrastructure/auth/access";
import { catalogDatabase } from "@/infrastructure/customer/pages";
import { publishedDefinitions } from "@/modules/customer/public-catalog";

export default async function Page() {
  await requireAccount();
  const definitions = await publishedDefinitions(catalogDatabase()!);
  return (
    <>
      <a href={project.routes.measurements} className="text-link w-fit">
        {m.profiles}
      </a>
      <h1 className="font-serif text-4xl">{m.newProfile}</h1>
      <p>{m.profilesHelp}</p>
      <ProfileEditor definitions={definitions} />
    </>
  );
}
