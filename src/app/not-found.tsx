import { PublicShell } from "@/components/layout/public-shell";
import { StatusMessage } from "@/components/layout/status-message";
import { messages } from "@/i18n";

export default function NotFound() {
  return (
    <PublicShell>
      <StatusMessage
        title={messages.errors.notFoundTitle}
        description={messages.errors.notFoundDescription}
      />
    </PublicShell>
  );
}
