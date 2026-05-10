import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  getCustomerPairedId, setCustomerPairedId, pairByCode,
  type RegisterSession, type LiveCart,
} from "@/lib/register-session";
import { Sparkles, Star, Gift, CheckCircle2, Banknote, CreditCard, Wallet } from "lucide-react";

export const Route = createFileRoute("/customer-display")({
  component: CustomerDisplay,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

type ActiveOrder = {
  id: string;
  status: string;
  subtotal: number;
  discount_total: number;
  tax_total: number;
  tip_total: number;
  total: number;
  customer_tip_amount: number;
  customer_payment_method: string | null;
  customer_paid_confirmed: boolean;
};

function CustomerDisplay() {
  const [pairedId, setPairedId] = useState<string | null>(null);
  const [reg, setReg] = useState<RegisterSession | null>(null);
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const [showThankYou, setShowThankYou] = useState(false);

  // restore pair
  useEffect(() => { setPairedId(getCustomerPairedId()); }, []);

  // load register + subscribe
  useEffect(() => {
    if (!pairedId) { setReg(null); return; }
    let mounted = true;
    supabase.from("register_sessions").select("*").eq("id", pairedId).maybeSingle()
      .then(({ data }) => mounted && setReg((data ?? null) as unknown as RegisterSession | null));
    const ch = supabase.channel(`reg-cust-${pairedId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "register_sessions", filter: `id=eq.${pairedId}` },
        (p) => setReg(p.new as unknown as RegisterSession))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [pairedId]);

  // load active order + subscribe
  const activeOrderId = reg?.active_order_id ?? null;
  useEffect(() => {
    if (!activeOrderId) { setOrder(null); return; }
    let mounted = true;
    supabase.from("orders").select("*").eq("id", activeOrderId).maybeSingle()
      .then(({ data }) => mounted && setOrder((data ?? null) as unknown as ActiveOrder | null));
    const ch = supabase.channel(`ord-cust-${activeOrderId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${activeOrderId}` },
        (p) => setOrder(p.new as unknown as ActiveOrder))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [activeOrderId]);

  // when order completes → show thank you, then reset
  useEffect(() => {
    if (order?.status === "completed") {
      setShowThankYou(true);
      const t = setTimeout(() => setShowThankYou(false), 4000);
      return () => clearTimeout(t);
    }
  }, [order?.status]);

  if (!pairedId) {
    return <PairScreen onPaired={(id) => setPairedId(id)} />;
  }

  if (showThankYou) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-cream">
        <div className="text-center">
          <CheckCircle2 className="mx-auto mb-4 h-24 w-24 text-emerald-500" />
          <h1 className="font-display text-5xl">Thank you!</h1>
          <p className="mt-3 text-lg text-muted-foreground">See you again soon</p>
        </div>
      </div>
    );
  }

  // No active order → idle / show building cart if any
  const live: LiveCart | null = (reg?.live_cart && (reg.live_cart as any).items)
    ? (reg.live_cart as LiveCart) : null;

  if (!order) {
    return <IdleOrBuilding reg={reg} live={live} onUnpair={() => { setCustomerPairedId(null); setPairedId(null); }} />;
  }

  // Order exists → cashier hit Charge → customer interactive flow
  return <CheckoutScreen order={order} live={live} />;
}

/* ---------- Pair screen ---------- */
function PairScreen({ onPaired }: { onPaired: (id: string) => void }) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (code.length !== 4) return;
    setBusy(true); setErr(null);
    const r = await pairByCode(code);
    setBusy(false);
    if (r) onPaired(r.id);
    else setErr("No register found for this code");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-cream p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 text-center shadow-lift">
        <Sparkles className="mx-auto mb-3 h-10 w-10 text-gold" />
        <h1 className="font-display text-2xl">Pair this display</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask your cashier for the 4-digit pairing code shown on their screen.
        </p>
        <div className="mt-6 space-y-3">
          <Input
            inputMode="numeric" maxLength={4} autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            className="h-16 text-center font-display text-4xl tracking-[0.6em]"
            placeholder="––––"
          />
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button onClick={submit} disabled={code.length !== 4 || busy}
            className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary/90">
            {busy ? "Pairing…" : "Pair"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Idle / building ---------- */
function IdleOrBuilding({
  reg, live, onUnpair,
}: { reg: RegisterSession | null; live: LiveCart | null; onUnpair: () => void }) {
  const items = live?.items ?? [];
  const subtotal = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-cream">
      <header className="border-b border-border bg-card/80 px-6 py-3 text-xs text-muted-foreground backdrop-blur">
        <div className="flex items-center justify-between">
          <span>Paired to {reg?.register_name ?? "register"}</span>
          <button onClick={onUnpair} className="hover:text-destructive">unpair</button>
        </div>
      </header>

      {items.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-center">
          <div>
            <Sparkles className="mx-auto h-16 w-16 text-gold/60" />
            <h1 className="mt-4 font-display text-4xl">Welcome</h1>
            <p className="mt-2 text-lg text-muted-foreground">Your cashier will start your order shortly</p>
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-2xl flex-1 p-6">
          {live?.customer && (
            <div className="mb-4 rounded-2xl border-2 border-gold/40 bg-card p-4">
              <p className="font-display text-2xl">Hi, {live.customer.full_name}!</p>
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1">
                  <Star className="h-4 w-4 text-gold" /> {live.customer.points_balance ?? 0} points
                </span>
                {(live.customer.free_eyebrow_credits ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1">
                    <Gift className="h-4 w-4 text-gold" /> {live.customer.free_eyebrow_credits} free eyebrow
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-display text-xl">Your order</h2>
            <ul className="space-y-2">
              {items.map((i) => (
                <li key={i.uid} className={`flex items-baseline justify-between rounded-lg px-3 py-2 ${
                  i.is_free ? "bg-gold/10" : "bg-muted/40"
                }`}>
                  <span className="text-base">
                    {i.service_name} {i.quantity > 1 && <span className="text-sm text-muted-foreground">× {i.quantity}</span>}
                  </span>
                  <span className="font-semibold">{fmt(i.unit_price * i.quantity)}</span>
                </li>
              ))}
            </ul>
            <Separator className="my-3" />
            <div className="flex justify-between text-lg font-semibold">
              <span>Subtotal</span><span>{fmt(subtotal)}</span>
            </div>
            <p className="mt-3 text-center text-sm text-muted-foreground">
              Waiting for your cashier to finalize…
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Checkout (interactive) ---------- */
function CheckoutScreen({ order, live }: { order: ActiveOrder; live: LiveCart | null }) {
  const [tipPct, setTipPct] = useState<number | null>(null);
  const [tipCustom, setTipCustom] = useState<number>(0);
  const [method, setMethod] = useState<"cash" | "card" | "zelle" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const baseForTip = Number(order.subtotal) - Number(order.discount_total);
  const tip = useMemo(() => {
    if (tipCustom > 0) return +tipCustom.toFixed(2);
    if (tipPct) return +(baseForTip * (tipPct / 100)).toFixed(2);
    return 0;
  }, [tipPct, tipCustom, baseForTip]);

  const grand = +(Number(order.subtotal) - Number(order.discount_total) + Number(order.tax_total) + tip).toFixed(2);

  // Push tip choice live to order so cashier sees it
  useEffect(() => {
    if (order.customer_paid_confirmed) return;
    supabase.from("orders").update({
      customer_tip_amount: tip,
      customer_payment_method: method,
      tip_total: tip,
      total: grand,
    } as any).eq("id", order.id);
  }, [tip, method, order.id, grand, order.customer_paid_confirmed]);

  const confirmPaid = async () => {
    if (!method) return;
    setSubmitting(true);
    await supabase.from("orders").update({
      customer_paid_confirmed: true,
      customer_payment_method: method,
      customer_tip_amount: tip,
      tip_total: tip,
      total: grand,
      status: "awaiting_confirmation",
    } as any).eq("id", order.id);
    setSubmitting(false);
  };

  if (order.customer_paid_confirmed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-cream">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-gold/30 border-t-gold" />
          <p className="mt-4 font-display text-2xl">Confirming with cashier…</p>
        </div>
      </div>
    );
  }

  const items = live?.items ?? [];

  return (
    <div className="min-h-screen bg-gradient-cream">
      <div className="mx-auto max-w-2xl space-y-4 p-4 md:p-6">
        {/* Order summary */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h2 className="mb-3 font-display text-xl">Your order</h2>
          <ul className="space-y-1.5 text-sm">
            {items.map((i) => (
              <li key={i.uid} className="flex justify-between">
                <span>{i.service_name}{i.quantity > 1 ? ` × ${i.quantity}` : ""}</span>
                <span className="font-medium">{fmt(i.unit_price * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <Separator className="my-3" />
          <div className="space-y-1 text-sm">
            <Row label="Subtotal" value={fmt(Number(order.subtotal))} />
            {Number(order.discount_total) > 0 && <Row label="Discount" value={`-${fmt(Number(order.discount_total))}`} />}
            <Row label="Tax" value={fmt(Number(order.tax_total))} />
            {tip > 0 && <Row label="Tip" value={fmt(tip)} />}
          </div>
          <Separator className="my-3" />
          <div className="flex items-baseline justify-between">
            <span className="font-display text-lg">Total</span>
            <span className="font-display text-4xl text-foreground">{fmt(grand)}</span>
          </div>
        </div>

        {/* Tip */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h3 className="mb-3 font-display text-lg">Add a tip</h3>
          <div className="grid grid-cols-4 gap-2">
            {[15, 18, 20, 25].map((p) => {
              const active = tipPct === p && tipCustom === 0;
              const amt = +(baseForTip * (p / 100)).toFixed(2);
              return (
                <button key={p}
                  onClick={() => { setTipCustom(0); setTipPct(active ? null : p); }}
                  className={`rounded-xl border-2 p-3 text-center transition active:scale-95 ${
                    active ? "border-gold bg-gold/15" : "border-border bg-card hover:border-gold/60"
                  }`}>
                  <div className="font-display text-2xl">{p}%</div>
                  <div className="text-xs text-muted-foreground">{fmt(amt)}</div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <Label className="text-xs">Custom $</Label>
            <Input type="number" min="0" step="0.01" value={tipCustom || ""}
              onChange={(e) => { const v = Number(e.target.value) || 0; setTipCustom(v); if (v > 0) setTipPct(null); }}
              placeholder="0.00" className="h-11 text-base" />
            <Button variant="outline" size="sm" onClick={() => { setTipCustom(0); setTipPct(null); }}>
              No tip
            </Button>
          </div>
        </div>

        {/* Payment method */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-soft">
          <h3 className="mb-3 font-display text-lg">How would you like to pay?</h3>
          <div className="grid grid-cols-3 gap-2">
            <PayBtn icon={Banknote} label="Cash" active={method === "cash"} onClick={() => setMethod("cash")} />
            <PayBtn icon={CreditCard} label="Card" active={method === "card"} onClick={() => setMethod("card")} />
            <PayBtn icon={Wallet} label="Zelle" active={method === "zelle"} onClick={() => setMethod("zelle")} />
          </div>
        </div>

        <Button
          disabled={!method || submitting}
          onClick={confirmPaid}
          className="h-16 w-full bg-primary text-xl font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {submitting ? "Sending…" : method ? `I paid ${fmt(grand)} • ${labelFor(method)}` : "Choose a payment method"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Tap above once you've handed cash, sent Zelle, or tapped your card.
        </p>
      </div>
    </div>
  );
}

function labelFor(m: string) {
  return m === "cash" ? "Cash" : m === "card" ? "Card" : "Zelle";
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className="text-foreground">{value}</span></div>;
}

function PayBtn({ icon: Icon, label, active, onClick }: any) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-xl border-2 p-4 transition active:scale-95 ${
        active ? "border-gold bg-gold/15" : "border-border bg-card hover:border-gold/60"
      }`}>
      <Icon className={`h-7 w-7 ${active ? "text-gold" : "text-muted-foreground"}`} />
      <span className="font-display text-base">{label}</span>
    </button>
  );
}
