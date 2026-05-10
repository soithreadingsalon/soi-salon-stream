import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Star, Gift, Phone, Mail, Calendar } from "lucide-react";

export const Route = createFileRoute("/_authenticated/customers/$customerId")({
  component: CustomerProfile,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

function CustomerProfile() {
  const { customerId } = Route.useParams();

  const { data: customer } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers")
        .select("*").eq("id", customerId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: loyalty } = useQuery({
    queryKey: ["loyalty", customerId],
    queryFn: async () => {
      const { data } = await supabase.from("loyalty_accounts")
        .select("*").eq("customer_id", customerId).maybeSingle();
      return data;
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["customer-orders", customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id,order_number,total,completed_at,status")
        .eq("customer_id", customerId)
        .order("completed_at", { ascending: false, nullsFirst: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!customer) {
    return <div className="p-8 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All customers
      </Link>

      <Card className="border-border/60 shadow-soft">
        <CardContent className="flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gold text-primary font-display text-2xl font-bold">
            {customer.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="font-display text-2xl font-semibold">{customer.full_name}</h1>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-muted-foreground">
              {customer.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{customer.phone}</span>}
              {customer.email && <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{customer.email}</span>}
              {customer.last_visit_at && <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />Last: {new Date(customer.last_visit_at).toLocaleDateString()}</span>}
            </div>
          </div>
          <div className="flex gap-2">
            <Badge className="gap-1 bg-gold/15 text-foreground border-gold/30">
              <Star className="h-3 w-3 text-gold" />{loyalty?.points_balance ?? 0} pts
            </Badge>
            {(loyalty?.free_eyebrow_credits ?? 0) > 0 && (
              <Badge className="gap-1 bg-gold/20 text-foreground border-gold/40">
                <Gift className="h-3 w-3 text-gold" />{loyalty?.free_eyebrow_credits} free
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Visits" value={String(customer.visit_count ?? 0)} />
        <Stat label="Lifetime spend" value={fmt(Number(customer.total_spend ?? 0))} />
        <Stat label="Eyebrow visits" value={String(loyalty?.eyebrow_threading_count ?? 0)} sub={`${10 - ((loyalty?.eyebrow_threading_count ?? 0) % 10)} until next free`} />
      </div>

      <Card className="border-border/60 shadow-soft">
        <CardHeader className="border-b border-border">
          <h2 className="font-display text-lg">Recent orders</h2>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="p-3 text-left">Order</th><th className="p-3 text-left">Date</th><th className="p-3 text-right">Total</th></tr>
            </thead>
            <tbody>
              {orders.map((o: any) => (
                <tr key={o.id} className="border-t border-border">
                  <td className="p-3 font-medium">#{o.order_number}</td>
                  <td className="p-3 text-muted-foreground">{o.completed_at ? new Date(o.completed_at).toLocaleString() : "—"}</td>
                  <td className="p-3 text-right font-semibold text-gold">{fmt(Number(o.total))}</td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={3} className="p-8 text-center text-muted-foreground">No orders yet</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {(customer.notes || customer.allergies) && (
        <Card className="border-border/60 shadow-soft">
          <CardHeader className="border-b border-border"><h2 className="font-display text-lg">Notes</h2></CardHeader>
          <CardContent className="space-y-2 p-4 text-sm">
            {customer.allergies && <p><strong>Allergies:</strong> {customer.allergies}</p>}
            {customer.notes && <p>{customer.notes}</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="border-border/60 shadow-soft">
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
        {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
