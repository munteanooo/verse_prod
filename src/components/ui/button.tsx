import type { ComponentProps } from "react";
import { cn } from "./utils";

const actionClass =
  "inline-flex min-h-12 items-center justify-center rounded-sm bg-foreground px-5 py-3 text-sm font-semibold text-background hover:bg-accent hover:text-background";

export function Button({
  className,
  type = "button",
  ...props
}: ComponentProps<"button">) {
  return (
    <button type={type} className={cn(actionClass, className)} {...props} />
  );
}

export function ActionLink({ className, ...props }: ComponentProps<"a">) {
  return <a className={cn(actionClass, className)} {...props} />;
}
