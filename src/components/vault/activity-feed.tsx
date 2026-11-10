import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  HandCoins,
  Landmark,
  LockKeyhole,
  ShoppingBag,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

import { btc, shortDateTime, usd } from "@/lib/format";
import { cn } from "@/lib/utils";
import { memberById, useVault, type Activity } from "@/lib/vault-store";
import { MemberAvatar } from "./member-avatar";

const ICONS: Record<Activity["kind"], typeof ArrowDownLeft> = {
  deposit: ArrowDownLeft,
  withdraw: ArrowUpRight,
  expense: ShoppingBag,
  approval: CheckCircle2,
  loan: Landmark,
  repay: HandCoins,
  lockbox: LockKeyhole,
  yield: Sparkles,
  family: Users,
  security: ShieldAlert,
};

export function ActivityFeed({ limit = 8 }: { limit?: number }) {
  const activity = useVault((s) => s.activity);
  const state = useVault((s) => s);
  return (
    <ul className="divide-y divide-border">
      {activity.slice(0, limit).map((a) => {
        const m = memberById(state, a.memberId);
        const Icon = ICONS[a.kind];
        return (
          <li
            key={a.id}
            className="flex items-center gap-3 py-3 animate-in fade-in slide-in-from-top-1"
          >
            <div className="relative">
              <MemberAvatar member={m} size="sm" />
              <span className="absolute -bottom-1 -right-1 flex h-4.5 w-4.5 items-center justify-center rounded-full border border-border bg-card">
                <Icon className="h-2.5 w-2.5 text-primary" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="font-semibold">{m.name}</span>{" "}
                <span className="text-muted-foreground">{a.text}</span>
              </p>
              <p className="text-xs text-muted-foreground">{shortDateTime(a.ts)}</p>
            </div>
            {a.amount !== undefined && (
              <span
                className={cn(
                  "shrink-0 text-sm font-bold tabular",
                  a.direction === "in" ? "text-primary" : "text-foreground",
                )}
              >
                {a.direction === "in" ? "+" : "−"}
                {a.asset === "BTC" ? btc(a.amount) : usd(a.amount)}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
