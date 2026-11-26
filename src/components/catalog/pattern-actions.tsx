"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { catalogMessages as m } from "@/i18n/catalog-ro";
import { messageFor, mutateCatalog } from "./controls";

import { patternsHref } from "./paths";

export function CreatePattern() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setPending(true);
    setError("");
    try {
      const result = await mutateCatalog("patterns");
      if (result.ok && typeof result.data.id === "string")
        window.location.assign(patternsHref + "/" + result.data.id + "/edit");
      else setError(messageFor(result.data.code));
    } catch {
      setError(m.errors.unavailable);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <Button disabled={pending} onClick={() => void create()}>
        {pending ? m.saving : m.newPattern}
      </Button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

export function PatternActions({
  id,
  archived,
  draft,
  disabled = false,
}: {
  id: string;
  archived: boolean;
  draft: boolean;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  if (archived) return null;
  async function run(action: "archive" | "publish" | "new-version") {
    if (action === "archive" && !window.confirm(m.archivalConfirm)) return;
    setPending(true);
    setNotice("");
    try {
      const result = await mutateCatalog("patterns/" + id + "/versions", {
        action,
      });
      if (result.ok)
        window.location.assign(
          action === "archive"
            ? patternsHref
            : patternsHref + "/" + id + "/edit",
        );
      else if (result.data.rejected) setNotice(m.publicationBlocked);
      else setNotice(messageFor(result.data.code));
    } catch {
      setNotice(m.errors.unavailable);
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {draft ? (
          <Button
            disabled={pending || disabled}
            onClick={() => void run("publish")}
          >
            {m.publish}
          </Button>
        ) : (
          <Button
            disabled={pending || disabled}
            onClick={() => void run("new-version")}
          >
            {m.createVersion}
          </Button>
        )}
        <Button
          disabled={pending || disabled}
          onClick={() => void run("archive")}
        >
          {m.archive}
        </Button>
      </div>
      <p className="mt-2 text-accent" role="status">
        {notice}
      </p>
    </div>
  );
}
