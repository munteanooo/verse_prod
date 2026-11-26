"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { project } from "@/config/project";
import { identityMessages as m } from "@/i18n/identity-ro";
import { postIdentity } from "./auth-form";

export function SessionControls() {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function endSession(endpoint: string) {
    setPending(true);
    setFailed(false);
    try {
      const response = await postIdentity(endpoint, {});
      if (!response.ok) throw new Error("Session operation failed.");
      window.location.replace(project.routes.login);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-3">
      <Button disabled={pending} onClick={() => void endSession("/sign-out")}>
        {m.signOut}
      </Button>
      <Button
        disabled={pending}
        onClick={() => void endSession("/revoke-sessions")}
      >
        {m.revoke}
      </Button>
      {failed && <p role="alert">{m.generic}</p>}
    </div>
  );
}
