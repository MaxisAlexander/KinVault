import { Droplets, ExternalLink, Link2, Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  MUSD,
  MEZO_TESTNET_CHAIN_ID,
  MEZO_TESTNET_FAUCET,
  TOKENS,
  explorerAddressUrl,
  explorerBlockUrl,
  explorerTokenUrl,
} from "@/lib/chain/config";
import { useMezo } from "@/lib/mezo";
import { cn } from "@/lib/utils";
import {
  connectWallet,
  disconnectWallet,
  hasBrowserWallet,
  shortAddress,
  switchToMezo,
  useWallet,
} from "@/lib/wallet";

const STATUS_DOT = {
  connecting: "bg-muted-foreground animate-pulse",
  online: "bg-primary",
  degraded: "bg-warning",
  offline: "bg-destructive",
} as const;

export function NetworkPill() {
  const status = useMezo((s) => s.status);
  const block = useMezo((s) => s.block);
  const latency = useMezo((s) => s.latencyMs);
  const label =
    status === "online" || status === "degraded"
      ? `#${block?.toLocaleString("en-US")}`
      : status === "connecting"
        ? "Connecting"
        : "Offline";
  return (
    <a
      href={block ? explorerBlockUrl(block) : "https://explorer.test.mezo.org"}
      target="_blank"
      rel="noreferrer"
      title={`Mezo Testnet · chain ${MEZO_TESTNET_CHAIN_ID}${latency ? ` · ${latency}ms` : ""}`}
      className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold lg:flex"
    >
      <span className={cn("h-2 w-2 rounded-full", STATUS_DOT[status])} />
      Mezo Testnet
      <span className="tabular text-muted-foreground">{label}</span>
      {latency !== null && <span className="tabular text-muted-foreground">· {latency}ms</span>}
    </a>
  );
}

export function WalletButton({ onLink }: { onLink?: (() => void) | undefined }) {
  const w = useWallet((s) => s);
  const onMezo = w.chainId === MEZO_TESTNET_CHAIN_ID;

  if (w.status !== "connected" || !w.address) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="hidden h-11 rounded-full sm:inline-flex"
        onClick={async () => {
          await connectWallet();
          if (!hasBrowserWallet()) {
            toast.error("No browser wallet found", {
              description: "Install MetaMask, Rabby or OKX Wallet to connect to Mezo Testnet.",
            });
          }
        }}
        disabled={w.status === "connecting"}
      >
        {w.status === "connecting" ? <Loader2 className="animate-spin" /> : <Wallet />}
        Connect wallet
      </Button>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="hidden h-11 rounded-full sm:inline-flex">
          <span className={cn("h-2 w-2 rounded-full", onMezo ? "bg-primary" : "bg-warning")} />
          {shortAddress(w.address)}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground">Connected on Mezo Testnet</p>
          <a
            href={explorerAddressUrl(w.address)}
            target="_blank"
            rel="noreferrer"
            className="text-xs font-semibold text-primary hover:underline"
          >
            Explorer
          </a>
        </div>
        <p className="mt-1 break-all font-mono text-xs">{w.address}</p>

        <div className="mt-3 space-y-2 rounded-xl bg-surface p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Network</span>
            <span className="font-semibold">{onMezo ? "Mezo Testnet" : `Chain ${w.chainId}`}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Test BTC</span>
            <span className="font-semibold tabular">
              {w.balanceBtc === null ? "—" : w.balanceBtc.toFixed(6)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">MUSD</span>
            <span className="font-semibold tabular">
              {w.balanceMusd === null ? "—" : w.balanceMusd.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">MEZO</span>
            <span className="font-semibold tabular">
              {w.balanceMezo === null ? "—" : w.balanceMezo.toFixed(2)}
            </span>
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          {!onMezo && (
            <Button
              size="sm"
              onClick={() =>
                switchToMezo().catch((e) =>
                  toast.error(e instanceof Error ? e.message : "Switch failed"),
                )
              }
            >
              Switch to Mezo Testnet
            </Button>
          )}
          {onLink && (
            <Button size="sm" variant="mint" onClick={onLink}>
              <Link2 /> Link to my family profile
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <a href={MEZO_TESTNET_FAUCET} target="_blank" rel="noreferrer">
              <Droplets /> Get test BTC &amp; MEZO
            </a>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={explorerTokenUrl(MUSD.address)} target="_blank" rel="noreferrer">
              <ExternalLink /> MUSD on explorer
            </a>
          </Button>
          <Button size="sm" variant="ghost" onClick={disconnectWallet}>
            Disconnect
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
