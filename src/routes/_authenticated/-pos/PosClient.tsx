import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Minus, Trash2, Search, UserPlus, X, Star, Gift,
  Sparkles, Flame, Flower, Scissors, Palette, User, CreditCard,
  Banknote, Wallet, ChevronRight,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ReceiptDialog } from "./ReceiptDialog";
import { publishSession, subscribeSession, type PosSession } from "@/lib/pos-session";
import { Monitor } from "lucide-react";

type Service = {
  id: string; name: string; price: number; starts_at: boolean;
  taxable: boolean; category_id: string;
};
type Category = { id: string; name: string; slug: string; sort_order: number; icon: string | null };
type Customer = {
  id: string; full_name: string; phone: string | null; email: string | null;
  total_spend?: number; visit_count?: number; last_visit_at?: string | null;
};
type Loyalty = {
  points_balance: number; lifetime_points: number;
  eyebrow_threading_count: number; free_eyebrow_credits: number;
};
type CartItem = {
  uid: string; service_id: string; service_name: string;
  unit_price: number; quantity: number; taxable: boolean; is_free?: boolean;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const ICONS: Record<string, any> = {
  sparkles: Sparkles, flame: Flame, flower: Flower, scissors: Scissors,
  palette: Palette, user: User, gift: Gift, crown: Star, "credit-card": CreditCard,
};

export function PosClient() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [tipPct, setTipPct] = useState<number | null>(null);
  const [tipCustom, setTipCustom] = useState<number>(0);
  const [discount, setDiscount] = useState(0);
  const [pointsRedeem, setPointsRedeem] = useState(0); // 100 pts = $5
  const [paying, setPaying] = useState(false);
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);
  const [custDialog, setCustDialog] = useState(false);
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [customerReady, setCustomerReady] = useState(false);
  const [customerChoseTip, setCustomerChoseTip] = useState<string | null>(null);

  const { data: cats = [] } = useQuery<Category[]>({
    queryKey: ["service_categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_categories")
        .select("*").eq("active", true).order("sort_order");
      if (error) throw error; return data as Category[];
    },
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services")
        .select("id,name,price,starts_at,taxable,category_id")
        .eq("active", true).order("sort_order");
      if (error) throw error; return data as Service[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_settings").select("*").limit(1).maybeSingle();
      if (error) throw error; return data;
    },
  });

  // Loyalty for current customer
  const { data: loyalty } = useQuery<Loyalty | null>({
    queryKey: ["loyalty", customer?.id],
    enabled: !!customer?.id,
    queryFn: async () => {
      const { data } = await supabase.from("loyalty_accounts")
        .select("points_balance,lifetime_points,eyebrow_threading_count,free_eyebrow_credits")
        .eq("customer_id", customer!.id).maybeSingle();
      return (data as Loyalty) ?? {
        points_balance: 0, lifetime_points: 0,
        eyebrow_threading_count: 0, free_eyebrow_credits: 0,
      };
    },
  });

  const currentCatId = activeCat ?? cats[0]?.id;
  const visibleServices = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q) return services.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 60);
    return services.filter((s) => s.category_id === currentCatId);
  }, [services, currentCatId, search]);

  const eyebrowService = useMemo(() => {
    const cat = cats.find((c) => c.slug === "threading");
    return services.find((s) => s.category_id === cat?.id && s.name.toLowerCase() === "eyebrow");
  }, [services, cats]);

  const addService = (svc: Service, opts?: { free?: boolean }) => {
    setCart((prev) => {
      if (opts?.free) {
        return [...prev, {
          uid: crypto.randomUUID(), service_id: svc.id, service_name: `${svc.name} (Free reward)`,
          unit_price: 0, quantity: 1, taxable: false, is_free: true,
        }];
      }
      const ex = prev.find((i) => i.service_id === svc.id && !i.is_free);
      if (ex) return prev.map((i) => i.uid === ex.uid ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        uid: crypto.randomUUID(), service_id: svc.id, service_name: svc.name,
        unit_price: Number(svc.price), quantity: 1, taxable: svc.taxable,
      }];
    });
  };

  const updateQty = (uid: string, delta: number) =>
    setCart((p) => p.map((i) => i.uid === uid ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i)
      .filter((i) => i.quantity > 0));
  const removeItem = (uid: string) => setCart((p) => p.filter((i) => i.uid !== uid));

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const taxableSubtotal = useMemo(() => cart.filter((i) => i.taxable).reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const taxRate = Number(settings?.tax_rate ?? 0);
  const pointsValue = pointsRedeem / 100 * 5; // 100 pts = $5
  const totalDiscount = Math.min(subtotal, discount + pointsValue);
  const taxableAfterDisc = Math.max(0, taxableSubtotal - totalDiscount);
  const tax = +(taxableAfterDisc * taxRate).toFixed(2);
  const tip = tipCustom > 0
    ? +tipCustom.toFixed(2)
    : tipPct ? +((subtotal - totalDiscount) * (tipPct / 100)).toFixed(2) : 0;
  const total = +(Math.max(0, subtotal - totalDiscount) + tax + tip).toFixed(2);

  // Broadcast live session to customer-display
  useEffect(() => {
    const session: PosSession = {
      items: cart.map((i) => ({
        uid: i.uid, service_name: i.service_name,
        unit_price: i.unit_price, quantity: i.quantity, is_free: i.is_free,
      })),
      customer: customer ? {
        full_name: customer.full_name,
        points_balance: loyalty?.points_balance,
        free_eyebrow_credits: loyalty?.free_eyebrow_credits,
        visit_count: customer.visit_count,
      } : null,
      subtotal, discount: totalDiscount, tax, tip, total,
      tipPct, tipCustom,
      status: cart.length === 0 ? "idle" : "building",
      business_name: settings?.business_name,
      updatedAt: Date.now(),
    };
    publishSession(session);
  }, [cart, customer, loyalty, subtotal, totalDiscount, tax, tip, total, tipPct, tipCustom, settings?.business_name]);

  const openCustomerView = () => {
    window.open("/customer-display", "soi-customer-display", "noopener");
  };

  // reset reward redemption when customer changes
  useEffect(() => { setPointsRedeem(0); }, [customer?.id]);

  const checkoutMut = useMutation({
    mutationFn: async (payload: {
      method: "cash" | "card" | "other";
      tendered?: number;
    }) => {
      if (cart.length === 0) throw new Error("Cart is empty");
      const { data: order, error: oErr } = await supabase.from("orders").insert({
        customer_id: customer?.id ?? null,
        status: "completed",
        subtotal, discount_total: totalDiscount, tax_total: tax,
        tip_total: tip, total, cashier_id: user!.id,
        completed_at: new Date().toISOString(),
        notes: pointsRedeem > 0 ? `Redeemed ${pointsRedeem} pts ($${pointsValue.toFixed(2)})` : null,
      }).select().single();
      if (oErr) throw oErr;

      const items = cart.map((i) => ({
        order_id: order.id, service_id: i.service_id, service_name: i.service_name,
        unit_price: i.unit_price, quantity: i.quantity, taxable: i.taxable,
      }));
      const { error: iErr } = await supabase.from("order_items").insert(items);
      if (iErr) throw iErr;

      const { error: pErr } = await supabase.from("payments").insert({
        order_id: order.id, method: payload.method, amount: total,
        status: "succeeded", created_by: user!.id,
        ...(payload.method === "card"
          ? { card_brand: "MOCK", card_last4: "0000", payment_intent_id: `pi_mock_${order.id.slice(0, 8)}` }
          : {}),
      });
      if (pErr) throw pErr;

      if (customer) {
        await supabase.from("customers").update({
          total_spend: Number(customer.total_spend ?? 0) + total,
          visit_count: (customer.visit_count ?? 0) + 1,
          last_visit_at: new Date().toISOString(),
        }).eq("id", customer.id);

        // redeem points
        if (pointsRedeem > 0 && loyalty) {
          await supabase.from("loyalty_accounts").update({
            points_balance: Math.max(0, loyalty.points_balance - pointsRedeem),
          }).eq("customer_id", customer.id);
          await supabase.from("loyalty_transactions").insert({
            customer_id: customer.id, order_id: order.id,
            points_delta: -pointsRedeem, reason: "redeemed_for_discount",
          });
        }

        // consume free eyebrow credit if used
        const freeUsed = cart.filter((i) => i.is_free).reduce((s, i) => s + i.quantity, 0);
        if (freeUsed > 0 && loyalty) {
          await supabase.from("loyalty_accounts").update({
            free_eyebrow_credits: Math.max(0, loyalty.free_eyebrow_credits - freeUsed),
          }).eq("customer_id", customer.id);
          await supabase.from("loyalty_transactions").insert({
            customer_id: customer.id, order_id: order.id,
            free_credits_delta: -freeUsed, reason: "redeemed_free_eyebrow",
          });
        }
      }

      await supabase.from("audit_logs").insert({
        user_id: user!.id, action: "order.completed",
        entity_type: "order", entity_id: order.id,
        metadata: { total, method: payload.method, tendered: payload.tendered ?? null },
      });

      return order.id;
    },
    onSuccess: (orderId) => {
      toast.success("Payment successful");
      // Flash "Thank you" on customer display
      publishSession({
        items: [], customer: null, subtotal: 0, discount: 0, tax: 0,
        tip: 0, total, tipPct: null, tipCustom: 0,
        status: "paid", business_name: settings?.business_name, updatedAt: Date.now(),
      });
      setReceiptOrderId(orderId);
      setCart([]); setCustomer(null); setTipPct(null); setTipCustom(0);
      setDiscount(0); setPointsRedeem(0); setPaying(false);
      qc.invalidateQueries({ queryKey: ["dashboard-today"] });
      qc.invalidateQueries({ queryKey: ["loyalty"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Checkout failed"),
  });

  const maxRedeemable = loyalty
    ? Math.min(Math.floor(loyalty.points_balance / 100) * 100, Math.floor(subtotal / 5) * 100)
    : 0;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-3 md:p-4">
      {/* TOP BAR — customer + customer-display launcher */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <div className="flex-1">
          <CustomerBar
            customer={customer}
            loyalty={loyalty ?? null}
            onClear={() => setCustomer(null)}
            onPick={() => setCustDialog(true)}
            onRedeemFreeEyebrow={() =>
              eyebrowService && addService(eyebrowService, { free: true })
            }
            cart={cart}
          />
        </div>
        <Button
          variant="outline"
          onClick={openCustomerView}
          title="Open the customer-facing display in a new window"
          className="h-auto gap-2 border-gold/60 px-4 text-foreground hover:bg-gold/10"
        >
          <Monitor className="h-4 w-4 text-gold" />
          Customer View
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_380px]">
        {/* CATALOG */}
        <Card className="flex flex-col overflow-hidden border-border/60 shadow-soft">
          <div className="border-b border-border bg-gradient-cream p-3 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search any service…"
                className="h-10 pl-10 text-sm"
              />
            </div>
            {!search && (
              <div className="flex flex-wrap gap-1.5">
                {cats.map((c) => {
                  const Icon = ICONS[c.icon ?? ""] ?? Sparkles;
                  const isActive = currentCatId === c.id;
                  return (
                    <button key={c.id} onClick={() => setActiveCat(c.id)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        isActive
                          ? "border-gold bg-card text-foreground shadow-soft"
                          : "border-border bg-card/50 text-muted-foreground hover:border-gold/60 hover:text-foreground"
                      }`}>
                      <Icon className="h-3.5 w-3.5" />{c.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto p-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
              {visibleServices.map((s) => (
                <button key={s.id} onClick={() => addService(s)}
                  className="group flex h-24 flex-col justify-between rounded-xl border-2 border-border bg-card p-3 text-left shadow-soft transition active:scale-95 hover:-translate-y-0.5 hover:border-gold hover:shadow-lift">
                  <span className="text-sm font-semibold leading-tight text-foreground line-clamp-2">{s.name}</span>
                  <span className="text-base font-bold text-gold">
                    {s.starts_at ? `${fmt(s.price)}+` : fmt(s.price)}
                  </span>
                </button>
              ))}
              {visibleServices.length === 0 && (
                <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
                  {search ? `No services match "${search}"` : "No services in this category yet."}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* CART */}
        <Card className="flex flex-col overflow-hidden border-border/60 shadow-lift">
          <div className="border-b border-border bg-primary px-4 py-3 text-primary-foreground">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg">Current Sale</h2>
              {cart.length > 0 && (
                <button onClick={() => setCart([])}
                  className="text-xs text-primary-foreground/70 hover:underline">Clear</button>
              )}
            </div>
            <p className="mt-0.5 text-xs text-primary-foreground/70">
              {cart.reduce((s, i) => s + i.quantity, 0)} item{cart.length === 1 ? "" : "s"}
              {customer ? ` · ${customer.full_name}` : " · Walk-in"}
            </p>
          </div>

          <div className="flex-1 overflow-auto px-3 py-2">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
                <Sparkles className="h-8 w-8 text-gold/60" />
                <p>Tap any service to start a sale</p>
                <p className="text-xs">Multiple services? Just keep tapping.</p>
              </div>
            ) : (
              <ul className="space-y-1.5">
                {cart.map((i) => (
                  <li key={i.uid} className={`rounded-lg border p-2.5 ${
                    i.is_free ? "border-gold/60 bg-gold/5" : "border-border bg-card"
                  }`}>
                    <div className="flex justify-between gap-2">
                      <span className="text-sm font-medium leading-tight">{i.service_name}</span>
                      <span className="whitespace-nowrap text-sm font-semibold">{fmt(i.unit_price * i.quantity)}</span>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(i.uid, -1)}><Minus className="h-3 w-3" /></Button>
                        <span className="w-7 text-center text-sm font-medium">{i.quantity}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(i.uid, 1)}><Plus className="h-3 w-3" /></Button>
                      </div>
                      <button onClick={() => removeItem(i.uid)} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-border bg-muted/40 px-4 py-3">
            {/* Loyalty rewards */}
            {customer && loyalty && (loyalty.free_eyebrow_credits > 0 || maxRedeemable > 0) && (
              <div className="mb-2 space-y-1.5 rounded-lg border border-gold/40 bg-gold/5 p-2">
                {loyalty.free_eyebrow_credits > 0 && eyebrowService && !cart.some((i) => i.is_free) && (
                  <button
                    onClick={() => addService(eyebrowService, { free: true })}
                    className="flex w-full items-center justify-between rounded-md bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-card/70">
                    <span className="flex items-center gap-1.5"><Gift className="h-3.5 w-3.5 text-gold" /> Apply free eyebrow ({loyalty.free_eyebrow_credits} avail)</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
                {maxRedeemable > 0 && pointsRedeem === 0 && (
                  <button
                    onClick={() => setPointsRedeem(maxRedeemable)}
                    className="flex w-full items-center justify-between rounded-md bg-card px-2.5 py-1.5 text-xs font-medium hover:bg-card/70">
                    <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-gold" /> Redeem {maxRedeemable} pts → -{fmt(maxRedeemable / 100 * 5)}</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                )}
                {pointsRedeem > 0 && (
                  <button onClick={() => setPointsRedeem(0)}
                    className="flex w-full items-center justify-between rounded-md bg-gold/20 px-2.5 py-1.5 text-xs font-semibold">
                    <span>{pointsRedeem} pts redeemed (-{fmt(pointsValue)})</span>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}

            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground">Disc $</Label>
              <Input type="number" min="0" value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                className="h-7 w-16 text-xs" />
            </div>

            {/* TIP — percentage shortcuts + custom $ */}
            {cart.length > 0 && (
              <div className="mb-3 rounded-lg border border-border bg-card p-2.5">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tip</span>
                  {(tipPct !== null || tipCustom > 0) && (
                    <button
                      onClick={() => { setTipPct(null); setTipCustom(0); }}
                      className="text-[11px] text-muted-foreground hover:text-destructive"
                    >No tip</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(settings?.tip_presets ?? [15, 18, 20]).map((p: number) => {
                    const active = tipPct === p && tipCustom === 0;
                    const amt = +((subtotal - totalDiscount) * (p / 100)).toFixed(2);
                    return (
                      <button key={p}
                        onClick={() => { setTipCustom(0); setTipPct(active ? null : p); }}
                        className={`flex-1 min-w-[64px] rounded-md border px-2 py-1.5 text-xs font-semibold transition ${
                          active
                            ? "border-gold bg-gold text-primary shadow-soft"
                            : "border-border bg-card hover:border-gold/60"
                        }`}>
                        <div>{p}%</div>
                        <div className="text-[10px] font-normal opacity-70">{fmt(amt)}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Label className="text-[11px] text-muted-foreground">Custom $</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={tipCustom || ""}
                    onChange={(e) => {
                      const v = Number(e.target.value) || 0;
                      setTipCustom(v);
                      if (v > 0) setTipPct(null);
                    }}
                    placeholder="0.00"
                    className={`h-8 flex-1 text-sm ${tipCustom > 0 ? "border-gold ring-1 ring-gold/30" : ""}`}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1 text-sm">
              <Row label="Subtotal" value={fmt(subtotal)} />
              {totalDiscount > 0 && <Row label="Discount" value={`-${fmt(totalDiscount)}`} />}
              <Row label="Tax" value={fmt(tax)} />
              {tip > 0 && <Row label="Tip" value={fmt(tip)} />}
              <Separator className="my-2" />
              <div className="flex items-baseline justify-between">
                <span className="font-display text-base">Total</span>
                <span className="font-display text-3xl font-semibold text-foreground">{fmt(total)}</span>
              </div>
            </div>
            <Button size="lg" disabled={cart.length === 0}
              onClick={() => setPaying(true)}
              className="mt-3 h-14 w-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90">
              Charge {fmt(total)}
            </Button>
          </div>
        </Card>
      </div>

      {/* Customer search dialog */}
      <CustomerSearchDialog
        open={custDialog}
        onOpenChange={setCustDialog}
        onPick={(c) => { setCustomer(c); setCustDialog(false); }}
        onNew={() => { setCustDialog(false); setNewCustOpen(true); }}
      />

      <NewCustomerDialog
        open={newCustOpen}
        onOpenChange={setNewCustOpen}
        userId={user!.id}
        onCreated={(c) => { setCustomer(c); setNewCustOpen(false); }}
      />

      {/* PAY DIALOG */}
      <PayDialog
        open={paying} onOpenChange={setPaying}
        total={total}
        pending={checkoutMut.isPending}
        onPay={(method, tendered) => checkoutMut.mutate({ method, tendered })}
      />

      <ReceiptDialog
        orderId={receiptOrderId}
        onClose={() => setReceiptOrderId(null)}
        settings={settings}
      />
    </div>
  );
}

/* -------- subcomponents -------- */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span><span className="text-foreground">{value}</span>
    </div>
  );
}

function CustomerBar({
  customer, loyalty, onPick, onClear, onRedeemFreeEyebrow, cart,
}: {
  customer: Customer | null; loyalty: Loyalty | null;
  onPick: () => void; onClear: () => void;
  onRedeemFreeEyebrow: () => void;
  cart: CartItem[];
}) {
  if (!customer) {
    return (
      <button onClick={onPick}
        className="flex items-center gap-3 rounded-xl border-2 border-dashed border-border bg-card px-4 py-3 text-left shadow-soft transition hover:border-gold hover:bg-card">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <User className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1">
          <p className="font-display text-base font-semibold">Walk-in customer</p>
          <p className="text-xs text-muted-foreground">Tap to attach a customer · earn rewards</p>
        </div>
        <Search className="h-5 w-5 text-muted-foreground" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-3 rounded-xl border-2 border-gold/60 bg-gradient-cream px-4 py-3 shadow-soft">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold text-primary font-display font-bold">
        {customer.full_name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-display text-base font-semibold">{customer.full_name}</p>
          {customer.phone && <span className="hidden text-xs text-muted-foreground sm:inline">· {customer.phone}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="gap-1 bg-gold/15 text-foreground border-gold/30">
            <Star className="h-3 w-3 text-gold" /> {loyalty?.points_balance ?? 0} pts
          </Badge>
          {(loyalty?.free_eyebrow_credits ?? 0) > 0 && (
            <button onClick={onRedeemFreeEyebrow}
              disabled={cart.some((i) => i.is_free)}
              className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-medium text-foreground hover:bg-gold/30 disabled:opacity-50">
              <Gift className="h-3 w-3 text-gold" /> {loyalty!.free_eyebrow_credits} free eyebrow
            </button>
          )}
          <span className="text-muted-foreground">
            {customer.visit_count ?? 0} visit{customer.visit_count === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onPick}>Switch</Button>
      <button onClick={onClear} className="rounded-full p-1 hover:bg-muted">
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}

function CustomerSearchDialog({
  open, onOpenChange, onPick, onNew,
}: {
  open: boolean; onOpenChange: (b: boolean) => void;
  onPick: (c: Customer) => void; onNew: () => void;
}) {
  const [q, setQ] = useState("");

  const { data: results = [] } = useQuery({
    queryKey: ["cust-search-pos", q],
    queryFn: async () => {
      let query = supabase.from("customers")
        .select("id,full_name,phone,email,total_spend,visit_count,last_visit_at")
        .order("last_visit_at", { ascending: false, nullsFirst: false })
        .limit(15);
      if (q.length >= 1) {
        const safe = q.replace(/[%,]/g, "");
        query = query.or(`full_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`);
      }
      const { data, error } = await query;
      if (error) throw error; return data as Customer[];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-display">Attach customer</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input autoFocus placeholder="Name, phone or email" className="h-11 pl-10"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!q && results.length > 0 && (
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Recent</p>
        )}
        <div className="max-h-72 space-y-1 overflow-auto">
          {results.map((c) => (
            <button key={c.id} onClick={() => onPick(c)}
              className="flex w-full items-center justify-between rounded-md border border-transparent p-2.5 text-left hover:border-gold/40 hover:bg-accent/40">
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{c.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{c.phone ?? c.email ?? "—"}</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p>{c.visit_count ?? 0} visits</p>
                <p className="text-gold font-semibold">{fmt(Number(c.total_spend ?? 0))}</p>
              </div>
            </button>
          ))}
          {q && results.length === 0 && (
            <p className="p-6 text-center text-xs text-muted-foreground">No matches</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onNew} className="w-full">
            <UserPlus className="mr-2 h-4 w-4" /> New customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewCustomerDialog({
  open, onOpenChange, userId, onCreated,
}: {
  open: boolean; onOpenChange: (b: boolean) => void;
  userId: string; onCreated: (c: Customer) => void;
}) {
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from("customers")
        .insert({ full_name, phone: phone || null, email: email || null, created_by: userId })
        .select().single();
      if (error) throw error; return data as Customer;
    },
    onSuccess: (c) => {
      toast.success(`${c.full_name} added`);
      setName(""); setPhone(""); setEmail("");
      onCreated(c);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">New customer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name *</Label>
            <Input autoFocus value={full_name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!full_name || mut.isPending}
            onClick={() => mut.mutate()}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            Save & attach
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({
  open, onOpenChange, total, pending, onPay,
}: {
  open: boolean; onOpenChange: (b: boolean) => void;
  total: number; pending: boolean;
  onPay: (method: "cash" | "card" | "other", tendered?: number) => void;
}) {
  const [method, setMethod] = useState<null | "cash" | "card" | "other">(null);
  const [tendered, setTendered] = useState<number>(0);

  useEffect(() => { if (open) { setMethod(null); setTendered(0); } }, [open]);

  const change = Math.max(0, tendered - total);
  const quickAmounts = [
    Math.ceil(total),
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
  ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Take payment · {fmt(total)}</DialogTitle>
        </DialogHeader>

        {!method ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <PayBtn icon={Banknote} label="Cash" sub="Open drawer" onClick={() => setMethod("cash")} />
            <PayBtn icon={CreditCard} label="Card" sub="Mock terminal" onClick={() => onPay("card")} disabled={pending} />
            <PayBtn icon={Wallet} label="Other" sub="Zelle / external" onClick={() => onPay("other")} disabled={pending} />
          </div>
        ) : method === "cash" ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Quick tender</p>
            <div className="grid grid-cols-4 gap-2">
              {quickAmounts.map((amt) => (
                <button key={amt} onClick={() => setTendered(amt)}
                  className={`rounded-lg border-2 p-3 text-center font-semibold ${
                    tendered === amt ? "border-gold bg-gold/10" : "border-border bg-card hover:border-gold/60"
                  }`}>${amt}</button>
              ))}
            </div>
            <div>
              <Label className="text-xs">Custom</Label>
              <Input type="number" min="0" step="0.01" value={tendered || ""}
                onChange={(e) => setTendered(Number(e.target.value) || 0)}
                className="h-12 text-xl font-semibold" />
            </div>
            {tendered > 0 && tendered >= total && (
              <div className="rounded-lg bg-gold/10 p-3 text-center">
                <p className="text-xs text-muted-foreground">Change due</p>
                <p className="font-display text-3xl font-semibold text-gold">{fmt(change)}</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setMethod(null)}>Back</Button>
              <Button disabled={pending || tendered < total}
                onClick={() => onPay("cash", tendered)}
                className="bg-primary text-primary-foreground hover:bg-primary/90">
                Confirm cash
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        <p className="text-center text-[11px] text-muted-foreground">
          Card payments use the mock provider. Connect Stripe Terminal in production.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function PayBtn({
  icon: Icon, label, sub, onClick, disabled,
}: {
  icon: any; label: string; sub: string;
  onClick: () => void; disabled?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex flex-col items-start gap-2 rounded-2xl border-2 border-border bg-card p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-gold disabled:opacity-50">
      <Icon className="h-6 w-6 text-gold" />
      <div>
        <div className="font-display text-xl font-semibold">{label}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
    </button>
  );
}
