import { ActionLink } from "@/components/ui/button";
import { project } from "@/config/project";
import { customerMessages as m } from "@/i18n/customer-ro";
import { requireAccount } from "@/infrastructure/auth/access";
import { catalogDatabase } from "@/infrastructure/customer/pages";
import { listProfiles } from "@/modules/customer/profiles";

export default async function Page() {
  const { user } = await requireAccount();
  const db = catalogDatabase()!;
  const profiles = await listProfiles(db, user.id);
  return (
    <>
      <h1 className="font-serif text-4xl">{m.profiles}</h1>
      <p>{m.profilesHelp}</p>
      <div>
        <ActionLink href={project.routes.measurements + "/new"}>
          {m.newProfile}
        </ActionLink>
      </div>
      {profiles.length ? (
        <ul className="divide-y divide-border">
          {profiles.map((profile) => (
            <li className="py-3" key={profile.id}>
              <a
                className="text-link"
                href={project.routes.measurements + "/" + profile.id}
              >
                {profile.name}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>{m.personalNoValues}</p>
      )}
    </>
  );
}
