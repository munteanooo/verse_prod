"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { documentMessages as d } from "@/i18n/documents-ro";
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
  versionId,
  revision,
  canWithdraw = false,
  disabled = false,
}: {
  id: string;
  archived: boolean;
  draft: boolean;
  versionId?: string;
  revision?: number;
  canWithdraw?: boolean;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  if (archived) return null;
  async function run(
    action: "archive" | "publish" | "new-version" | "unpublish",
  ) {
    if (action === "archive" && !window.confirm(m.archivalConfirm)) return;
    if (action === "unpublish" && !window.confirm(d.confirmWithdraw)) return;
    setPending(true);
    setNotice("");
    try {
      const result =
        action === "publish"
          ? await mutateCatalog("patterns/" + id + "/publish", {
              versionId,
              revision,
            })
          : action === "unpublish"
            ? await mutateCatalog("patterns/" + id + "/unpublish")
            : await mutateCatalog("patterns/" + id + "/versions", { action });
      if (result.ok)
        window.location.assign(
          action === "archive"
            ? patternsHref
            : patternsHref +
                "/" +
                id +
                (action === "publish" || action === "unpublish"
                  ? "/preview"
                  : "/edit"),
        );
      else if (result.data.rejected || result.data.code === "storage")
        setNotice(m.publicationBlocked);
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
        {canWithdraw && (
          <Button
            disabled={pending || disabled}
            onClick={() => void run("unpublish")}
          >
            {d.unpublish}
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
