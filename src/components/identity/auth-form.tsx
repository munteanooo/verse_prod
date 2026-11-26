"use client";

import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { project } from "@/config/project";
import { identityMessages as m } from "@/i18n/identity-ro";
import {
  credentials,
  email,
  password,
  registration,
} from "@/modules/identity/validation";

const routes = project.routes;
const formConfig = {
  login: { endpoint: "/sign-in/email", schema: credentials },
  register: { endpoint: "/sign-up/email", schema: registration },
  forgot: { endpoint: "/request-password-reset", schema: z.object({ email }) },
  verify: { endpoint: "/send-verification-email", schema: z.object({ email }) },
  confirm: {
    endpoint: "/verify-email",
    schema: z.object({ token: z.string().min(1).max(2048) }),
  },
  reset: {
    endpoint: "/reset-password",
    schema: z.object({
      newPassword: password,
      token: z.string().min(1).max(512),
    }),
  },
  mfa: {
    endpoint: "/two-factor/verify-totp",
    schema: z.object({ code: z.string().regex(/^\d{6}$/) }),
  },
  backup: {
    endpoint: "/two-factor/verify-backup-code",
    schema: z.object({ code: z.string().trim().min(8).max(32) }),
  },
  enroll: {
    endpoint: "/two-factor/enable",
    schema: z.object({ password: credentials.shape.password }),
  },
};
const inputStyle =
  "mt-1 w-full rounded-sm border border-border bg-white px-3 py-2";

export async function postIdentity(endpoint: string, payload: object) {
  return fetch(routes.authApi + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function AuthForm({
  mode,
}: {
  mode: "login" | "register" | "forgot" | "verify" | "reset" | "enroll";
}) {
  const [step, setStep] = useState<keyof typeof formConfig>(mode);
  const [token, setToken] = useState<string | null>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const [setup, setSetup] = useState<{ uri: string; codes: string[] }>();
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    if (mode !== "verify" && mode !== "reset") return;
    const timer = window.setTimeout(() => {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      const linkToken = fragment.get("token");
      if (fragment.has("token")) {
        window.history.replaceState(
          window.history.state,
          "",
          window.location.pathname + window.location.search,
        );
      }
      setToken(linkToken);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [mode]);

  const activeStep = mode === "verify" && token ? "confirm" : step;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const active = formConfig[activeStep];
    const parsed = active.schema.safeParse({ ...values, token });
    if (!parsed.success) {
      setError(m.validation);
      return;
    }
    setPending(true);
    try {
      const result = await postIdentity(active.endpoint, parsed.data);
      if (!result.ok) {
        setError(
          result.status === 429
            ? m.slowDown
            : result.status === 503
              ? m.unavailable
              : m.generic,
        );
        return;
      }
      if (activeStep === "login") {
        const data: { twoFactorRedirect?: boolean } = await result.json();
        if (data.twoFactorRedirect) setStep("mfa");
        else window.location.replace(routes.account);
      } else if (
        (activeStep === "mfa" || activeStep === "backup") &&
        mode === "login"
      ) {
        window.location.replace(routes.account);
      } else if (activeStep === "enroll") {
        const data: { totpURI?: string; backupCodes?: string[] } =
          await result.json();
        if (!data.totpURI?.startsWith("otpauth://totp/")) {
          setError(m.generic);
          return;
        }
        setSetup({ uri: data.totpURI, codes: data.backupCodes ?? [] });
        setStep("mfa");
      } else if (activeStep === "mfa") {
        setComplete(true);
        setNotice(m.setupDone);
      } else if (activeStep === "confirm") {
        setComplete(true);
        setToken(null);
        setNotice(m.verificationReturn);
      } else if (activeStep === "reset") {
        setComplete(true);
        setNotice(m.resetDone);
      } else {
        setNotice(m.checkEmail);
      }
    } catch {
      setError(m.unavailable);
    } finally {
      setPending(false);
    }
  }

  if (mode === "reset" && token === null)
    return (
      <p>
        {m.resetInvalid}{" "}
        <a className="text-link" href={routes.forgotPassword}>
          {m.forgot}
        </a>
      </p>
    );

  const hasEmail = ["login", "register", "forgot", "verify"].includes(
    activeStep,
  );
  const hasPassword = ["login", "register", "reset", "enroll"].includes(
    activeStep,
  );
  const newPassword = activeStep === "register" || activeStep === "reset";
  return (
    <>
      {setup && (
        <div className="my-4 space-y-2">
          {!complete && (
            <>
              <p>{m.setupInstructions}</p>
              <a className="text-link" href={setup.uri}>
                {m.setupLink}
              </a>
              <p className="break-all">
                {m.setupKey}{" "}
                <code>{new URL(setup.uri).searchParams.get("secret")}</code>
              </p>
            </>
          )}
          <p>{m.saveCodes}</p>
          <ul className="grid grid-cols-2 gap-1 font-mono text-sm">
            {setup.codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>
        </div>
      )}
      {!complete && (
        <form
          method="post"
          action={routes.authApi + formConfig[activeStep].endpoint}
          onSubmit={submit}
          className="grid gap-4"
        >
          <fieldset disabled={pending} className="grid gap-4">
            {activeStep === "register" && (
              <label>
                {m.name}
                <input
                  className={inputStyle}
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                />
              </label>
            )}
            {hasEmail && (
              <label>
                {m.email}
                <input
                  className={inputStyle}
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
            )}
            {hasPassword && (
              <div>
                <label>
                  {activeStep === "reset" ? m.newPassword : m.password}
                  <input
                    className={inputStyle}
                    type={visible ? "text" : "password"}
                    name={activeStep === "reset" ? "newPassword" : "password"}
                    autoComplete={
                      newPassword ? "new-password" : "current-password"
                    }
                    minLength={newPassword ? 12 : undefined}
                    maxLength={128}
                    aria-describedby={newPassword ? "password-hint" : undefined}
                    required
                  />
                </label>
                {newPassword && (
                  <p
                    id="password-hint"
                    className="mt-1 text-sm text-muted-foreground"
                  >
                    {m.passwordHint}
                  </p>
                )}
                <button
                  type="button"
                  className="text-link text-sm"
                  aria-pressed={visible}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? m.hide : m.show}
                </button>
              </div>
            )}
            {activeStep === "mfa" && (
              <label>
                {m.code}
                <input
                  className={inputStyle}
                  name="code"
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  required
                />
              </label>
            )}
            {activeStep === "backup" && (
              <label>
                {m.backupCode}
                <input
                  className={inputStyle}
                  name="code"
                  autoComplete="off"
                  maxLength={32}
                  required
                />
              </label>
            )}
            {mode === "login" &&
              (activeStep === "mfa" || activeStep === "backup") && (
                <button
                  type="button"
                  className="text-link text-sm"
                  onClick={() => {
                    setError("");
                    setStep(activeStep === "mfa" ? "backup" : "mfa");
                  }}
                >
                  {activeStep === "mfa" ? m.useBackup : m.useTotp}
                </button>
              )}
            <Button type="submit">
              {pending
                ? m.pending
                : activeStep === "verify"
                  ? m.resend
                  : activeStep === "confirm"
                    ? m.confirm
                    : m.submit}
            </Button>
          </fieldset>
        </form>
      )}
      <p className="mt-3 text-sm text-accent" role="alert">
        {error}
      </p>
      <p className="mt-3 text-sm" role="status">
        {notice}
      </p>
      {complete && mode === "reset" && (
        <a className="text-link" href={routes.login}>
          {m.login}
        </a>
      )}
    </>
  );
}
