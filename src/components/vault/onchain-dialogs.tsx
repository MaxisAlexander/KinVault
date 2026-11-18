import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpRight,
  Copy,
  ExternalLink,
  Loader2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEMO_MERCHANT_ADDRESS,
  explorerAddressUrl,
  explorerTxUrl,
  shortAddress,
} from "@/lib/chain/config";
import { getInjectedProvider, sendMusd, sendNativeBtc } from "@/lib/chain/transactions";
import {
  confirmBtcDeposit,
  confirmExpensePayment,
  confirmMusdDeposit,
  confirmWithdrawal,
  setTreasuryAddress,
} from "@/lib/family.functions";
import { toastError } from "@/lib/errors";
import { actions, memberById, useVault, type Expense } from "@/lib/vault-store";
import { connectWallet, disconnectWallet, getWalletState, useWallet } from "@/lib/wallet";

type Payload = Awaited<ReturnType<typeof confirmMusdDeposit>>;

function hydrate(payload: Payload) {
  if (payload) actions.hydrateLive(payload);
}

function TxLink({ hash }: { hash: string }) {
  return (
    <a
      href={explorerTxUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-semibold underline"
    >
      {hash.slice(0, 10)}… <ExternalLink className="h-3 w-3" />
    </a>
  );
}

/**
 * Moves real test MUSD or test BTC from the member's wallet into the family
 * treasury, then asks the server to verify the receipt before crediting the
 * ledger. The wallet signs; KinVault never holds a key.
 */
export function FundVaultDialog({
  trigger,
  asset = "MUSD",
}: {
  trigger: ReactNode;
  asset?: "MUSD" | "BTC";
}) {
  const state = useVault((s) => s);
  const wallet = useWallet((s) => s);
  const queryClient = useQueryClient();
  const confirmMusd = useServerFn(confirmMusdDeposit);
  const confirmBtc = useServerFn(confirmBtcDeposit);
  const saveTreasury = useServerFn(setTreasuryAddress);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [treasuryInput, setTreasuryInput] = useState("");
  const [busy, setBusy] = useState(false);

  const acting = memberById(state, state.actingId);
  const mySeat = state.seats.find((s) => s.isMe);
  const linked = Boolean(
    mySeat?.walletAddress &&
    wallet.address &&
    mySeat.walletAddress.toLowerCase() === wallet.address.toLowerCase(),
  );
  const treasury = state.treasuryAddress ?? treasuryInput.trim();
  const isLive = state.mode === "live";
  // A deposit only moves value if the sender is a different address from the
  // treasury. Sending from the treasury wallet to itself is a no-op on chain, so
  // the server rejects it and the UI refuses to start the transfer.
  const sendingFromTreasury = Boolean(
    treasury && wallet.address && treasury.toLowerCase() === wallet.address.toLowerCase(),
  );

  async function submit() {
    if (!isLive) {
      toast.error("Fund with real test assets from a live family vault");
      return;
    }
    if (!wallet.address) {
      await connectWallet();
      return;
    }
    if (!treasury) {
      toast.error("Add the family treasury address first");
      return;
    }
    if (sendingFromTreasury) {
      toast.error("Switch wallets — the treasury can't fund itself");
      return;
    }
    if (!linked) {
      toast.error(
        "Link this wallet to your family seat first (wallet menu → Link to my family profile)",
      );
      return;
    }
    setBusy(true);
    try {
      const provider = getInjectedProvider();
      if (!provider) throw new Error("Connect a browser wallet first");
      const result =
        asset === "MUSD"
          ? await sendMusd({ provider, to: treasury as `0x${string}`, amountMusd: amount })
          : await sendNativeBtc({ provider, to: treasury as `0x${string}`, amountBtc: amount });
      const payload =
        asset === "MUSD"
          ? await confirmMusd({ data: { txHash: result.hash, treasuryAddress: treasury } })
          : await confirmBtc({ data: { txHash: result.hash, treasuryAddress: treasury } });
      hydrate(payload);
      await queryClient.invalidateQueries();
      toast.success(`${asset} funded on Mezo Testnet`, {
        description: <TxLink hash={result.hash} />,
      });
      setOpen(false);
      setAmount("");
    } catch (error) {
      toastError(error, "The testnet transfer failed");
    } finally {
      setBusy(false);
    }
  }

  const available = asset === "MUSD" ? wallet.balanceMusd : wallet.balanceBtc;

  /** Designates the connected wallet as the treasury, without moving funds. */
  async function saveWalletAsTreasury() {
    if (!wallet.address) return;
    setBusy(true);
    try {
      const payload = await saveTreasury({ data: { address: wallet.address } });
      if (payload) actions.hydrateLive(payload);
      setTreasuryInput(wallet.address);
      await queryClient.invalidateQueries();
      toast.success("Treasury wallet saved", {
        description:
          "Funds already at this address are shown on the dashboard; deposits made through KinVault are credited to the ledger.",
      });
    } catch (error) {
      toastError(error, "Could not save the treasury address");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTreasuryInput(state.treasuryAddress ?? "");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Fund with test {asset}</DialogTitle>
          <DialogDescription>
            Sends real test {asset} from your wallet to the family treasury on Mezo Testnet. The
            server verifies the receipt before the ledger updates.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Treasury</span>
              <span className="flex items-center gap-1.5 font-mono text-xs">
                {treasury ? shortAddress(treasury) : "Not set"}
                {treasury && (
                  <>
                    <button
                      type="button"
                      aria-label="Copy the treasury address"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => {
                        void navigator.clipboard.writeText(treasury);
                        toast.success("Treasury address copied");
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </button>
                    <a
                      href={explorerAddressUrl(treasury)}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open the treasury on the Mezo explorer"
                      className="text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Wallet balance</span>
              <span className="font-semibold tabular">
                {available === null ? "—" : available.toFixed(asset === "BTC" ? 6 : 2)}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Contributing as</span>
              <span className="font-semibold">{acting.name}</span>
            </div>
          </div>
          {!state.treasuryAddress && (
            <div className="space-y-2">
              <Label htmlFor="treasury-address">Treasury wallet address</Label>
              <Input
                id="treasury-address"
                value={treasuryInput}
                onChange={(e) => setTreasuryInput(e.target.value)}
                placeholder="0x… treasury wallet address"
                className="h-11 rounded-xl font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Only an admin can set this on the first deposit. It must be a different wallet from
                the one you are sending from — use a second test wallet so the transfer actually
                moves value. If this wallet already holds the family&apos;s test BTC and MUSD, save
                it as the treasury instead.
              </p>
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full gap-1.5"
                disabled={!wallet.address || busy}
                onClick={() => void saveWalletAsTreasury()}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Wallet className="h-4 w-4" />}
                Use my connected wallet as the treasury
              </Button>
            </div>
          )}
          {sendingFromTreasury && (
            <div className="space-y-2 rounded-lg bg-warning-soft px-3 py-2.5 text-xs text-warning">
              <p className="font-semibold">
                This wallet is the family treasury. Sending {asset} to itself moves nothing, so the
                transfer is blocked.
              </p>
              <p>
                Fund from a different wallet — or skip funding entirely: borrowing spends the
                treasury&apos;s own test BTC on Mezo and does not need a deposit.
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 border-warning/40 bg-card text-warning"
                onClick={() => {
                  disconnectWallet();
                  toast.info("Wallet disconnected — connect the wallet that will send the funds");
                }}
              >
                <ArrowLeftRight className="h-3.5 w-3.5" /> Switch wallet
              </Button>
            </div>
          )}
          {!linked && wallet.address && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
              This wallet is not linked to your family seat yet. Open the wallet menu and choose
              “Link to my family profile”.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="fund-amount">Amount ({asset})</Label>
            <Input
              id="fund-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-12 rounded-xl text-lg font-semibold tabular"
            />
            {!wallet.address && (
              <p className="flex items-center gap-1 text-xs text-warning">
                <Wallet className="h-3.5 w-3.5" /> Connect your wallet to continue.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            size="lg"
            className="w-full"
            onClick={() => void submit()}
            disabled={busy || !amount || !treasury || sendingFromTreasury}
          >
            {busy ? <Loader2 className="animate-spin" /> : <ArrowDownToLine />}
            Fund {asset} on Mezo Testnet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Settles an approved expense with a real MUSD transfer from the treasury. */
export function PayExpenseButton({ expense }: { expense: Expense }) {
  const state = useVault((s) => s);
  const wallet = useWallet((s) => s);
  const queryClient = useQueryClient();
  const confirmPayment = useServerFn(confirmExpensePayment);
  const [open, setOpen] = useState(false);
  const [merchant, setMerchant] = useState(expense.merchantAddress ?? DEMO_MERCHANT_ADDRESS);
  const [busy, setBusy] = useState(false);

  const acting = memberById(state, state.actingId);
  const isGuardian = acting.role === "admin" || acting.role === "spouse";
  const isTreasury = Boolean(
    state.treasuryAddress &&
    wallet.address &&
    state.treasuryAddress.toLowerCase() === wallet.address.toLowerCase(),
  );
  const canPay =
    state.mode === "live" &&
    isGuardian &&
    isTreasury &&
    !expense.onchain &&
    expense.status === "approved";

  if (!canPay) return null;

  async function pay() {
    if (!state.treasuryAddress) return;
    setBusy(true);
    try {
      const provider = getInjectedProvider();
      if (!provider) throw new Error("Connect the treasury wallet first");
      const result = await sendMusd({
        provider,
        to: merchant as `0x${string}`,
        amountMusd: expense.amount.toFixed(2),
      });
      const payload = await confirmPayment({
        data: { txHash: result.hash, expenseId: expense.id, merchantAddress: merchant },
      });
      hydrate(payload);
      await queryClient.invalidateQueries();
      toast.success("Expense settled with MUSD", { description: <TxLink hash={result.hash} /> });
      setOpen(false);
    } catch (error) {
      toastError(error, "The MUSD payment failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="mint">
          <Wallet /> Pay MUSD
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Pay {expense.merchant} in MUSD</DialogTitle>
          <DialogDescription>
            The treasury wallet sends {expense.amount.toFixed(2)} MUSD on Mezo Testnet. Only the
            linked treasury wallet can sign.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl bg-surface p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-bold tabular">{expense.amount.toFixed(2)} MUSD</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Treasury</span>
              <span className="font-mono text-xs">
                {state.treasuryAddress ? shortAddress(state.treasuryAddress) : "—"}
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="merchant-address">Merchant wallet</Label>
            <Input
              id="merchant-address"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="h-11 rounded-xl font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              Default is a burn address for a safe testnet demo. Replace it with the merchant or a
              second test wallet.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button size="lg" className="w-full" onClick={() => void pay()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Wallet />}
            Sign MUSD payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Moves real MUSD or test BTC from the family treasury to a member's linked
 * wallet. The treasury signs; the server verifies the transfer before debiting
 * the ledger.
 */
export function WithdrawDialog({ trigger }: { trigger: ReactNode }) {
  const state = useVault((s) => s);
  const wallet = useWallet((s) => s);
  const queryClient = useQueryClient();
  const confirm = useServerFn(confirmWithdrawal);
  const [open, setOpen] = useState(false);
  const [asset, setAsset] = useState<"MUSD" | "BTC">("MUSD");
  const [toMemberId, setToMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const treasury = state.treasuryAddress;
  const isTreasury = Boolean(
    treasury && wallet.address && treasury.toLowerCase() === wallet.address.toLowerCase(),
  );
  const recipients = state.seats.filter(
    (s) => s.walletAddress && s.walletAddress.toLowerCase() !== treasury?.toLowerCase(),
  );
  const recipient = recipients.find((s) => s.id === toMemberId) ?? recipients[0];
  const available =
    asset === "MUSD" ? state.vault.musd : Math.max(0, state.vault.btc - state.vault.btcLocked);
  const n = parseFloat(amount) || 0;

  async function submit() {
    if (!treasury) {
      toast.error("This family has no treasury yet");
      return;
    }
    if (!isTreasury) {
      toast.error("Connect the treasury wallet to sign the withdrawal");
      return;
    }
    if (!recipient?.walletAddress) {
      toast.error("That member has not linked a wallet yet");
      return;
    }
    if (!(n > 0)) {
      toast.error("Enter an amount above zero");
      return;
    }
    setBusy(true);
    try {
      const provider = getInjectedProvider();
      if (!provider) throw new Error("Connect a browser wallet first");
      const result =
        asset === "MUSD"
          ? await sendMusd({
              provider,
              to: recipient.walletAddress as `0x${string}`,
              amountMusd: amount,
            })
          : await sendNativeBtc({
              provider,
              to: recipient.walletAddress as `0x${string}`,
              amountBtc: amount,
            });
      const payload = await confirm({
        data: { txHash: result.hash, asset, toMemberId: recipient.id },
      });
      hydrate(payload);
      await queryClient.invalidateQueries();
      toast.success(`${asset} withdrawn on Mezo Testnet`, {
        description: <TxLink hash={result.hash} />,
      });
      setOpen(false);
      setAmount("");
    } catch (error) {
      toastError(error, "The testnet withdrawal failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setToMemberId(recipients[0]?.id ?? "");
          setAmount("");
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Withdraw from the treasury</DialogTitle>
          <DialogDescription>
            The treasury wallet sends real test {asset} to a family member's linked wallet on Mezo
            Testnet. The server verifies the transfer before the ledger updates.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-surface p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Treasury</span>
              <span className="font-mono text-xs">
                {treasury ? shortAddress(treasury) : "Not set"}
              </span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Available</span>
              <span className="font-semibold tabular">
                {available.toFixed(asset === "BTC" ? 6 : 2)} {asset}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Asset</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={asset === "MUSD" ? "default" : "outline"}
                onClick={() => setAsset("MUSD")}
              >
                MUSD
              </Button>
              <Button
                type="button"
                variant={asset === "BTC" ? "default" : "outline"}
                onClick={() => setAsset("BTC")}
              >
                Bitcoin
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Send to</Label>
            {recipients.length === 0 ? (
              <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
                No other family member has linked a wallet yet. Ask them to link one from the wallet
                menu first.
              </p>
            ) : (
              <Select value={recipient?.id ?? ""} onValueChange={setToMemberId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {recipients.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} · {shortAddress(s.walletAddress!)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="withdraw-amount">Amount ({asset})</Label>
            <Input
              id="withdraw-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-12 rounded-xl text-lg font-semibold tabular"
            />
          </div>

          {!isTreasury && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs font-semibold text-warning">
              Connect {treasury ? shortAddress(treasury) : "the treasury wallet"} to sign this
              withdrawal.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            size="lg"
            className="w-full"
            onClick={() => void submit()}
            disabled={busy || !amount || !recipient || !isTreasury}
          >
            {busy ? <Loader2 className="animate-spin" /> : <ArrowUpRight />}
            Withdraw {asset} on Mezo Testnet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
