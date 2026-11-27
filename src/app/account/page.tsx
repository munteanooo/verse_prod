import { documentMessages } from "@/i18n/documents-ro";
import { PublicShell } from "@/components/layout/public-shell";
import { AuthForm } from "@/components/identity/auth-form";
import { SessionControls } from "@/components/identity/session-controls";
import { project } from "@/config/project";
import { customerMessages } from "@/i18n/customer-ro";
import { identityMessages as m } from "@/i18n/identity-ro";
import { requireAccount } from "@/infrastructure/auth/access";

export default async function AccountPage() {
  const actor = await requireAccount();
  return (
    <PublicShell>
      <section className="wrap max-w-lg space-y-6 py-12">
        <h1 className="font-serif text-4xl">{m.account}</h1>
        <p>{actor.user.email}</p>
        {actor.role === "ADMIN" && (
          <a className="text-link" href={project.routes.admin}>
            {m.administrator}
          </a>
        )}
        <a className="text-link" href={project.routes.measurements}>
          {customerMessages.profiles}
        </a>
        <a className="text-link" href={project.routes.library}>
          {documentMessages.library}
        </a>
        <SessionControls />
        <h2 className="font-serif text-3xl">{m.mfa}</h2>
        {actor.user.twoFactorEnabled ? (
          <p>{m.setupDone}</p>
        ) : (
          <details>
            <summary className="cursor-pointer">{m.enableMfa}</summary>
            <div className="mt-4">
              <AuthForm mode="enroll" />
            </div>
          </details>
        )}
      </section>
    </PublicShell>
  );
}
