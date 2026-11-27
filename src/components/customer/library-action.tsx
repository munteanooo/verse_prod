"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { project } from "@/config/project";
import { documentMessages as m } from "@/i18n/documents-ro";
import { customerMessages as c } from "@/i18n/customer-ro";

export function LibraryAction({
  slug,
  patternId,
}: {
  slug?: string;
  patternId?: string;
}) {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState("");
  async function update() {
    setPending(true);
    setStatus("");
    try {
      const response = await fetch(project.routes.api + "/account/library", {
        method: patternId ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patternId ? { patternId } : { slug }),
      });
      if (!response.ok) throw new Error("Library operation failed");
      if (patternId) window.location.reload();
      else setStatus(m.librarySaved);
    } catch {
      setStatus(c.error);
    } finally {
      setPending(false);
    }
  }
  return (
    <div>
      <Button
        disabled={pending || status === m.librarySaved}
        onClick={() => void update()}
      >
        {patternId ? m.libraryRemove : m.saveLibrary}
      </Button>
      {status && (
        <p className="mt-2" role="status">
          {status}
        </p>
      )}
    </div>
  );
}
