import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Plus, Minus, Trash2, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ReceiptDialog } from "./ReceiptDialog";

type Service = {
  id: string;
  name: string;
  price: number;
  starts_at: boolean;
  taxable: boolean;
  category_id: string;
};

type Category = { id: string; name: string; slug: string; sort_order: number };

type Customer = { id: string; full_name: string; phone: string | null; email: string | null };

type CartItem = {
  uid: string;
  service_id: string;
  service_name: string;
  unit_price: number;
  quantity: number;
  taxable: boolean;
  notes?: string;
};

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function PosClient() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [custSearch, setCustSearch] = useState("");
  const [custOpen, setCustOpen] = useState(false);
  const [tipPct, setTipPct] = useState<number | null>(null);
  const [discount, setDiscount] = useState(0);
  const [paying, setPaying] = useState(false);
  const [receiptOrderId, setReceiptOrderId] = useState<string | null>(null);
  const [newCustOpen, setNewCustOpen] = useState(false);

  const { data: cats = [] } = useQuery<Category[]>({
    queryKey: ["service_categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_categories")
        .select("*")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data as Category[];
    },
  });

  const { data: services = [] } = useQuery<Service[]>({
    queryKey: ["services"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id,name,price,starts_at,taxable,category_id")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data as Service[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_settings").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: custResults = [] } = useQuery<Customer[]>({
    queryKey: ["cust-search", custSearch],
    enabled: custSearch.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,full_name,phone,email")
        .or(`full_name.ilike.%${custSearch}%,phone.ilike.%${custSearch}%,email.ilike.%${custSearch}%`)
        .limit(10);
      if (error) throw error;
      return data as Customer[];
    },
  });

  const currentCatId = activeCat ?? cats[0]?.id;
  const visibleServices = services.filter((s) => s.category_id === currentCatId);

  const addService = (svc: Service) => {
    setCart((prev) => {
      const ex = prev.find((i) => i.service_id === svc.id);
      if (ex) {
        return prev.map((i) =>
          i.uid === ex.uid ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          uid: crypto.randomUUID(),
          service_id: svc.id,
          service_name: svc.name,
          unit_price: Number(svc.price),
          quantity: 1,
          taxable: svc.taxable,
        },
      ];
    });
  };

  const updateQty = (uid: string, delta: number) =>
    setCart((p) =>
      p
        .map((i) => (i.uid === uid ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i))
        .filter((i) => i.quantity > 0)
    );

  const removeItem = (uid: string) => setCart((p) => p.filter((i) => i.uid !== uid));

  const subtotal = useMemo(
    () => cart.reduce((s, i) => s + i.unit_price * i.quantity, 0),
    [cart]
  );
  const taxableSubtotal = useMemo(
    () => cart.filter((i) => i.taxable).reduce((s, i) => s + i.unit_price * i.quantity, 0),
    [cart]
  );
  const taxRate = Number(settings?.tax_rate ?? 0);
  const discountClamped = Math.min(discount, subtotal);
  const taxableAfterDiscount = Math.max(0, taxableSubtotal - discountClamped);
  const tax = +(taxableAfterDiscount * taxRate).toFixed(2);
  const tip = tipPct ? +((subtotal - discountClamped) * (tipPct / 100)).toFixed(2) : 0;
  const total = +(subtotal - discountClamped + tax + tip).toFixed(2);

  const checkoutMut = useMutation({
    mutationFn: async (method: "cash" | "card" | "other") => {
      if (cart.length === 0) throw new Error("Cart is empty");
      // create order
      const { data: order, error: oErr } = await supabase
        .from("orders")
        .insert({
          customer_id: customer?.id ?? null,
          status: "completed",
          subtotal,
          discount_total: discountClamped,
          tax_total: tax,
          tip_total: tip,
          total,
          cashier_id: user!.id,
          completed_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (oErr) throw oErr;

      const items = cart.map((i) => ({
        order_id: order.id,
        service_id: i.service_id,
        service_name: i.service_name,
        unit_price: i.unit_price,
        quantity: i.quantity,
        taxable: i.taxable,
      }));
      const { error: iErr } = await supabase.from("order_items").insert(items);
      if (iErr) throw iErr;

      const { error: pErr } = await supabase.from("payments").insert({
        order_id: order.id,
        method,
        amount: total,
        status: "succeeded",
        created_by: user!.id,
        // tokenized mock metadata for "card"
        ...(method === "card"
          ? { card_brand: "MOCK", card_last4: "0000", payment_intent_id: `pi_mock_${order.id.slice(0,8)}` }
          : {}),
      });
      if (pErr) throw pErr;

      if (customer) {
        await supabase
          .from("customers")
          .update({
            total_spend: (customer as any).total_spend
              ? Number((customer as any).total_spend) + total
              : total,
            visit_count: ((customer as any).visit_count ?? 0) + 1,
            last_visit_at: new Date().toISOString(),
          })
          .eq("id", customer.id);
      }

      await supabase.from("audit_logs").insert({
        user_id: user!.id,
        action: "order.completed",
        entity_type: "order",
        entity_id: order.id,
        metadata: { total, method },
      });

      return order.id;
    },
    onSuccess: (orderId) => {
      toast.success("Payment successful");
      setReceiptOrderId(orderId);
      setCart([]);
      setCustomer(null);
      setTipPct(null);
      setDiscount(0);
      setPaying(false);
      qc.invalidateQueries({ queryKey: ["dashboard-today"] });
    },
    onError: (e: any) => {
      toast.error(e.message ?? "Checkout failed");
    },
  });

  const createCustMut = useMutation({
    mutationFn: async (input: { full_name: string; phone: string; email: string }) => {
      const { data, error } = await supabase
        .from("customers")
        .insert({ ...input, created_by: user!.id })
        .select()
        .single();
      if (error) throw error;
      return data as Customer;
    },
    onSuccess: (c) => {
      setCustomer(c);
      setNewCustOpen(false);
      setCustOpen(false);
      toast.success(`Customer ${c.full_name} added`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-1 gap-4 p-3 md:p-4 lg:grid-cols-[1fr_400px]">
      {/* LEFT: catalog */}
      <Card className="flex flex-col overflow-hidden border-border/60 shadow-soft">
        <CardHeader className="border-b border-border bg-gradient-cream px-4 py-3">
          <Tabs value={currentCatId} onValueChange={setActiveCat}>
            <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
              {cats.map((c) => (
                <TabsTrigger
                  key={c.id}
                  value={c.id}
                  className="rounded-full border border-transparent data-[state=active]:border-gold/60 data-[state=active]:bg-card data-[state=active]:shadow-soft"
                >
                  {c.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="flex-1 overflow-auto p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {visibleServices.map((s) => (
              <button
                key={s.id}
                onClick={() => addService(s)}
                className="group flex h-24 flex-col justify-between rounded-2xl border border-border bg-card p-3 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-gold hover:shadow-lift"
              >
                <span className="text-sm font-medium leading-tight text-foreground">{s.name}</span>
                <span className="text-base font-semibold text-gold">
                  {s.starts_at ? `${fmt(s.price)}+` : fmt(s.price)}
                </span>
              </button>
            ))}
            {visibleServices.length === 0 && (
              <p className="col-span-full py-12 text-center text-sm text-muted-foreground">
                No services in this category yet.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* RIGHT: cart */}
      <Card className="flex flex-col overflow-hidden border-border/60 shadow-lift">
        <CardHeader className="border-b border-border bg-primary px-4 py-3 text-primary-foreground">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">Current Sale</h2>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-xs text-primary-foreground/70 underline-offset-2 hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          {/* customer */}
          <div className="mt-2">
            {customer ? (
              <div className="flex items-center justify-between rounded-md bg-primary-foreground/10 px-2 py-1.5 text-xs">
                <span>👤 {customer.full_name}{customer.phone ? ` · ${customer.phone}` : ""}</span>
                <button onClick={() => setCustomer(null)}><X className="h-3 w-3" /></button>
              </div>
            ) : (
              <button
                onClick={() => setCustOpen(true)}
                className="flex w-full items-center gap-2 rounded-md bg-primary-foreground/10 px-2 py-1.5 text-left text-xs hover:bg-primary-foreground/20"
              >
                <Search className="h-3 w-3" /> Walk-in · tap to attach customer
              </button>
            )}
          </div>
        </CardHeader>

        <div className="flex-1 overflow-auto px-3 py-2">
          {cart.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              <p>Tap a service to begin</p>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {cart.map((i) => (
                <li key={i.uid} className="rounded-lg border border-border bg-card p-2.5">
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">{i.service_name}</span>
                    <span className="text-sm font-semibold">{fmt(i.unit_price * i.quantity)}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(i.uid, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-6 text-center text-xs">{i.quantity}</span>
                      <Button size="icon" variant="outline" className="h-6 w-6" onClick={() => updateQty(i.uid, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                    <button onClick={() => removeItem(i.uid)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border bg-muted/40 px-4 py-3">
          <div className="mb-2 flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Discount $</Label>
            <Input
              type="number"
              min="0"
              value={discount || ""}
              onChange={(e) => setDiscount(Number(e.target.value) || 0)}
              className="h-7 w-20 text-xs"
            />
            <div className="ml-auto flex gap-1">
              {(settings?.tip_presets ?? [15, 18, 20]).map((p: number) => (
                <button
                  key={p}
                  onClick={() => setTipPct(tipPct === p ? null : p)}
                  className={`rounded-md border px-2 py-0.5 text-xs ${
                    tipPct === p
                      ? "border-gold bg-gold text-primary"
                      : "border-border bg-card hover:border-gold/60"
                  }`}
                >
                  {p}%
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1 text-sm">
            <Row label="Subtotal" value={fmt(subtotal)} />
            {discountClamped > 0 && <Row label="Discount" value={`-${fmt(discountClamped)}`} />}
            <Row label="Tax" value={fmt(tax)} />
            {tip > 0 && <Row label="Tip" value={fmt(tip)} />}
            <Separator className="my-2" />
            <div className="flex justify-between">
              <span className="font-display text-base">Total</span>
              <span className="font-display text-2xl font-semibold text-foreground">{fmt(total)}</span>
            </div>
          </div>
          <Button
            size="lg"
            disabled={cart.length === 0}
            onClick={() => setPaying(true)}
            className="mt-3 h-14 w-full bg-primary text-base font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Charge {fmt(total)}
          </Button>
        </div>
      </Card>

      {/* CUSTOMER SEARCH DIALOG */}
      <Dialog open={custOpen} onOpenChange={setCustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display">Attach customer</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search name, phone or email"
              className="pl-9"
              value={custSearch}
              onChange={(e) => setCustSearch(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-auto">
            {custResults.map((c) => (
              <button
                key={c.id}
                onClick={() => { setCustomer(c); setCustOpen(false); setCustSearch(""); }}
                className="flex w-full flex-col items-start rounded-md border border-transparent p-2 text-left text-sm hover:border-gold/60 hover:bg-accent/40"
              >
                <span className="font-medium">{c.full_name}</span>
                <span className="text-xs text-muted-foreground">{c.phone ?? ""} {c.email ?? ""}</span>
              </button>
            ))}
            {custSearch.length >= 2 && custResults.length === 0 && (
              <p className="p-3 text-center text-xs text-muted-foreground">No matches</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCustOpen(false); setNewCustOpen(true); }}>
              <UserPlus className="mr-2 h-4 w-4" /> New customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewCustomerDialog open={newCustOpen} onOpenChange={setNewCustOpen} mut={createCustMut} />

      {/* PAY DIALOG */}
      <Dialog open={paying} onOpenChange={setPaying}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Take payment · {fmt(total)}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <PayBtn label="Cash" sub="Open drawer" onClick={() => checkoutMut.mutate("cash")} disabled={checkoutMut.isPending} />
            <PayBtn label="Card" sub="Mock terminal" onClick={() => checkoutMut.mutate("card")} disabled={checkoutMut.isPending} />
            <PayBtn label="Other" sub="Zelle / external" onClick={() => checkoutMut.mutate("other")} disabled={checkoutMut.isPending} />
          </div>
          <p className="text-center text-[11px] text-muted-foreground">
            Card payments are processed via the mock provider. Connect Stripe Terminal in production.
          </p>
        </DialogContent>
      </Dialog>

      <ReceiptDialog
        orderId={receiptOrderId}
        onClose={() => setReceiptOrderId(null)}
        settings={settings}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function PayBtn({ label, sub, onClick, disabled }: { label: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded-2xl border border-border bg-card p-4 text-left shadow-soft transition hover:-translate-y-0.5 hover:border-gold disabled:opacity-50"
    >
      <div className="font-display text-xl font-semibold">{label}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </button>
  );
}

function NewCustomerDialog({
  open,
  onOpenChange,
  mut,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  mut: ReturnType<typeof useMutation<Customer, Error, { full_name: string; phone: string; email: string }>>;
}) {
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">New customer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input value={full_name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            disabled={!full_name || mut.isPending}
            onClick={() => mut.mutate({ full_name, phone, email })}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
