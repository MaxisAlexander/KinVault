import { useState } from "react";
import { ExternalLink, FileCheck2, ShieldAlert, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { btc, shortDateTime, usd } from "@/lib/format";
import { shortHash, verifyChain, type ChainCheck } from "@/lib/ledger-chain";
import { explorerBlockUrl } from "@/lib/mezo";
import { memberById, useVault } from "@/lib/vault-store";

export function LedgerExplorer({ trigger }: { trigger: React.ReactNode }) {
  const activity = useVault((s) => s.activity);
  const state = useVault((s) => s);
  const [check, setCheck] = useState<ChainCheck | null>(null);

  return (
    <Sheet onOpenChange={(o) => o && setCheck(null)}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-xl font-bold">
            <FileCheck2 className="h-5 w-5 text-primary" /> Ledger receipts
          </SheetTitle>
          <SheetDescription>
            Every family action gets a receipt hash that links to the one before it, plus the Mezo
            block height at the moment it was recorded. Changing any past entry breaks the chain.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 rounded-2xl border border-border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold">Integrity check</p>
              <p className="text-xs text-muted-foreground">{activity.length} receipts on record</p>
            </div>
            <Button size="sm" onClick={() => setCheck(verifyChain(activity))}>
              Verify chain
            </Button>
          </div>
          {check && (
            <p
              className={
                check.ok
                  ? "mt-3 flex items-center gap-2 rounded-lg bg-mint px-3 py-2 text-sm font-semibold text-mint-foreground"
                  : "mt-3 flex items-center gap-2 rounded-lg bg-destructive-soft px-3 py-2 text-sm font-semibold text-destructive"
              }
            >
              {check.ok ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              {check.ok
                ? `All ${check.checked} receipts verified — nothing has been altered`
                : `Chain broken at receipt ${check.brokenAt}`}
            </p>
          )}
        </div>

        <ul className="mt-5 space-y-3">
          {activity.map((a) => {
            const m = memberById(state, a.memberId);
            return (
              <li key={a.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <p>
                    <span className="font-semibold">{m.name}</span>{" "}
                    <span className="text-muted-foreground">{a.text}</span>
                  </p>
                  {a.amount !== undefined && (
                    <span className="shrink-0 font-bold tabular">
                      {a.asset === "BTC" ? btc(a.amount) : usd(a.amount)}
                    </span>
                  )}
                </div>
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                  <dt>receipt</dt>
                  <dd className="truncate text-foreground" title={a.hash}>
                    {shortHash(a.hash)}
                  </dd>
                  <dt>previous</dt>
                  <dd className="truncate" title={a.prevHash}>
                    {shortHash(a.prevHash)}
                  </dd>
                  <dt>mezo block</dt>
                  <dd>
                    {a.block ? (
                      <a
                        href={explorerBlockUrl(a.block)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-primary hover:underline"
                      >
                        #{a.block.toLocaleString("en-US")} <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                  <dt>time</dt>
                  <dd>{shortDateTime(a.ts)} UTC</dd>
                </dl>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
