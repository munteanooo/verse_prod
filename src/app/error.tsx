"use client";

import { PublicShell } from "@/components/layout/public-shell";
import { StatusMessage } from "@/components/layout/status-message";
import { Button } from "@/components/ui/button";
import { messages } from "@/i18n";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <PublicShell>
      <StatusMessage
        title={messages.errors.errorTitle}
        description={messages.errors.errorDescription}
      >
        <Button onClick={reset}>{messages.errors.retry}</Button>
      </StatusMessage>
    </PublicShell>
  );
}
