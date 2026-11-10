import { cn } from "@/lib/utils";
import type { Member } from "@/lib/vault-store";
import type { Role } from "@/lib/vault-logic";

const TONES: Record<string, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  "chart-4": "bg-chart-4",
  "chart-5": "bg-chart-5",
  "chart-6": "bg-chart-6",
};

export function toneBg(tone: string) {
  return TONES[tone] ?? "bg-chart-1";
}

export function MemberAvatar({
  member,
  size = "md",
  className,
}: {
  member: Pick<Member, "initials" | "tone" | "name">;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    xs: "h-6 w-6 text-[9px]",
    sm: "h-8 w-8 text-[11px]",
    md: "h-10 w-10 text-xs",
    lg: "h-12 w-12 text-sm",
  };
  return (
    <span
      aria-label={member.name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold tracking-wide text-primary-foreground ring-2 ring-card",
        toneBg(member.tone),
        sizes[size],
        className,
      )}
    >
      {member.initials}
    </span>
  );
}

const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  spouse: "Spouse",
  teen: "Teen",
  kid: "Kid",
};

export function RoleBadge({ role }: { role: Role }) {
  const style =
    role === "admin" || role === "spouse"
      ? "bg-mint text-mint-foreground"
      : role === "teen"
        ? "bg-bitcoin-soft text-warning"
        : "bg-surface-2 text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        style,
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

export function Pill({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-mint px-3 py-1 text-xs font-semibold text-mint-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
