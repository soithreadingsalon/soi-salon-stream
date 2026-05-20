import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Download, FileSpreadsheet, Printer, User } from "lucide-react";
import { downloadExcelReport, downloadCsvOrders } from "@/lib/reportExport";

export const Route = createFileRoute("/_authenticated/my-sales")({
  component: MySalesPage,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => {
  const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10);
};

function MySalesPage() {
  const { user } = useAuth();
  const [from, setFrom] = useState(daysAgoISO(7));
  const [to, setTo] = useState(todayISO());
  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;

  const { data: profile } = useQuery({
    queryKey: ["my_profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("full_name,email").eq("id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["my_sales", user?.id, from, to],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, total, subtotal, tax_total, tip_total, discount_total, status, completed_at, created_at")
        .eq("cashier_id", user!.id)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const orderIds = useMemo(() => orders.map((o: any) => o.id), [orders]);

  const { data: payments = [] } = useQuery({
    queryKey: ["my_sales_pay", orderIds.join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("payments")
        .select("order_id, amount, method, payment_method")
        .in("order_id", orderIds);
      return data ?? [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["my_sales_items", orderIds.join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("order_items")
        .select("order_id, service_name, quantity, unit_price")
        .in("order_id", orderIds);
      return data ?? [];
    },
  });

  const { data: shifts = [] } = useQuery({
    queryKey: ["my_shifts", user?.id, from, to],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("worker_shifts")
        .select("clock_in_at, clock_out_at")
        .eq("worker_id", user!.id)
        .gte("clock_in_at", fromIso)
        .lte("clock_in_at", toIso);
      return data ?? [];
    },
  });

  const completed = useMemo(() => (orders as any[]).filter((o) => o.status === "completed"), [orders]);
  const payByOrder = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of payments as any[]) {
      const a = m.get(p.order_id) ?? []; a.push(p); m.set(p.order_id, a);
    }
    return m;
  }, [payments]);

  const kpis = useMemo(() => {
    const gross = completed.reduce((s, o) => s + Number(o.total), 0);
    const tips = completed.reduce((s, o) => s + Number(o.tip_total), 0);
    const tax = completed.reduce((s, o) => s + Number(o.tax_total), 0);
    const sub = completed.reduce((s, o) => s + Number(o.subtotal), 0);
    const disc = completed.reduce((s, o) => s + Number(o.discount_total), 0);
    const count = completed.length;
    const avg = count ? gross / count : 0;
    const hours = (shifts as any[]).reduce((s, sh) => {
      if (!sh.clock_out_at) return s;
      return s + (new Date(sh.clock_out_at).getTime() - new Date(sh.clock_in_at).getTime()) / 3600_000;
    }, 0);
    return { gross, tips, tax, sub, disc, count, avg, hours };
  }, [completed, shifts]);

  const byMethod = useMemo(() => {
    const m: Record<string, { count: number; amount: number }> = {};
    for (const o of completed) {
      for (const p of payByOrder.get(o.id) ?? []) {
        const k = p.payment_method ?? p.method ?? "unknown";
        m[k] = m[k] ?? { count: 0, amount: 0 };
        m[k].count += 1;
        m[k].amount += Number(p.amount);
      }
    }
    return Object.entries(m).sort((a, b) => b[1].amount - a[1].amount);
  }, [completed, payByOrder]);

  const topServices = useMemo(() => {
    const set = new Set(completed.map((o) => o.id));
    const m: Record<string, { qty: number; amount: number }> = {};
    for (const i of items as any[]) {
      if (!set.has(i.order_id)) continue;
      m[i.service_name] = m[i.service_name] ?? { qty: 0, amount: 0 };
      m[i.service_name].qty += i.quantity;
      m[i.service_name].amount += i.quantity * Number(i.unit_price);
    }
    return Object.entries(m).sort((a, b) => b[1].amount - a[1].amount).slice(0, 15);
  }, [items, completed]);

  const buildRows = () =>
    completed.map((o) => {
      const pays = payByOrder.get(o.id) ?? [];
      return {
        "Order #": o.order_number,
        Date: new Date(o.completed_at ?? o.created_at).toLocaleString(),
        Subtotal: Number(o.subtotal),
        Discount: Number(o.discount_total),
        Tax: Number(o.tax_total),
        Tip: Number(o.tip_total),
        Total: Number(o.total),
        Methods: pays.map((p: any) => p.payment_method ?? p.method).join("|"),
      };
    });

  const myLabel = profile?.full_name ?? profile?.email ?? user?.email ?? "Me";

  const downloadExcel = () =>
    downloadExcelReport(
      {
        title: "My Sales Report",
        fromDate: from,
        toDate: to,
        generatedAt: new Date().toLocaleString(),
        cashierLabel: myLabel,
        kpis: [
          ["Gross sales", kpis.gross],
          ["Tips", kpis.tips],
          ["Tax", kpis.tax],
          ["Orders", kpis.count],
          ["Avg ticket", kpis.avg],
          ["Hours worked", Number(kpis.hours.toFixed(2))],
        ],
        orders: buildRows(),
        byMethod: byMethod.map(([m, v]) => ({ Method: m, Count: v.count, Amount: v.amount })),
        topServices: topServices.map(([n, v]) => ({ Service: n, Qty: v.qty, Revenue: v.amount })),
      },
      `my-sales-${from}-to-${to}.xlsx`,
    );

  const downloadCSV = () => downloadCsvOrders(buildRows(), `my-sales-${from}-to-${to}.csv`);

  const setPreset = (days: number) => { setFrom(daysAgoISO(days)); setTo(todayISO()); };

  return (
    <div className="print-doc mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div className="print-only mb-4">
        <h1>SOI Threading & Salon — My Sales</h1>
        <p style={{ fontSize: "10pt", color: "#444", margin: 0 }}>
          {myLabel} · {from} to {to} · Generated {new Date().toLocaleString()}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-semibold">
            <User className="h-7 w-7 text-gold" /> My Sales
          </h1>
          <p className="text-sm text-muted-foreground">{myLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadExcel} disabled={completed.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={downloadCSV} disabled={completed.length === 0}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      <Card className="border-border/60 shadow-soft print:hidden">
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-3">
            <Label className="text-xs">Quick range</Label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setPreset(0)}>Today</Button>
              <Button size="sm" variant="outline" onClick={() => setPreset(7)}>Last 7 days</Button>
              <Button size="sm" variant="outline" onClick={() => setPreset(30)}>Last 30 days</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="kpi-grid grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Gross sales" value={fmt(kpis.gross)} />
        <Kpi label="Tips" value={fmt(kpis.tips)} />
        <Kpi label="Orders" value={String(kpis.count)} />
        <Kpi label="Avg ticket" value={fmt(kpis.avg)} />
        <Kpi label="Tax" value={fmt(kpis.tax)} />
        <Kpi label="Discount given" value={fmt(kpis.disc)} />
        <Kpi label="Hours worked" value={kpis.hours.toFixed(2)} />
        <Kpi label="Range" value={`${from} → ${to}`} small />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/60 shadow-soft">
          <CardHeader><h2 className="font-display text-lg">Payments by method</h2></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="p-2 text-left">Method</th><th className="p-2 text-right">Count</th><th className="p-2 text-right">Amount</th></tr>
              </thead>
              <tbody>
                {byMethod.map(([m, v]) => (
                  <tr key={m} className="border-t border-border">
                    <td className="p-2 capitalize">{m}</td>
                    <td className="p-2 text-right">{v.count}</td>
                    <td className="p-2 text-right font-semibold text-gold">{fmt(v.amount)}</td>
                  </tr>
                ))}
                {byMethod.length === 0 && (
                  <tr><td colSpan={3} className="p-6 text-center text-xs text-muted-foreground">No payments</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-soft">
          <CardHeader><h2 className="font-display text-lg">Top services</h2></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr><th className="p-2 text-left">Service</th><th className="p-2 text-right">Qty</th><th className="p-2 text-right">Revenue</th></tr>
              </thead>
              <tbody>
                {topServices.map(([n, v]) => (
                  <tr key={n} className="border-t border-border">
                    <td className="p-2">{n}</td>
                    <td className="p-2 text-right">{v.qty}</td>
                    <td className="p-2 text-right font-semibold text-gold">{fmt(v.amount)}</td>
                  </tr>
                ))}
                {topServices.length === 0 && (
                  <tr><td colSpan={3} className="p-6 text-center text-xs text-muted-foreground">No items</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60 shadow-soft">
        <CardHeader><h2 className="font-display text-lg">Orders ({completed.length})</h2></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-2 text-left">#</th>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-right">Subtotal</th>
                <th className="p-2 text-right">Tax</th>
                <th className="p-2 text-right">Tip</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-left">Methods</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">Loading…</td></tr>
              )}
              {completed.map((o) => {
                const pays = payByOrder.get(o.id) ?? [];
                return (
                  <tr key={o.id} className="border-t border-border">
                    <td className="p-2 font-medium">#{o.order_number}</td>
                    <td className="p-2 text-muted-foreground">
                      {new Date(o.completed_at ?? o.created_at).toLocaleString()}
                    </td>
                    <td className="p-2 text-right">{fmt(Number(o.subtotal))}</td>
                    <td className="p-2 text-right">{fmt(Number(o.tax_total))}</td>
                    <td className="p-2 text-right">{fmt(Number(o.tip_total))}</td>
                    <td className="p-2 text-right font-semibold text-gold">{fmt(Number(o.total))}</td>
                    <td className="p-2 text-xs uppercase text-muted-foreground">
                      {pays.map((p: any) => p.payment_method ?? p.method).join(", ")}
                    </td>
                  </tr>
                );
              })}
              {!isLoading && completed.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-xs text-muted-foreground">No sales in this range.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub, small }: { label: string; value: string; sub?: string; small?: boolean }) {
  return (
    <Card className="kpi border-border/60 shadow-soft">
      <CardContent className="p-4">
        <p className="kpi-label text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className={`kpi-value font-display ${small ? "text-base" : "text-2xl"} font-semibold`}>{value}</p>
        {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  );
}
