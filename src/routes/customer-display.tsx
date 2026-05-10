import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  PosSession,
  emptySession,
  readSession,
  subscribeSession,
} from "@/lib/pos-session";
import { Sparkles, Star, Gift, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/customer-display")({
  component: CustomerDisplay,
  ssr: false,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function CustomerDisplay() {
  const [s, setS] = useState<PosSession>(emptySession);

  useEffect(() => {
    setS(readSession());
    return subscribeSession(setS);
  }, []);

  const isPaid = s.status === "paid";
  const empty = s.items.length === 0 && !isPaid;

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
