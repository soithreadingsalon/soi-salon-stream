import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  PosSession,
  emptySession,
  publishSession,
  readSession,
  subscribeSession,
} from "@/lib/pos-session";
import { Sparkles, Star, Gift, CheckCircle2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/customer-display")({
  component: CustomerDisplay,
  ssr: false,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const TIP_PRESETS = [15, 18, 20, 25];

function CustomerDisplay() {
  const [s, setS] = useState<PosSession>(emptySession);
  const [tipPct, setTipPct] = useState<number | null>(null);
  const [tipCustom, setTipCustom] = useState<number>(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const initial = readSession();
    setS(initial);
    setTipPct(initial.tipPct ?? null);
    setTipCustom(initial.tipCustom ?? 0);
    setReady(!!initial.customerReady);
    return subscribeSession((next) => {
      setS(next);
      // Stay in sync with cashier's tip changes
      if ((next.tipPct ?? null) !== tipPct) setTipPct(next.tipPct ?? null);
      if ((next.tipCustom ?? 0) !== tipCustom) setTipCustom(next.tipCustom ?? 0);
      // Reset local UI on new sale or after payment
      if (next.status === "paid" || next.status === "idle") {
        setReady(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isPaid = s.status === "paid";
  const empty = s.items.length === 0 && !isPaid;

  // Live tip $ shown to customer is computed from current session (matches cashier)
  const preTaxBase = Math.max(0, s.subtotal - s.discount);

  const updateTip = (next: { pct: number | null; custom: number }) => {
    setTipPct(next.pct);
    setTipCustom(next.custom);
    // Publish back to cashier
    const current = readSession();
    publishSession({
      ...current,
      customerTipPct: next.pct,
      customerTipCustom: next.custom,
    });
  };

  const confirmReady = () => {
    setReady(true);
    const current = readSession();
    publishSession({ ...current, customerReady: true });
  };

  return (
    <div className="min-h-screen bg-gradient-cream flex flex-col">
      <header className="border-b border-gold/30 bg-card px-8 py-6 text-center">
        <div className="font-display text-4xl font-semibold tracking-wide text-foreground">
          {s.business_name ?? "SOI Threading Salon"}
        </div>
        <p className="mt-1 text-sm uppercase tracking-[0.2em] text-muted-foreground">
          Welcome
        </p>
      </header>

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        {isPaid ? (
          <div className="text-center">
            <CheckCircle2 className="mx-auto h-24 w-24 text-gold" />
            <h1 className="mt-6 font-display text-5xl font-semibold">Thank you!</h1>
            <p className="mt-3 text-lg text-muted-foreground">
              We can't wait to see you again.
            </p>
            <p className="mt-8 font-display text-2xl">{fmt(s.total)} paid</p>
          </div>
        ) : empty ? (
          <div className="text-center text-muted-foreground">
            <Sparkles className="mx-auto h-16 w-16 text-gold/60" />
            <p className="mt-4 font-display text-2xl">Ready when you are</p>
            <p className="mt-2 text-sm">Your services will appear here.</p>
          </div>
        ) : (
          <div className="w-full max-w-2xl space-y-6 rounded-2xl border-2 border-gold/40 bg-card p-8 shadow-lift">
            {s.customer && (
              <div className="flex items-center justify-between rounded-xl bg-gold/10 px-4 py-3">
                <div>
                  <p className="font-display text-xl">Hi, {s.customer.full_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Visit #{(s.customer.visit_count ?? 0) + 1}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5">
                    <Star className="h-4 w-4 text-gold" />
                    <span className="font-semibold">{s.customer.points_balance ?? 0}</span> pts
                  </span>
                  {(s.customer.free_eyebrow_credits ?? 0) > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5">
                      <Gift className="h-4 w-4 text-gold" />
                      {s.customer.free_eyebrow_credits} free
                    </span>
                  )}
                </div>
              </div>
            )}

            <div>
              <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                Your services
              </p>
              <ul className="divide-y divide-border">
                {s.items.map((i) => (
                  <li
                    key={i.uid}
                    className={`flex items-baseline justify-between py-3 ${
                      i.is_free ? "text-gold" : ""
                    }`}
                  >
                    <span className="font-display text-lg">
                      {i.quantity > 1 && (
                        <span className="mr-2 text-muted-foreground">{i.quantity}×</span>
                      )}
                      {i.service_name}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {fmt(i.unit_price * i.quantity)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* TIP PICKER — customer chooses */}
            {!ready && (
              <div className="rounded-xl border-2 border-gold/40 bg-gold/5 p-5">
                <p className="mb-3 text-center font-display text-xl">
                  Add a tip for your stylist?
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {TIP_PRESETS.map((p) => {
                    const active = tipPct === p && tipCustom === 0;
                    const amt = +(preTaxBase * (p / 100)).toFixed(2);
                    return (
                      <button
                        key={p}
                        onClick={() => updateTip({ pct: active ? null : p, custom: 0 })}
                        className={`rounded-xl border-2 p-3 text-center transition active:scale-95 ${
                          active
                            ? "border-gold bg-gold text-primary shadow-lift"
                            : "border-border bg-card hover:border-gold/60"
                        }`}
                      >
                        <div className="text-xl font-bold">{p}%</div>
                        <div className="text-xs opacity-70">{fmt(amt)}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Custom $
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={tipCustom || ""}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      updateTip({ pct: v > 0 ? null : tipPct, custom: v });
                    }}
                    placeholder="0.00"
                    className={`h-11 flex-1 text-lg ${
                      tipCustom > 0 ? "border-gold ring-1 ring-gold/30" : ""
                    }`}
                  />
                  <button
                    onClick={() => updateTip({ pct: null, custom: 0 })}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    No tip
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5 border-t border-border pt-4 text-base tabular-nums">
              <Row l="Subtotal" v={fmt(s.subtotal)} />
              {s.discount > 0 && <Row l="Discount" v={`-${fmt(s.discount)}`} muted />}
              {s.tip > 0 && (
                <Row
                  l={`Tip${s.tipPct ? ` (${s.tipPct}%)` : ""}`}
                  v={fmt(s.tip)}
                />
              )}
              <Row l="Tax" v={fmt(s.tax)} />
              <div className="mt-3 flex items-baseline justify-between border-t border-gold/40 pt-3">
                <span className="font-display text-2xl">Total</span>
                <span className="font-display text-5xl font-semibold text-foreground">
                  {fmt(s.total)}
                </span>
              </div>
            </div>

            {/* READY TO PAY */}
            {ready ? (
              <div className="rounded-xl border-2 border-emerald-500/50 bg-emerald-500/10 px-5 py-4 text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20">
                  <span className="relative flex h-3.5 w-3.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75"></span>
                    <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-emerald-500"></span>
                  </span>
                </div>
                <p className="font-display text-xl text-emerald-700 dark:text-emerald-400">
                  Waiting for cashier…
                </p>
                <button
                  onClick={() => {
                    setReady(false);
                    const current = readSession();
                    publishSession({ ...current, customerReady: false });
                  }}
                  className="mt-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={confirmReady}
                className="flex w-full items-center justify-center gap-3 rounded-xl bg-primary px-6 py-5 font-display text-2xl font-semibold text-primary-foreground shadow-lift transition active:scale-[0.99] hover:bg-primary/90"
              >
                <Check className="h-6 w-6" />
                I'm Ready to Pay · {fmt(s.total)}
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-border bg-card/50 px-6 py-3 text-center text-xs text-muted-foreground">
        Customer display · please confirm with your cashier before paying
      </footer>
    </div>
  );
}

function Row({ l, v, muted }: { l: string; v: string; muted?: boolean }) {
  return (
    <div className={`flex justify-between ${muted ? "text-muted-foreground" : ""}`}>
      <span>{l}</span>
      <span>{v}</span>
    </div>
  );
}
