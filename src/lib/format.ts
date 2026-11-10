const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const usdRound = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function usd(n: number, opts?: { round?: boolean }) {
  return opts?.round ? usdRound.format(n) : usdFmt.format(n);
}

export function musd(n: number, opts?: { round?: boolean }) {
  const f = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: opts?.round ? 0 : 2,
    minimumFractionDigits: opts?.round ? 0 : 2,
  });
  return `${f.format(n)} MUSD`;
}

export function btc(n: number) {
  return `${n.toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 4 })} BTC`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Deterministic (UTC) formatting so server and browser render the same text. */
export function shortDate(iso: string) {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function shortDateTime(iso: string) {
  const d = new Date(iso);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes().toString().padStart(2, "0");
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()} · ${h12}:${m} ${h < 12 ? "AM" : "PM"}`;
}
