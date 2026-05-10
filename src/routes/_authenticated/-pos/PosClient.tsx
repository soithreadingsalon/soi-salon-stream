import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Minus, Trash2, Search, UserPlus, X, Star, Gift,
  Sparkles, Flame, Flower, Scissors, Palette, User, CreditCard,
  Banknote, Wallet, ChevronRight, Monitor, ShoppingCart, Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ReceiptDialog } from "./ReceiptDialog";
import {
  useRegisterSession, publishLiveCart, setActiveOrder,
  type LiveCart,
} from "@/lib/register-session";

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
  const register = useRegisterSession();

  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [discount, setDiscount] = useState(0);
  const [pointsRedeem, setPointsRedeem] = useState(0);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [cashierPayOpen, setCashierPayOpen] = useState(false);
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);
  const [custDialog, setCustDialog] = useState(false);
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [cartSheetOpen, setCartSheetOpen] = useState(false);

  // active order state (when sent to customer)
  const [activeOrderId, setActiveOrderIdState] = useState<string | null>(null);
  const [liveOrder, setLiveOrder] = useState<any>(null);

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
    if (q) return services.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 80);
    return services.filter((s) => s.category_id === currentCatId);
  }, [services, currentCatId, search]);

  const eyebrowService = useMemo(() => {
    const cat = cats.find((c) => c.slug === "threading");
    return services.find((s) => s.category_id === cat?.id && s.name.toLowerCase() === "eyebrow");
  }, [services, cats]);

  const isFrozen = !!activeOrderId; // cashier UI freezes once order sent

  const addService = (svc: Service, opts?: { free?: boolean }) => {
    if (isFrozen) return;
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
  const pointsValue = pointsRedeem / 100 * 5;
  const totalDiscount = Math.min(subtotal, discount + pointsValue);
  const taxableAfterDisc = Math.max(0, taxableSubtotal - totalDiscount);
  const tax = +(taxableAfterDisc * taxRate).toFixed(2);
  // pre-tip total (customer adds tip on their tablet)
  const baseTotal = +(Math.max(0, subtotal - totalDiscount) + tax).toFixed(2);

  // Publish live cart to register session (debounced)
  const publishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!register?.id || isFrozen) return;
    if (publishTimer.current) clearTimeout(publishTimer.current);
    publishTimer.current = setTimeout(() => {
      const payload: LiveCart = {
        items: cart.map((i) => ({
          uid: i.uid, service_id: i.service_id, service_name: i.service_name,
          unit_price: i.unit_price, quantity: i.quantity, taxable: i.taxable, is_free: i.is_free,
        })),
        customer: customer ? {
          id: customer.id, full_name: customer.full_name,
          points_balance: loyalty?.points_balance,
          free_eyebrow_credits: loyalty?.free_eyebrow_credits,
          visit_count: customer.visit_count,
        } : null,
        business_name: settings?.business_name,
        updatedAt: Date.now(),
      };
      publishLiveCart(register.id, payload).catch(() => {});
    }, 250);
  }, [cart, customer, loyalty, settings?.business_name, register?.id, isFrozen]);

  // Subscribe to active order for live customer-tip + paid_confirmed
  useEffect(() => {
    if (!activeOrderId) { setLiveOrder(null); return; }
    let mounted = true;
    supabase.from("orders").select("*").eq("id", activeOrderId).maybeSingle()
      .then(({ data }) => mounted && setLiveOrder(data));
    const ch = supabase.channel(`pos-ord-${activeOrderId}`)
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `id=eq.${activeOrderId}` },
        (p) => setLiveOrder(p.new))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [activeOrderId]);

  useEffect(() => { setPointsRedeem(0); }, [customer?.id]);

  // Send to customer = create order with awaiting_customer status
  const sendToCustomer = useMutation({
    mutationFn: async () => {
      if (!register) throw new Error("No register");
      if (cart.length === 0) throw new Error("Cart is empty");
      const { data: order, error } = await supabase.from("orders").insert({
        customer_id: customer?.id ?? null,
        status: "awaiting_customer" as any,
        subtotal, discount_total: totalDiscount, tax_total: tax,
        tip_total: 0, total: baseTotal,
        cashier_id: user!.id,
        register_session_id: register.id,
        notes: pointsRedeem > 0 ? `Redeemed ${pointsRedeem} pts ($${pointsValue.toFixed(2)})` : null,
      } as any).select().single();
      if (error) throw error;
      const items = cart.map((i) => ({
        order_id: order.id, service_id: i.service_id, service_name: i.service_name,
        unit_price: i.unit_price, quantity: i.quantity, taxable: i.taxable,
      }));
      const { error: iErr } = await supabase.from("order_items").insert(items);
      if (iErr) throw iErr;
      await setActiveOrder(register.id, order.id);
      return order.id;
    },
    onSuccess: (oid) => {
      setActiveOrderIdState(oid);
      setChargeOpen(false);
      toast.success("Sent to customer tablet");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Cancel / unfreeze
  const cancelActive = useMutation({
    mutationFn: async () => {
      if (!activeOrderId || !register) return;
      // delete the order + items so we don't leave a half-order
      await supabase.from("order_items").delete().eq("order_id", activeOrderId);
      await supabase.from("orders").delete().eq("id", activeOrderId);
      await setActiveOrder(register.id, null);
    },
    onSuccess: () => {
      setActiveOrderIdState(null);
      setLiveOrder(null);
      toast.info("Cancelled — you can edit the order");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Finalize: write payment row, update customer, mark completed
  const finalize = useMutation({
    mutationFn: async (payload: {
      method: "cash" | "card" | "zelle" | "other";
      tendered?: number;
      tipAmount: number;
    }) => {
      if (!activeOrderId || !register) throw new Error("No active order");
      const finalTotal = +(baseTotal + payload.tipAmount).toFixed(2);
      const { error: uErr } = await supabase.from("orders").update({
        status: "completed" as any,
        tip_total: payload.tipAmount,
        total: finalTotal,
        completed_at: new Date().toISOString(),
      } as any).eq("id", activeOrderId);
      if (uErr) throw uErr;

      const { error: pErr } = await supabase.from("payments").insert({
        order_id: activeOrderId,
        method: payload.method === "zelle" ? "other" : payload.method,
        amount: finalTotal,
        status: "succeeded",
        created_by: user!.id,
        external_reference: payload.method === "zelle" ? "zelle" : null,
        ...(payload.method === "card"
          ? { card_brand: "MOCK", card_last4: "0000", payment_intent_id: `pi_mock_${activeOrderId.slice(0, 8)}` }
          : {}),
      } as any);
      if (pErr) throw pErr;

      if (customer) {
        await supabase.from("customers").update({
          total_spend: Number(customer.total_spend ?? 0) + finalTotal,
          visit_count: (customer.visit_count ?? 0) + 1,
          last_visit_at: new Date().toISOString(),
        }).eq("id", customer.id);

        if (pointsRedeem > 0 && loyalty) {
          await supabase.from("loyalty_accounts").update({
            points_balance: Math.max(0, loyalty.points_balance - pointsRedeem),
          }).eq("customer_id", customer.id);
          await supabase.from("loyalty_transactions").insert({
            customer_id: customer.id, order_id: activeOrderId,
            points_delta: -pointsRedeem, reason: "redeemed_for_discount",
          });
        }
        const freeUsed = cart.filter((i) => i.is_free).reduce((s, i) => s + i.quantity, 0);
        if (freeUsed > 0 && loyalty) {
          await supabase.from("loyalty_accounts").update({
            free_eyebrow_credits: Math.max(0, loyalty.free_eyebrow_credits - freeUsed),
          }).eq("customer_id", customer.id);
          await supabase.from("loyalty_transactions").insert({
            customer_id: customer.id, order_id: activeOrderId,
            free_credits_delta: -freeUsed, reason: "redeemed_free_eyebrow",
          });
        }
      }

      await supabase.from("audit_logs").insert({
        user_id: user!.id, action: "order.completed",
        entity_type: "order", entity_id: activeOrderId,
        metadata: { total: finalTotal, method: payload.method, tendered: payload.tendered ?? null },
      });

      await setActiveOrder(register.id, null);
      // clear live cart
      await publishLiveCart(register.id, { items: [], customer: null, updatedAt: Date.now() });
      return activeOrderId;
    },
    onSuccess: (oid) => {
      toast.success("Payment recorded");
      setReceiptOrderId(oid);
      setActiveOrderIdState(null);
      setLiveOrder(null);
      setCart([]); setCustomer(null);
      setDiscount(0); setPointsRedeem(0);
      setCashierPayOpen(false);
      qc.invalidateQueries({ queryKey: ["dashboard-today"] });
      qc.invalidateQueries({ queryKey: ["loyalty"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  // Auto-finalize when customer confirms paid on their tablet
  useEffect(() => {
    if (!liveOrder?.customer_paid_confirmed) return;
    if (finalize.isPending) return;
    const m = (liveOrder.customer_payment_method ?? "card") as "cash" | "card" | "zelle";
    finalize.mutate({ method: m, tipAmount: Number(liveOrder.customer_tip_amount ?? 0) });
  }, [liveOrder?.customer_paid_confirmed]);

  const maxRedeemable = loyalty
    ? Math.min(Math.floor(loyalty.points_balance / 100) * 100, Math.floor(subtotal / 5) * 100)
    : 0;

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0);

  /* ---------------- LAYOUT ---------------- */
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden bg-background">
      {/* TOP BAR */}
      <div className="flex flex-none items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="min-w-0 flex-1">
          <CustomerBar
            customer={customer}
            loyalty={loyalty ?? null}
            disabled={isFrozen}
            onClear={() => setCustomer(null)}
            onPick={() => setCustDialog(true)}
            onRedeemFreeEyebrow={() =>
              eyebrowService && addService(eyebrowService, { free: true })
            }
            cart={cart}
          />
        </div>
        {register && (
          <div className="hidden flex-none items-center gap-2 rounded-lg border border-gold/40 bg-gold/5 px-3 py-1.5 sm:flex">
            <Monitor className="h-4 w-4 text-gold" />
            <div className="text-xs">
              <div className="text-muted-foreground">{register.register_name} pair code</div>
              <div className="font-mono text-base font-bold tracking-widest">{register.code}</div>
            </div>
          </div>
        )}
        <Button
          variant="outline" size="sm"
          onClick={() => window.open("/customer-display", "soi-customer-display", "noopener")}
          className="flex-none gap-1.5 border-gold/60 hover:bg-gold/10"
        >
          <Monitor className="h-4 w-4 text-gold" /> Customer view
        </Button>
      </div>

      {/* MAIN: catalog + cart */}
      <div className="flex min-h-0 flex-1">
        {/* CATALOG */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-none space-y-2 border-b border-border bg-gradient-cream p-3">
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
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleServices.map((s) => (
                <button key={s.id} onClick={() => addService(s)} disabled={isFrozen}
                  className="group flex h-24 flex-col justify-between rounded-xl border-2 border-border bg-card p-3 text-left shadow-soft transition active:scale-95 hover:-translate-y-0.5 hover:border-gold hover:shadow-lift disabled:pointer-events-none disabled:opacity-40">
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
        </div>

        {/* CART — desktop sidebar */}
        <aside className="hidden w-[360px] flex-none flex-col border-l border-border bg-card lg:flex">
          <CartPanel
            cart={cart} customer={customer} loyalty={loyalty ?? null}
            subtotal={subtotal} totalDiscount={totalDiscount} tax={tax} baseTotal={baseTotal}
            updateQty={updateQty} removeItem={removeItem}
            onClear={() => setCart([])}
            onCharge={() => setChargeOpen(true)}
            disabled={isFrozen}
          />
        </aside>
      </div>

      {/* MOBILE cart pill */}
      {cart.length > 0 && (
        <div className="lg:hidden">
          <Sheet open={cartSheetOpen} onOpenChange={setCartSheetOpen}>
            <SheetTrigger asChild>
              <button className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-primary px-5 py-3 text-primary-foreground shadow-lift">
                <ShoppingCart className="h-5 w-5" />
                <span className="font-semibold">{cartCount} item{cartCount === 1 ? "" : "s"}</span>
                <span className="font-display text-lg">{fmt(baseTotal)}</span>
              </button>
            </SheetTrigger>
            <SheetContent side="right" className="flex w-full flex-col p-0 sm:max-w-md">
              <SheetHeader className="border-b border-border p-3"><SheetTitle>Current Sale</SheetTitle></SheetHeader>
              <CartPanel
                cart={cart} customer={customer} loyalty={loyalty ?? null}
                subtotal={subtotal} totalDiscount={totalDiscount} tax={tax} baseTotal={baseTotal}
                updateQty={updateQty} removeItem={removeItem}
                onClear={() => setCart([])}
                onCharge={() => { setCartSheetOpen(false); setChargeOpen(true); }}
                disabled={isFrozen}
              />
            </SheetContent>
          </Sheet>
        </div>
      )}

      {/* FROZEN OVERLAY */}
      {isFrozen && (
        <FrozenOverlay
          liveOrder={liveOrder}
          baseTotal={baseTotal}
          onCancel={() => cancelActive.mutate()}
          onTakePayment={() => setCashierPayOpen(true)}
          cancelling={cancelActive.isPending}
        />
      )}

      {/* Dialogs */}
      <CustomerSearchDialog
        open={custDialog} onOpenChange={setCustDialog}
        onPick={(c) => { setCustomer(c); setCustDialog(false); }}
        onNew={() => { setCustDialog(false); setNewCustOpen(true); }}
      />
      <NewCustomerDialog
        open={newCustOpen} onOpenChange={setNewCustOpen}
        userId={user!.id}
        onCreated={(c) => { setCustomer(c); setNewCustOpen(false); }}
      />
      <ChargeDialog
        open={chargeOpen} onOpenChange={setChargeOpen}
        baseTotal={baseTotal} discount={discount} setDiscount={setDiscount}
        loyalty={loyalty ?? null} maxRedeemable={maxRedeemable}
        pointsRedeem={pointsRedeem} setPointsRedeem={setPointsRedeem}
        onSendToCustomer={() => sendToCustomer.mutate()}
        sending={sendToCustomer.isPending}
        eyebrowService={eyebrowService}
        canRedeemFree={!!customer && (loyalty?.free_eyebrow_credits ?? 0) > 0 && !cart.some((i) => i.is_free)}
        onAddFreeEyebrow={() => eyebrowService && addService(eyebrowService, { free: true })}
      />
      <CashierPayDialog
        open={cashierPayOpen} onOpenChange={setCashierPayOpen}
        baseTotal={baseTotal}
        pending={finalize.isPending}
        onPay={(m, tendered) => finalize.mutate({ method: m, tendered, tipAmount: Number(liveOrder?.customer_tip_amount ?? 0) })}
      />
      <ReceiptDialog
        orderId={receiptOrderId}
        onClose={() => setReceiptOrderId(null)}
        settings={settings}
      />
    </div>
  );
}

/* ============== CART PANEL ============== */
function CartPanel({
  cart, customer, loyalty, subtotal, totalDiscount, tax, baseTotal,
  updateQty, removeItem, onClear, onCharge, disabled,
}: any) {
  const cartCount = cart.reduce((s: number, i: CartItem) => s + i.quantity, 0);
  return (
    <>
      <div className="flex-none border-b border-border bg-primary px-4 py-3 text-primary-foreground">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg">Current Sale</h2>
          {cart.length > 0 && !disabled && (
            <button onClick={onClear} className="text-xs text-primary-foreground/70 hover:underline">Clear</button>
          )}
        </div>
        <p className="mt-0.5 text-xs text-primary-foreground/70">
          {cartCount} item{cartCount === 1 ? "" : "s"}{customer ? ` · ${customer.full_name}` : " · Walk-in"}
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
            {cart.map((i: CartItem) => (
              <li key={i.uid} className={`rounded-lg border p-2.5 ${
                i.is_free ? "border-gold/60 bg-gold/5" : "border-border bg-card"
              }`}>
                <div className="flex justify-between gap-2">
                  <span className="text-sm font-medium leading-tight">{i.service_name}</span>
                  <span className="whitespace-nowrap text-sm font-semibold">{fmt(i.unit_price * i.quantity)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-7 w-7" disabled={disabled}
                      onClick={() => updateQty(i.uid, -1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-7 text-center text-sm font-medium">{i.quantity}</span>
                    <Button size="icon" variant="outline" className="h-7 w-7" disabled={disabled}
                      onClick={() => updateQty(i.uid, 1)}><Plus className="h-3 w-3" /></Button>
                  </div>
                  <button onClick={() => removeItem(i.uid)} disabled={disabled}
                    className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex-none border-t border-border bg-muted/30 px-4 py-3">
        <div className="space-y-1 text-sm">
          <Row label="Subtotal" value={fmt(subtotal)} />
          {totalDiscount > 0 && <Row label="Discount" value={`-${fmt(totalDiscount)}`} />}
          <Row label="Tax" value={fmt(tax)} />
          <Separator className="my-2" />
          <div className="flex items-baseline justify-between">
            <span className="font-display text-base">Total</span>
            <span className="font-display text-3xl font-semibold">{fmt(baseTotal)}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Customer adds tip on their tablet.</p>
        </div>
        <Button size="lg" disabled={cart.length === 0 || disabled}
          onClick={onCharge}
          className="mt-3 h-14 w-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90">
          Charge {fmt(baseTotal)}
        </Button>
      </div>
    </>
  );
}

/* ============== FROZEN OVERLAY ============== */
function FrozenOverlay({ liveOrder, baseTotal, onCancel, onTakePayment, cancelling }: any) {
  const tip = Number(liveOrder?.customer_tip_amount ?? 0);
  const method = liveOrder?.customer_payment_method as string | null;
  const grand = +(baseTotal + tip).toFixed(2);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <Card className="w-full max-w-md p-6 text-center shadow-lift">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gold/15">
          <Lock className="h-7 w-7 text-gold" />
        </div>
        <h2 className="font-display text-2xl">Customer is checking out</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          They're picking a tip and payment method on their tablet.
        </p>
        <div className="mt-5 space-y-2 rounded-lg border border-border bg-muted/40 p-3 text-left text-sm">
          <Row label="Order total" value={fmt(baseTotal)} />
          <Row label="Tip" value={tip > 0 ? fmt(tip) : "— waiting"} />
          <Row label="Method" value={method ? labelFor(method) : "— waiting"} />
          <Separator />
          <div className="flex items-baseline justify-between">
            <span className="font-display">Grand total</span>
            <span className="font-display text-2xl">{fmt(grand)}</span>
          </div>
        </div>
        <div className="mt-5 flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={cancelling} className="flex-1">
            {cancelling ? "Cancelling…" : "Cancel & edit"}
          </Button>
          <Button onClick={onTakePayment} className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90">
            Take payment manually
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          The order auto-completes when the customer confirms on their tablet.
        </p>
      </Card>
    </div>
  );
}

const labelFor = (m: string) => m === "cash" ? "Cash" : m === "card" ? "Card" : m === "zelle" ? "Zelle" : m;

/* ============== ROW ============== */
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className="text-foreground">{value}</span></div>;
}

/* ============== CUSTOMER BAR ============== */
function CustomerBar({
  customer, loyalty, onPick, onClear, onRedeemFreeEyebrow, cart, disabled,
}: {
  customer: Customer | null; loyalty: Loyalty | null;
  onPick: () => void; onClear: () => void;
  onRedeemFreeEyebrow: () => void;
  cart: CartItem[]; disabled?: boolean;
}) {
  if (!customer) {
    return (
      <button onClick={onPick} disabled={disabled}
        className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-border bg-card px-3 py-2 text-left transition hover:border-gold disabled:opacity-50">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold">Walk-in customer</p>
          <p className="truncate text-xs text-muted-foreground">Tap to attach for rewards</p>
        </div>
        <Search className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border-2 border-gold/60 bg-gradient-cream px-3 py-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-primary font-display font-bold">
        {customer.full_name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-sm font-semibold">{customer.full_name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant="secondary" className="h-5 gap-1 bg-gold/15 text-foreground border-gold/30">
            <Star className="h-3 w-3 text-gold" /> {loyalty?.points_balance ?? 0}
          </Badge>
          {(loyalty?.free_eyebrow_credits ?? 0) > 0 && (
            <button onClick={onRedeemFreeEyebrow} disabled={disabled || cart.some((i) => i.is_free)}
              className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-medium hover:bg-gold/30 disabled:opacity-50">
              <Gift className="h-3 w-3 text-gold" /> {loyalty!.free_eyebrow_credits} free
            </button>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onPick} disabled={disabled}>Switch</Button>
      <button onClick={onClear} disabled={disabled} className="rounded-full p-1 hover:bg-muted disabled:opacity-50">
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}

/* ============== CHARGE DIALOG ============== */
function ChargeDialog({
  open, onOpenChange, baseTotal, discount, setDiscount,
  loyalty, maxRedeemable, pointsRedeem, setPointsRedeem,
  onSendToCustomer, sending, canRedeemFree, onAddFreeEyebrow,
}: any) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Send to customer · {fmt(baseTotal)}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {(canRedeemFree || maxRedeemable > 0) && (
            <div className="space-y-1.5 rounded-lg border border-gold/40 bg-gold/5 p-2">
              {canRedeemFree && (
                <button onClick={onAddFreeEyebrow}
                  className="flex w-full items-center justify-between rounded-md bg-card px-2.5 py-2 text-xs font-medium hover:bg-card/70">
                  <span className="flex items-center gap-1.5"><Gift className="h-3.5 w-3.5 text-gold" /> Apply free eyebrow</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
              {maxRedeemable > 0 && pointsRedeem === 0 && (
                <button onClick={() => setPointsRedeem(maxRedeemable)}
                  className="flex w-full items-center justify-between rounded-md bg-card px-2.5 py-2 text-xs font-medium hover:bg-card/70">
                  <span className="flex items-center gap-1.5"><Star className="h-3.5 w-3.5 text-gold" /> Redeem {maxRedeemable} pts → -{fmt(maxRedeemable / 100 * 5)}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              )}
              {pointsRedeem > 0 && (
                <button onClick={() => setPointsRedeem(0)}
                  className="flex w-full items-center justify-between rounded-md bg-gold/20 px-2.5 py-2 text-xs font-semibold">
                  <span>{pointsRedeem} pts redeemed</span><X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Label className="w-28 text-xs text-muted-foreground">Discount $</Label>
            <Input type="number" min="0" value={discount || ""}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              className="h-9 flex-1 text-sm" placeholder="0.00" />
          </div>
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <div className="flex items-baseline justify-between">
              <span className="font-display">Total before tip</span>
              <span className="font-display text-2xl">{fmt(baseTotal)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Customer will add tip and pick payment method on their tablet.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Back</Button>
          <Button onClick={onSendToCustomer} disabled={sending}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            {sending ? "Sending…" : "Send to customer tablet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============== CASHIER PAY DIALOG (manual fallback) ============== */
function CashierPayDialog({
  open, onOpenChange, baseTotal, pending, onPay,
}: {
  open: boolean; onOpenChange: (b: boolean) => void;
  baseTotal: number; pending: boolean;
  onPay: (m: "cash" | "card" | "zelle", tendered?: number) => void;
}) {
  const [method, setMethod] = useState<null | "cash" | "card" | "zelle">(null);
  const [tendered, setTendered] = useState<number>(0);
  useEffect(() => { if (open) { setMethod(null); setTendered(0); } }, [open]);
  const change = Math.max(0, tendered - baseTotal);
  const quick = [
    Math.ceil(baseTotal),
    Math.ceil(baseTotal / 5) * 5,
    Math.ceil(baseTotal / 10) * 10,
    Math.ceil(baseTotal / 20) * 20,
  ].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="font-display text-2xl">Manual payment · {fmt(baseTotal)}</DialogTitle></DialogHeader>
        {!method ? (
          <div className="grid grid-cols-3 gap-2">
            <PayBtn icon={Banknote} label="Cash" onClick={() => setMethod("cash")} />
            <PayBtn icon={CreditCard} label="Card" onClick={() => onPay("card")} disabled={pending} />
            <PayBtn icon={Wallet} label="Zelle" onClick={() => onPay("zelle")} disabled={pending} />
          </div>
        ) : method === "cash" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              {quick.map((amt) => (
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
            {tendered > 0 && tendered >= baseTotal && (
              <div className="rounded-lg bg-gold/10 p-3 text-center">
                <p className="text-xs text-muted-foreground">Change due</p>
                <p className="font-display text-3xl font-semibold text-gold">{fmt(change)}</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setMethod(null)}>Back</Button>
              <Button disabled={pending || tendered < baseTotal}
                onClick={() => onPay("cash", tendered)}
                className="bg-primary text-primary-foreground hover:bg-primary/90">Confirm cash</Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PayBtn({ icon: Icon, label, onClick, disabled }: any) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex flex-col items-start gap-2 rounded-2xl border-2 border-border bg-card p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-gold disabled:opacity-50">
      <Icon className="h-6 w-6 text-gold" />
      <div className="font-display text-xl font-semibold">{label}</div>
    </button>
  );
}

/* ============== CUSTOMER SEARCH DIALOG ============== */
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
        {!q && results.length > 0 && <p className="text-xs uppercase tracking-wider text-muted-foreground">Recent</p>}
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
          {q && results.length === 0 && <p className="p-6 text-center text-xs text-muted-foreground">No matches</p>}
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
          <Button disabled={!full_name || mut.isPending} onClick={() => mut.mutate()}
            className="bg-primary text-primary-foreground hover:bg-primary/90">Save & attach</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
