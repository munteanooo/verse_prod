"use client";
import { Button } from "@/components/ui/button";
import { customerMessages as m } from "@/i18n/customer-ro";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="wrap grid gap-3 py-12">
      <p role="alert">{m.error}</p>
      <div>
        <Button onClick={reset}>{m.retry}</Button>
      </div>
    </section>
  );
}
