import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Plus, Minus, Trash2, Search, UserPlus, X, Star, Gift,
  Sparkles, Flame, Flower, Scissors, Palette, User, CreditCard,
  Banknote, Wallet, IdCard, ShoppingBag, Keyboard,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ReceiptDialog } from "./ReceiptDialog";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { openCashDrawer } from "@/lib/cashDrawer";

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function isTypingTarget(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable;
}

type Service = {
  id: string; name: string; price: number; starts_at: boolean;
  taxable: boolean; category_id: string;
  is_variable_price?: boolean; price_label?: string | null;
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
  uid: string; service_id: string | null; service_name: string;
  unit_price: number; quantity: number; taxable: boolean; is_free?: boolean;
  item_type?: "service" | "gift_card" | "membership";
  meta?: any;
};
type PayMethod = "cash" | "card" | "zelle";

const makeFmt = (currency: string) => (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(n);
let fmt = makeFmt("USD");

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

  // Inline cart adjustments (no second screen)
  const [discount, setDiscount] = useState(0);
  const [pointsRedeem, setPointsRedeem] = useState(0);
  const [tipPct, setTipPct] = useState<number | null>(null);
  const [tipCustom, setTipCustom] = useState(0);

  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);
  const [custDialog, setCustDialog] = useState(false);
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [varPriceSvc, setVarPriceSvc] = useState<Service | null>(null);
  const [giftOpen, setGiftOpen] = useState(false);
  const [memOpen, setMemOpen] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [payingMethod, setPayingMethod] = useState<PayMethod | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [liveMsg, setLiveMsg] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

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
        .select("id,name,price,starts_at,taxable,category_id,is_variable_price,price_label")
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

  useEffect(() => {
    if (settings?.currency) fmt = makeFmt(settings.currency);
  }, [settings?.currency]);

  const tipPresets: number[] = useMemo(() => {
    const raw = (settings?.tip_presets ?? [15, 18, 20]) as any[];
    const arr = Array.isArray(raw) ? raw.map((n) => Number(n)).filter((n) => !isNaN(n) && n > 0) : [];
    return arr.length ? arr.slice(0, 4) : [15, 18, 20];
  }, [settings?.tip_presets]);

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

  const addService = (svc: Service, opts?: { free?: boolean; priceOverride?: number }) => {
    if (opts?.free) {
      setCart((p) => [...p, {
        uid: crypto.randomUUID(), service_id: svc.id,
        service_name: `${svc.name} (Free reward)`,
        unit_price: 0, quantity: 1, taxable: false, is_free: true,
        item_type: "service",
      }]);
      return;
    }
    if (svc.is_variable_price && opts?.priceOverride === undefined) {
      setVarPriceSvc(svc);
      return;
    }
    const price = opts?.priceOverride ?? Number(svc.price);
    setCart((prev) => {
      // Variable-price items always added as a fresh line so each can be priced individually
      if (svc.is_variable_price) {
        return [...prev, {
          uid: crypto.randomUUID(), service_id: svc.id, service_name: svc.name,
          unit_price: price, quantity: 1, taxable: svc.taxable, item_type: "service",
        }];
      }
      const ex = prev.find((i) => i.service_id === svc.id && !i.is_free && i.item_type !== "gift_card" && i.item_type !== "membership");
      if (ex) return prev.map((i) => i.uid === ex.uid ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, {
        uid: crypto.randomUUID(), service_id: svc.id, service_name: svc.name,
        unit_price: price, quantity: 1, taxable: svc.taxable, item_type: "service",
      }];
    });
  };

  const addGiftCard = (vals: { amount: number; buyerName?: string; recipientName?: string }) => {
    setCart((p) => [...p, {
      uid: crypto.randomUUID(), service_id: null,
      service_name: `Gift Card${vals.recipientName ? ` — ${vals.recipientName}` : ""}`,
      unit_price: vals.amount, quantity: 1, taxable: false,
      item_type: "gift_card", meta: vals,
    }]);
  };

  const addMembership = (vals: { type: string; price: number; expirationDate?: string }) => {
    setCart((p) => [...p, {
      uid: crypto.randomUUID(), service_id: null,
      service_name: `Membership — ${vals.type}`,
      unit_price: vals.price, quantity: 1, taxable: false,
      item_type: "membership", meta: vals,
    }]);
  };

  const updateQty = (uid: string, delta: number) =>
    setCart((p) => p.map((i) => i.uid === uid
      ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i).filter((i) => i.quantity > 0));
  const removeItem = (uid: string) => setCart((p) => p.filter((i) => i.uid !== uid));

  const subtotal = useMemo(() => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const taxableSubtotal = useMemo(() => cart.filter((i) => i.taxable).reduce((s, i) => s + i.unit_price * i.quantity, 0), [cart]);
  const taxRate = Number(settings?.tax_rate ?? 0);
  const pointsValue = pointsRedeem / 100 * 5;
  const totalDiscount = Math.min(subtotal, discount + pointsValue);
  const taxableAfterDisc = Math.max(0, taxableSubtotal - totalDiscount);
  const tax = +(taxableAfterDisc * taxRate).toFixed(2);
  const baseForTip = Math.max(0, subtotal - totalDiscount);
  const tip = useMemo(() => {
    if (tipCustom > 0) return +tipCustom.toFixed(2);
    if (tipPct) return +(baseForTip * (tipPct / 100)).toFixed(2);
    return 0;
  }, [tipPct, tipCustom, baseForTip]);
  const grandTotal = +(Math.max(0, subtotal - totalDiscount) + tax + tip).toFixed(2);

  useEffect(() => { setPointsRedeem(0); }, [customer?.id]);

  // Ref to access chargeWith + pending state inside keydown listener
  // (chargeWith is declared further down)
  const chargeRef = useRef<{ charge: (m: PayMethod) => void; pending: boolean }>({
    charge: () => {},
    pending: false,
  });

  // Announce cart changes for screen readers
  const prevCountRef = useRef(0);
  useEffect(() => {
    const count = cart.reduce((s, i) => s + i.quantity, 0);
    if (count !== prevCountRef.current) {
      setLiveMsg(`${count} item${count === 1 ? "" : "s"} in cart, total ${fmt(grandTotal)}`);
      prevCountRef.current = count;
    }
  }, [cart, grandTotal]);

  // Global POS keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Help: Shift + ?
      if (e.key === "?" && (e.shiftKey || true)) {
        if (!isTypingTarget(e.target)) {
          e.preventDefault();
          setShortcutsOpen((v) => !v);
          return;
        }
      }
      // Focus search: '/' or Ctrl/Cmd+K
      if ((e.key === "/" && !isTypingTarget(e.target)) ||
          ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (isTypingTarget(e.target)) return;

      // Pay dialog active: 1/2/3 → method
      if (payOpen && !chargeRef.current.pending) {
        if (e.key === "1") { e.preventDefault(); chargeRef.current.charge("cash"); return; }
        if (e.key === "2") { e.preventDefault(); chargeRef.current.charge("card"); return; }
        if (e.key === "3") { e.preventDefault(); chargeRef.current.charge("zelle"); return; }
      }

      // Dialog open? let Radix handle Esc/etc.
      if (custDialog || newCustOpen || varPriceSvc || giftOpen || memOpen || payOpen || shortcutsOpen) return;

      // Open Pay
      if (e.key === "Enter" && cart.length > 0) {
        e.preventDefault();
        setPayOpen(true);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "g") { e.preventDefault(); setGiftOpen(true); return; }
      if (k === "m") { e.preventDefault(); setMemOpen(true); return; }
      if (k === "c") { e.preventDefault(); setCustDialog(true); return; }

      // Category 1..9
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const c = cats[idx];
        if (c) { e.preventDefault(); setActiveCat(c.id); setSearch(""); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cart.length, cats, payOpen, custDialog, newCustOpen, varPriceSvc, giftOpen, memOpen, shortcutsOpen]);


  const resetCheckoutState = () => {
    setDiscount(0); setPointsRedeem(0);
    setTipPct(null); setTipCustom(0);
  };

  const maxRedeemable = loyalty
    ? Math.min(Math.floor(loyalty.points_balance / 100) * 100, Math.floor(subtotal / 5) * 100)
    : 0;

  const completeSale = useMutation({
    mutationFn: async (method: PayMethod) => {
      if (!method) throw new Error("Pick a payment method");
      if (cart.length === 0) throw new Error("Cart is empty");

      const { data: order, error } = await supabase.from("orders").insert({
        customer_id: customer?.id ?? null,
        status: "completed" as any,
        subtotal, discount_total: totalDiscount, tax_total: tax,
        tip_total: tip, total: grandTotal,
        cashier_id: user!.id,
        completed_at: new Date().toISOString(),
        notes: pointsRedeem > 0 ? `Redeemed ${pointsRedeem} pts ($${pointsValue.toFixed(2)})` : null,
      } as any).select().single();
      if (error) throw error;

      const items = cart.map((i) => ({
        order_id: order.id,
        service_id: i.service_id,
        service_name: i.service_name,
        unit_price: i.unit_price, quantity: i.quantity, taxable: i.taxable,
        item_type: i.item_type ?? "service",
      }));
      const { error: iErr } = await supabase.from("order_items").insert(items);
      if (iErr) throw iErr;

      const giftCardRows = cart.filter((i) => i.item_type === "gift_card").map((i) => ({
        code: `GC-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        amount: i.unit_price,
        balance: i.unit_price,
        buyer_name: i.meta?.buyerName ?? null,
        recipient_name: i.meta?.recipientName ?? null,
        status: "active",
        order_id: order.id,
        created_by: user!.id,
      }));
      if (giftCardRows.length) {
        const { error: gErr } = await supabase.from("gift_cards").insert(giftCardRows as any);
        if (gErr) throw gErr;
      }
      const membershipRows = cart.filter((i) => i.item_type === "membership").map((i) => ({
        customer_id: customer?.id ?? null,
        customer_name: customer?.full_name ?? i.meta?.customerName ?? "Walk-in",
        membership_type: i.meta?.type ?? "Membership",
        price: i.unit_price,
        expiration_date: i.meta?.expirationDate || null,
        status: "active",
        order_id: order.id,
        created_by: user!.id,
      }));
      if (membershipRows.length) {
        const { error: mErr } = await supabase.from("memberships").insert(membershipRows as any);
        if (mErr) throw mErr;
      }

      let drawerStatus: "not_applicable" | "opened" | "failed" | "disabled" = "not_applicable";
      if (method === "cash") {
        drawerStatus = await openCashDrawer(settings as any);
      }

      const { error: pErr } = await supabase.from("payments").insert({
        order_id: order.id,
        method: method === "zelle" ? "other" : method,
        payment_method: method,
        amount: grandTotal,
        status: "succeeded",
        cash_drawer_status: drawerStatus,
        created_by: user!.id,
        external_reference: method === "zelle" ? "zelle" : null,
        ...(method === "card"
          ? { card_brand: "MOCK", card_last4: "0000", payment_intent_id: `pi_mock_${order.id.slice(0, 8)}` }
          : {}),
      } as any);
      if (pErr) throw pErr;

      if (method === "cash" && drawerStatus === "failed") {
        toast.warning("Transaction saved — cash drawer did not open. Please open manually.");
      }

      if (customer) {
        await supabase.from("customers").update({
          total_spend: Number(customer.total_spend ?? 0) + grandTotal,
          visit_count: (customer.visit_count ?? 0) + 1,
          last_visit_at: new Date().toISOString(),
        }).eq("id", customer.id);

        if (pointsRedeem > 0 && loyalty) {
          await supabase.from("loyalty_accounts").update({
            points_balance: Math.max(0, loyalty.points_balance - pointsRedeem),
          }).eq("customer_id", customer.id);
          await supabase.from("loyalty_transactions").insert({
            customer_id: customer.id, order_id: order.id,
            points_delta: -pointsRedeem, reason: "redeemed_for_discount",
          });
        }
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
        metadata: { total: grandTotal, method, tip },
      });

      return order.id;
    },
    onSuccess: (oid) => {
      toast.success("Sale complete");
      setReceiptOrderId(oid);
      setCart([]); setCustomer(null);
      setPayOpen(false);
      setPayingMethod(null);
      setMobileCartOpen(false);
      resetCheckoutState();
      qc.invalidateQueries({ queryKey: ["dashboard-today"] });
      qc.invalidateQueries({ queryKey: ["loyalty"] });
    },
    onError: (e: any) => {
      setPayingMethod(null);
      toast.error(e.message ?? "Failed");
    },
  });

  const chargeWith = (m: PayMethod) => {
    if (completeSale.isPending) return;
    setPayingMethod(m);
    completeSale.mutate(m);
  };

  // Keep ref in sync for keyboard handler
  chargeRef.current = { charge: chargeWith, pending: completeSale.isPending };

  /* ---------------- LAYOUT ---------------- */
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden bg-background">
      {/* Screen-reader live region for cart updates */}
      <div role="status" aria-live="polite" className="sr-only">{liveMsg}</div>
      {/* TOP BAR */}
      <div className="flex flex-none items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="min-w-0 flex-1">
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
        <button
          type="button"
          onClick={() => setShortcutsOpen(true)}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (Shift + ?)"
          className={`flex h-10 w-10 flex-none items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition hover:border-gold hover:text-foreground ${FOCUS_RING}`}
        >
          <Keyboard className="h-4 w-4" />
        </button>
      </div>

      {/* MAIN: catalog + cart/checkout */}
      <div className="flex min-h-0 flex-1">
        {/* CATALOG */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex-none space-y-2 border-b border-border bg-gradient-cream p-3">
            <div className="relative">
              <label htmlFor="pos-search" className="sr-only">Search services</label>
              <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <Input
                id="pos-search"
                ref={searchRef}
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search any service…  (press / )"
                className="h-12 pl-11 text-base"
              />
            </div>
            {!search && (
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Service categories">
                {cats.map((c, idx) => {
                  const Icon = ICONS[c.icon ?? ""] ?? Sparkles;
                  const isActive = currentCatId === c.id;
                  return (
                    <button key={c.id} type="button" role="tab" aria-selected={isActive}
                      onClick={() => setActiveCat(c.id)}
                      title={idx < 9 ? `Shortcut: ${idx + 1}` : undefined}
                      className={`flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition ${FOCUS_RING} ${
                        isActive
                          ? "border-gold bg-card text-foreground shadow-soft"
                          : "border-border bg-card/50 text-muted-foreground hover:border-gold/60 hover:text-foreground"
                      }`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />{c.name}
                    </button>
                  );
                })}
                <span className="mx-1 h-7 w-px self-center bg-border" aria-hidden="true" />
                <button type="button" onClick={() => setGiftOpen(true)}
                  title="Shortcut: G"
                  className={`flex items-center gap-1.5 rounded-full border border-gold/60 bg-gold/10 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-gold/20 ${FOCUS_RING}`}>
                  <Gift className="h-4 w-4 text-gold" aria-hidden="true" /> Gift card
                </button>
                <button type="button" onClick={() => setMemOpen(true)}
                  title="Shortcut: M"
                  className={`flex items-center gap-1.5 rounded-full border border-gold/60 bg-gold/10 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-gold/20 ${FOCUS_RING}`}>
                  <IdCard className="h-4 w-4 text-gold" aria-hidden="true" /> Membership
                </button>
              </div>
            )}
          </div>
          <div className="flex-1 overflow-auto p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
              {visibleServices.map((s) => (
                <button key={s.id} type="button" onClick={() => addService(s)}
                  aria-label={`Add ${s.name}, ${s.price_label ?? (s.starts_at ? `${fmt(s.price)} and up` : fmt(s.price))}`}
                  className={`group flex h-28 flex-col justify-between rounded-xl border-2 border-border bg-card p-3.5 text-left shadow-soft transition active:scale-95 hover:-translate-y-0.5 hover:border-gold hover:shadow-lift ${FOCUS_RING}`}>
                  <span className="text-base font-semibold leading-tight text-foreground line-clamp-2">{s.name}</span>
                  <span className="text-lg font-bold text-gold">
                    {s.price_label ?? (s.starts_at ? `${fmt(s.price)} & up` : fmt(s.price))}
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

        {/* RIGHT PANEL — single-step cart (desktop/tablet large) */}
        <aside className="hidden w-[420px] flex-none flex-col border-l border-border bg-card md:flex">
          <CartPanel
            cart={cart} customer={customer}
            subtotal={subtotal} totalDiscount={totalDiscount} tax={tax} tip={tip}
            baseForTip={baseForTip} grandTotal={grandTotal}
            discount={discount} setDiscount={setDiscount}
            tipPct={tipPct} setTipPct={setTipPct}
            tipPresets={tipPresets}
            tipCustom={tipCustom} setTipCustom={setTipCustom}
            loyalty={loyalty ?? null} maxRedeemable={maxRedeemable}
            pointsRedeem={pointsRedeem} setPointsRedeem={setPointsRedeem}
            canRedeemFree={!!customer && (loyalty?.free_eyebrow_credits ?? 0) > 0 && !cart.some((i) => i.is_free)}
            onAddFreeEyebrow={() => eyebrowService && addService(eyebrowService, { free: true })}
            updateQty={updateQty} removeItem={removeItem}
            onClear={() => { setCart([]); resetCheckoutState(); }}
            onCharge={() => setPayOpen(true)}
          />
        </aside>
      </div>

      {/* MOBILE / TABLET cart bar */}
      <div className="flex-none border-t border-border bg-card px-3 py-2 md:hidden">
        <Button
          onClick={() => setMobileCartOpen(true)}
          disabled={cart.length === 0}
          className="h-14 w-full justify-between bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <span className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            {cart.reduce((s, i) => s + i.quantity, 0)} item
            {cart.reduce((s, i) => s + i.quantity, 0) === 1 ? "" : "s"}
          </span>
          <span>{fmt(grandTotal)}</span>
        </Button>
      </div>

      <Sheet open={mobileCartOpen} onOpenChange={setMobileCartOpen}>
        <SheetContent side="right" className="flex w-full max-w-md flex-col p-0 sm:max-w-md">
          <SheetHeader className="sr-only"><SheetTitle>Cart</SheetTitle></SheetHeader>
          <div className="flex h-full flex-col">
            <CartPanel
              cart={cart} customer={customer}
              subtotal={subtotal} totalDiscount={totalDiscount} tax={tax} tip={tip}
              baseForTip={baseForTip} grandTotal={grandTotal}
              discount={discount} setDiscount={setDiscount}
              tipPct={tipPct} setTipPct={setTipPct}
              tipPresets={tipPresets}
              tipCustom={tipCustom} setTipCustom={setTipCustom}
              loyalty={loyalty ?? null} maxRedeemable={maxRedeemable}
              pointsRedeem={pointsRedeem} setPointsRedeem={setPointsRedeem}
              canRedeemFree={!!customer && (loyalty?.free_eyebrow_credits ?? 0) > 0 && !cart.some((i) => i.is_free)}
              onAddFreeEyebrow={() => eyebrowService && addService(eyebrowService, { free: true })}
              updateQty={updateQty} removeItem={removeItem}
              onClear={() => { setCart([]); resetCheckoutState(); }}
              onCharge={() => setPayOpen(true)}
            />
          </div>
        </SheetContent>
      </Sheet>

      <PaymentMethodDialog
        open={payOpen}
        onOpenChange={(o) => { if (!completeSale.isPending) setPayOpen(o); }}
        grandTotal={grandTotal}
        onChoose={chargeWith}
        pending={completeSale.isPending}
        payingMethod={payingMethod}
      />


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
      <VariablePriceDialog
        svc={varPriceSvc}
        onClose={() => setVarPriceSvc(null)}
        onConfirm={(price) => {
          if (varPriceSvc) addService(varPriceSvc, { priceOverride: price });
          setVarPriceSvc(null);
        }}
      />
      <GiftCardDialog
        open={giftOpen}
        onOpenChange={setGiftOpen}
        onAdd={(v) => { addGiftCard(v); setGiftOpen(false); }}
      />
      <MembershipDialog
        open={memOpen}
        onOpenChange={setMemOpen}
        onAdd={(v) => { addMembership(v); setMemOpen(false); }}
      />
      <ReceiptDialog
        orderId={receiptOrderId}
        onClose={() => setReceiptOrderId(null)}
        settings={settings}
      />
    </div>
  );
}

/* ============== VARIABLE PRICE ============== */
function VariablePriceDialog({
  svc, onClose, onConfirm,
}: { svc: Service | null; onClose: () => void; onConfirm: (price: number) => void }) {
  const [price, setPrice] = useState<number>(0);
  useEffect(() => { if (svc) setPrice(Number(svc.price)); }, [svc]);
  if (!svc) return null;
  return (
    <Dialog open={!!svc} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-xl">{svc.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Menu price: <span className="font-medium text-foreground">{svc.price_label ?? `$${Number(svc.price).toFixed(2)} & up`}</span>.
            Enter the final price for this service.
          </p>
          <div className="space-y-1.5">
            <Label>Price ($)</Label>
            <Input
              autoFocus type="number" min="0" step="0.01"
              value={price || ""}
              onChange={(e) => setPrice(Number(e.target.value) || 0)}
              className="h-12 text-lg font-semibold"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => onConfirm(price)}
            disabled={price <= 0}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Add to cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============== GIFT CARD ============== */
function GiftCardDialog({
  open, onOpenChange, onAdd,
}: { open: boolean; onOpenChange: (b: boolean) => void; onAdd: (v: { amount: number; buyerName?: string; recipientName?: string }) => void }) {
  const [amount, setAmount] = useState(0);
  const [buyerName, setBuyer] = useState("");
  const [recipientName, setRecipient] = useState("");
  useEffect(() => { if (open) { setAmount(0); setBuyer(""); setRecipient(""); } }, [open]);
  const presets = [25, 50, 75, 100, 150, 200];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display text-xl">Sell gift card</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {presets.map((p) => (
              <button key={p} onClick={() => setAmount(p)}
                className={`rounded-lg border-2 p-3 text-center font-semibold ${
                  amount === p ? "border-gold bg-gold/15" : "border-border bg-card hover:border-gold/60"
                }`}>${p}</button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Amount ($)</Label>
            <Input type="number" min="0" step="0.01" value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value) || 0)} className="h-11 text-lg" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Buyer (optional)</Label>
              <Input value={buyerName} onChange={(e) => setBuyer(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Recipient (optional)</Label>
              <Input value={recipientName} onChange={(e) => setRecipient(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={amount <= 0}
            onClick={() => onAdd({ amount, buyerName: buyerName || undefined, recipientName: recipientName || undefined })}
            className="bg-primary text-primary-foreground hover:bg-primary/90">Add to cart</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============== MEMBERSHIP ============== */
function MembershipDialog({
  open, onOpenChange, onAdd,
}: { open: boolean; onOpenChange: (b: boolean) => void; onAdd: (v: { type: string; price: number; expirationDate?: string }) => void }) {
  const [type, setType] = useState("");
  const [price, setPrice] = useState(0);
  const [exp, setExp] = useState("");
  useEffect(() => { if (open) { setType(""); setPrice(0); setExp(""); } }, [open]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display text-xl">Sell membership</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Membership type *</Label>
            <Input autoFocus value={type} onChange={(e) => setType(e.target.value)}
              placeholder="e.g. Monthly Unlimited Threading" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Price ($) *</Label>
              <Input type="number" min="0" step="0.01" value={price || ""}
                onChange={(e) => setPrice(Number(e.target.value) || 0)} className="h-11" /></div>
            <div className="space-y-1.5"><Label>Expires</Label>
              <Input type="date" value={exp} onChange={(e) => setExp(e.target.value)} className="h-11" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!type || price <= 0}
            onClick={() => onAdd({ type, price, expirationDate: exp || undefined })}
            className="bg-primary text-primary-foreground hover:bg-primary/90">Add to cart</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


/* ============== CART PANEL (one-step checkout) ============== */
function CartPanel({
  cart, customer, subtotal, totalDiscount, tax, tip, baseForTip, grandTotal,
  discount, setDiscount,
  tipPct, setTipPct, tipPresets, tipCustom, setTipCustom,
  loyalty: _loyalty, maxRedeemable, pointsRedeem, setPointsRedeem,
  canRedeemFree, onAddFreeEyebrow,
  updateQty, removeItem, onClear, onCharge,
}: any) {
  const cartCount = cart.reduce((s: number, i: CartItem) => s + i.quantity, 0);
  return (
    <>
      <div className="flex-none border-b border-border bg-primary px-4 py-3 text-primary-foreground">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">Current Sale</h2>
          {cart.length > 0 && (
            <button onClick={onClear} className="text-xs text-primary-foreground/70 hover:underline">Clear</button>
          )}
        </div>
        <p className="mt-0.5 text-sm text-primary-foreground/80">
          {cartCount} item{cartCount === 1 ? "" : "s"}{customer ? ` · ${customer.full_name}` : " · Walk-in"}
        </p>
      </div>

      <div className="flex-1 overflow-auto px-3 py-2">
        {cart.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-base text-muted-foreground">
            <Sparkles className="h-10 w-10 text-gold/60" />
            <p>Tap any service to start a sale</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {cart.map((i: CartItem) => (
              <li key={i.uid} className={`rounded-lg border p-3 ${
                i.is_free ? "border-gold/60 bg-gold/5" : "border-border bg-card"
              }`}>
                <div className="flex justify-between gap-2">
                  <span className="text-base font-medium leading-tight">{i.service_name}</span>
                  <span className="whitespace-nowrap text-base font-semibold">{fmt(i.unit_price * i.quantity)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Button size="icon" variant="outline" className="h-9 w-9"
                      onClick={() => updateQty(i.uid, -1)}><Minus className="h-4 w-4" /></Button>
                    <span className="w-8 text-center text-lg font-semibold">{i.quantity}</span>
                    <Button size="icon" variant="outline" className="h-9 w-9"
                      onClick={() => updateQty(i.uid, 1)}><Plus className="h-4 w-4" /></Button>
                  </div>
                  <button onClick={() => removeItem(i.uid)}
                    className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-5 w-5" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {cart.length > 0 && (
          <div className="mt-3 space-y-3">
            {/* Loyalty quick actions */}
            {(canRedeemFree || maxRedeemable > 0) && (
              <div className="space-y-1.5 rounded-lg border-2 border-gold/50 bg-gold/5 p-2">
                {canRedeemFree && (
                  <button onClick={onAddFreeEyebrow}
                    className="flex w-full items-center justify-between rounded-md bg-card px-3 py-2.5 text-sm font-medium hover:bg-card/70">
                    <span className="flex items-center gap-2"><Gift className="h-4 w-4 text-gold" /> Apply free eyebrow</span>
                    <Plus className="h-4 w-4" />
                  </button>
                )}
                {maxRedeemable > 0 && pointsRedeem === 0 && (
                  <button onClick={() => setPointsRedeem(maxRedeemable)}
                    className="flex w-full items-center justify-between rounded-md bg-card px-3 py-2.5 text-sm font-medium hover:bg-card/70">
                    <span className="flex items-center gap-2"><Star className="h-4 w-4 text-gold" /> Redeem {maxRedeemable} pts → -{fmt(maxRedeemable / 100 * 5)}</span>
                    <Plus className="h-4 w-4" />
                  </button>
                )}
                {pointsRedeem > 0 && (
                  <button onClick={() => setPointsRedeem(0)}
                    className="flex w-full items-center justify-between rounded-md bg-gold/20 px-3 py-2.5 text-sm font-semibold">
                    <span>{pointsRedeem} pts redeemed</span><X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}

            {/* Discount */}
            <div>
              <Label className="text-sm font-semibold">Discount ($)</Label>
              <Input type="number" min="0" step="0.01" value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                className="mt-1.5 h-11 text-base" placeholder="0.00" />
            </div>

            {/* Tip */}
            <div>
              <Label className="text-sm font-semibold">Tip</Label>
              <div className={`mt-1.5 grid gap-1.5 ${(tipPresets as number[]).length >= 4 ? "grid-cols-4" : (tipPresets as number[]).length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                {(tipPresets as number[]).map((p) => {
                  const active = tipPct === p && tipCustom === 0;
                  return (
                    <button key={p}
                      onClick={() => { setTipCustom(0); setTipPct(active ? null : p); }}
                      className={`rounded-lg border-2 p-2 text-center transition active:scale-95 ${
                        active ? "border-gold bg-gold/15" : "border-border bg-card hover:border-gold/60"
                      }`}>
                      <div className="font-display text-base">{p}%</div>
                      <div className="text-[10px] text-muted-foreground">{fmt(+(baseForTip * p / 100).toFixed(2))}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Input type="number" min="0" step="0.01" value={tipCustom || ""}
                  onChange={(e) => { const v = Number(e.target.value) || 0; setTipCustom(v); if (v > 0) setTipPct(null); }}
                  placeholder="Custom $" className="h-10 text-base" />
                <Button variant="outline" size="sm" onClick={() => { setTipCustom(0); setTipPct(null); }}>No tip</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex-none border-t border-border bg-muted/30 px-4 py-3">
        <div className="space-y-1.5 text-base">
          <Row label="Subtotal" value={fmt(subtotal)} />
          {totalDiscount > 0 && <Row label="Discount" value={`-${fmt(totalDiscount)}`} />}
          <Row label="Tax" value={fmt(tax)} />
          {tip > 0 && <Row label="Tip" value={fmt(tip)} />}
          <Separator className="my-2" />
          <div className="flex items-baseline justify-between">
            <span className="font-display text-lg">Total</span>
            <span className="font-display text-3xl font-semibold">{fmt(grandTotal)}</span>
          </div>
        </div>
        <Button size="lg" disabled={cart.length === 0}
          onClick={onCharge}
          className="mt-3 h-16 w-full bg-primary text-xl font-semibold text-primary-foreground hover:bg-primary/90">
          Charge {fmt(grandTotal)}
        </Button>
      </div>
    </>
  );
}

/* ============== PAYMENT METHOD DIALOG ============== */
function PaymentMethodDialog({
  open, onOpenChange, grandTotal, onChoose, pending, payingMethod,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  grandTotal: number;
  onChoose: (m: PayMethod) => void;
  pending: boolean;
  payingMethod: PayMethod | null;
}) {
  const choices: { m: PayMethod; label: string; icon: any }[] = [
    { m: "cash", label: "Cash", icon: Banknote },
    { m: "card", label: "Card", icon: CreditCard },
    { m: "zelle", label: "Zelle", icon: Wallet },
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Charge {fmt(grandTotal)}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Pick a payment method — the sale completes immediately.
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {choices.map(({ m, label, icon: Icon }) => {
            const isPaying = payingMethod === m;
            return (
              <button
                key={m}
                disabled={pending}
                onClick={() => onChoose(m)}
                className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 p-4 transition active:scale-95 disabled:opacity-50 ${
                  isPaying ? "border-gold bg-gold/15" : "border-border bg-card hover:border-gold/60"
                }`}
              >
                <Icon className={`h-7 w-7 ${isPaying ? "text-gold animate-pulse" : "text-muted-foreground"}`} />
                <span className="font-display text-base">{isPaying ? "Processing…" : label}</span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}



function PayBtn({ icon: Icon, label, active, onClick }: any) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 transition active:scale-95 ${
        active ? "border-gold bg-gold/15" : "border-border bg-card hover:border-gold/60"
      }`}>
      <Icon className={`h-6 w-6 ${active ? "text-gold" : "text-muted-foreground"}`} />
      <span className="font-display text-base">{label}</span>
    </button>
  );
}

/* ============== ROW ============== */
function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between text-muted-foreground"><span>{label}</span><span className="text-foreground font-medium">{value}</span></div>;
}

/* ============== CUSTOMER BAR ============== */
function CustomerBar({
  customer, loyalty, onPick, onClear, onRedeemFreeEyebrow, cart,
}: {
  customer: Customer | null; loyalty: Loyalty | null;
  onPick: () => void; onClear: () => void;
  onRedeemFreeEyebrow: () => void; cart: CartItem[];
}) {
  if (!customer) {
    return (
      <button onClick={onPick}
        className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-border bg-card px-3 py-2 text-left transition hover:border-gold">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <User className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-semibold">Walk-in customer</p>
          <p className="truncate text-xs text-muted-foreground">Tap to attach for rewards</p>
        </div>
        <Search className="h-4 w-4 text-muted-foreground" />
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-xl border-2 border-gold/60 bg-gradient-cream px-3 py-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gold text-primary font-display font-bold">
        {customer.full_name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-semibold">{customer.full_name}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
          <Badge variant="secondary" className="h-5 gap-1 bg-gold/15 text-foreground border-gold/30">
            <Star className="h-3 w-3 text-gold" /> {loyalty?.points_balance ?? 0}
          </Badge>
          {(loyalty?.free_eyebrow_credits ?? 0) > 0 && (
            <button onClick={onRedeemFreeEyebrow} disabled={cart.some((i) => i.is_free)}
              className="inline-flex items-center gap-1 rounded-full bg-gold/20 px-2 py-0.5 text-xs font-medium hover:bg-gold/30 disabled:opacity-50">
              <Gift className="h-3 w-3 text-gold" /> {loyalty!.free_eyebrow_credits} free
            </button>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" onClick={onPick}>Switch</Button>
      <button onClick={onClear} className="rounded-full p-1 hover:bg-muted">
        <X className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
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
        <DialogHeader><DialogTitle className="font-display text-xl">Attach customer</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input autoFocus placeholder="Name, phone or email" className="h-12 pl-10 text-base"
            value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-72 space-y-1 overflow-auto">
          {results.map((c) => (
            <button key={c.id} onClick={() => onPick(c)}
              className="flex w-full items-center justify-between rounded-md border border-transparent p-3 text-left hover:border-gold/40 hover:bg-accent/40">
              <div className="min-w-0">
                <p className="truncate font-medium text-base">{c.full_name}</p>
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
          <Button variant="outline" onClick={onNew} className="w-full h-12">
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
        <DialogHeader><DialogTitle className="font-display text-xl">New customer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name *</Label>
            <Input autoFocus value={full_name} onChange={(e) => setName(e.target.value)} className="h-11 text-base" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 text-base" /></div>
            <div className="space-y-1.5"><Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-base" /></div>
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
