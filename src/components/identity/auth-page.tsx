import { connection } from "next/server";
import { project } from "@/config/project";
import { identityMessages as m } from "@/i18n/identity-ro";
import { AuthForm } from "./auth-form";

const labels = {
  login: m.login,
  register: m.register,
  forgot: m.forgot,
  verify: m.verify,
  reset: m.reset,
};

export async function AuthPage({ mode }: { mode: keyof typeof labels }) {
  await connection();
  const routes = project.routes;
  return (
    <section className="wrap mx-auto max-w-lg py-12">
      <h1 className="mb-7 font-serif text-4xl">{labels[mode]}</h1>
      <AuthForm mode={mode} />
      <nav
        aria-label={m.account}
        className="mt-6 flex flex-wrap gap-x-4 text-sm"
      >
        {mode !== "login" && (
          <a className="text-link" href={routes.login}>
            {m.login}
          </a>
        )}
        {mode === "login" && (
          <>
            <a className="text-link" href={routes.register}>
              {m.register}
            </a>
            <a className="text-link" href={routes.forgotPassword}>
              {m.forgot}
            </a>
            <a className="text-link" href={routes.verifyEmail}>
              {m.verify}
            </a>
          </>
        )}
      </nav>
    </section>
  );
}
