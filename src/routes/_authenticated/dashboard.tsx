import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { DollarSign, ShoppingBag, Users, TrendingUp } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Stat({
  label,
  value,
  icon: Icon,
  hint,
}: { label: string; value: string; icon: any; hint?: string }) {
  return (
    <Card className="border-border/60 shadow-soft">
      <CardContent className="flex items-start justify-between p-5">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-3xl font-semibold text-foreground">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-gold">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: settings } = useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("business_settings").select("business_name,currency").limit(1).maybeSingle();
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-today"],
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("total, customer_id")
        .eq("status", "completed")
        .gte("completed_at", today.toISOString());
      const totalSales = (orders ?? []).reduce((s, o) => s + Number(o.total), 0);
      const customers = new Set((orders ?? []).map((o) => o.customer_id).filter(Boolean)).size;
      const avg = orders && orders.length > 0 ? totalSales / orders.length : 0;
      const { count: custCount } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true });
      return {
        totalSales,
        orderCount: orders?.length ?? 0,
        avg,
        customers,
        custCount: custCount ?? 0,
      };
    },
  });

  const currency = settings?.currency || "USD";
  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Today at {settings?.business_name || "your salon"}</h1>
          <p className="text-sm text-muted-foreground">
            {today.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Link to="/pos">+ New Sale</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Today's Sales" value={fmt(stats?.totalSales ?? 0)} icon={DollarSign} />
        <Stat label="Transactions" value={String(stats?.orderCount ?? 0)} icon={ShoppingBag} />
        <Stat label="Average Ticket" value={fmt(stats?.avg ?? 0)} icon={TrendingUp} />
        <Stat
          label="Customers"
          value={String(stats?.custCount ?? 0)}
          icon={Users}
          hint={`${stats?.customers ?? 0} served today`}
        />
      </div>

      <Card className="border-border/60 shadow-soft">
        <CardHeader className="pb-3">
          <h2 className="font-display text-xl">Quick actions</h2>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Button asChild variant="outline" className="h-20 justify-start gap-3 border-gold/30 bg-accent/40 text-left">
            <Link to="/pos"><div><div className="font-semibold">POS</div><div className="text-xs text-muted-foreground">Start a sale</div></div></Link>
          </Button>
          <Button asChild variant="outline" className="h-20 justify-start gap-3 border-gold/30 bg-accent/40 text-left">
            <Link to="/customers"><div><div className="font-semibold">Customers</div><div className="text-xs text-muted-foreground">Search & create</div></div></Link>
          </Button>
          <Button asChild variant="outline" className="h-20 justify-start gap-3 border-gold/30 bg-accent/40 text-left">
            <Link to="/services"><div><div className="font-semibold">Services</div><div className="text-xs text-muted-foreground">Edit menu & prices</div></div></Link>
          </Button>
          <Button asChild variant="outline" className="h-20 justify-start gap-3 border-gold/30 bg-accent/40 text-left">
            <Link to="/settings"><div><div className="font-semibold">Settings</div><div className="text-xs text-muted-foreground">Business profile</div></div></Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
