import { cn } from "@/lib/utils";

/** One-line, human error under a form field. Renders nothing when valid. */
export function FieldError({
  children,
  id,
  className,
}: {
  children?: string | null | undefined;
  id?: string;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className={cn("text-xs font-semibold text-destructive", className)}>
      {children}
    </p>
  );
}
