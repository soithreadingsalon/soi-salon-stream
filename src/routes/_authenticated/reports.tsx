import { useMemo, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Download, Printer, BarChart3, FileSpreadsheet, Pencil } from "lucide-react";
import { downloadExcelReport, downloadCsvOrders } from "@/lib/reportExport";
import { EditPaymentDialog } from "./-reports/EditPaymentDialog";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});


const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function daysAgoISO(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function ReportsPage() {
  const { hasRole, loading, rolesLoading, user } = useAuth();
  if (loading || (user && rolesLoading)) return <div className="p-8">Loading…</div>;
  if (!hasRole("super_admin", "admin", "manager")) return <Navigate to="/dashboard" />;
  const isAdmin = hasRole("super_admin", "admin");

  const [from, setFrom] = useState(daysAgoISO(7));
  const [to, setTo] = useState(todayISO());
  const [method, setMethod] = useState<string>("all");
  const [cashierId, setCashierId] = useState<string>("all");
  const [editing, setEditing] = useState<{ id: string; number: any } | null>(null);

  const fromIso = `${from}T00:00:00`;
  const toIso = `${to}T23:59:59`;


  const { data: cashiers = [] } = useQuery({
    queryKey: ["cashiers_list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .order("full_name");
      return data ?? [];
    },
  });

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["reports_orders", from, to, cashierId],
    queryFn: async () => {
      let q = supabase
        .from("orders")
        .select("id, order_number, total, subtotal, tax_total, tip_total, discount_total, status, cashier_id, completed_at, created_at, customer_id")
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .order("created_at", { ascending: false })
        .limit(2000);
      if (cashierId !== "all") q = q.eq("cashier_id", cashierId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const orderIds = useMemo(() => orders.map((o: any) => o.id), [orders]);

  const { data: payments = [] } = useQuery({
    queryKey: ["reports_payments", orderIds.join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("order_id, amount, method, payment_method, status")
        .in("order_id", orderIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["reports_items", orderIds.join(",")],
    enabled: orderIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("order_id, service_name, quantity, unit_price, taxable")
        .in("order_id", orderIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Filter by payment method
  const paymentByOrder = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const p of payments as any[]) {
      const arr = m.get(p.order_id) ?? [];
      arr.push(p);
      m.set(p.order_id, arr);
    }
    return m;
  }, [payments]);

  const completedOrders = useMemo(() => {
    return (orders as any[]).filter((o) => {
      if (o.status !== "completed") return false;
      if (method === "all") return true;
      const pays = paymentByOrder.get(o.id) ?? [];
      return pays.some((p) => (p.payment_method ?? p.method) === method);
    });
  }, [orders, paymentByOrder, method]);

  const kpis = useMemo(() => {
    const totalRevenue = completedOrders.reduce((s, o) => s + Number(o.total), 0);
    const totalSubtotal = completedOrders.reduce((s, o) => s + Number(o.subtotal), 0);
    const totalTax = completedOrders.reduce((s, o) => s + Number(o.tax_total), 0);
    const totalTips = completedOrders.reduce((s, o) => s + Number(o.tip_total), 0);
    const totalDiscount = completedOrders.reduce((s, o) => s + Number(o.discount_total), 0);
    const orderCount = completedOrders.length;
    const avgTicket = orderCount ? totalRevenue / orderCount : 0;
    const netSales = totalSubtotal - totalDiscount;
    return { totalRevenue, totalTax, totalTips, totalDiscount, orderCount, avgTicket, netSales };
  }, [completedOrders]);

  const byMethod = useMemo(() => {
    const m: Record<string, { count: number; amount: number }> = {};
    for (const o of completedOrders) {
      const pays = paymentByOrder.get(o.id) ?? [];
      for (const p of pays) {
        const key = p.payment_method ?? p.method ?? "unknown";
        m[key] = m[key] ?? { count: 0, amount: 0 };
        m[key].count += 1;
        m[key].amount += Number(p.amount);
      }
    }
    return Object.entries(m).sort((a, b) => b[1].amount - a[1].amount);
  }, [completedOrders, paymentByOrder]);

  const topServices = useMemo(() => {
    const orderIdSet = new Set(completedOrders.map((o) => o.id));
    const m: Record<string, { qty: number; amount: number }> = {};
    for (const i of items as any[]) {
      if (!orderIdSet.has(i.order_id)) continue;
      m[i.service_name] = m[i.service_name] ?? { qty: 0, amount: 0 };
      m[i.service_name].qty += i.quantity;
      m[i.service_name].amount += i.quantity * Number(i.unit_price);
    }
    return Object.entries(m)
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 15);
  }, [items, completedOrders]);

  const buildOrderRows = () =>
    completedOrders.map((o) => {
      const pays = paymentByOrder.get(o.id) ?? [];
      const cashier = (cashiers as any[]).find((c) => c.id === o.cashier_id);
      return {
        "Order #": o.order_number,
        Date: new Date(o.completed_at ?? o.created_at).toLocaleString(),
        Cashier: cashier?.full_name ?? cashier?.email ?? "",
        Subtotal: Number(o.subtotal),
        Discount: Number(o.discount_total),
        Tax: Number(o.tax_total),
        Tip: Number(o.tip_total),
        Total: Number(o.total),
        Methods: pays.map((p: any) => p.payment_method ?? p.method).join("|"),
      };
    });

  const downloadCSV = () => downloadCsvOrders(buildOrderRows(), `soi-report-${from}-to-${to}.csv`);

  const downloadExcel = () => {
    downloadExcelReport(
      {
        title: "Sales Report",
        fromDate: from,
        toDate: to,
        generatedAt: new Date().toLocaleString(),
        kpis: [
          ["Gross sales", kpis.totalRevenue],
          ["Net sales", kpis.netSales],
          ["Tax collected", kpis.totalTax],
          ["Tips", kpis.totalTips],
          ["Discount given", kpis.totalDiscount],
          ["Orders", kpis.orderCount],
          ["Avg ticket", kpis.avgTicket],
        ],
        orders: buildOrderRows(),
        byMethod: byMethod.map(([m, v]) => ({ Method: m, Count: v.count, Amount: v.amount })),
        topServices: topServices.map(([n, v]) => ({ Service: n, Qty: v.qty, Revenue: v.amount })),
      },
      `soi-report-${from}-to-${to}.xlsx`,
    );
  };

  return (
    <div className="print-doc mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      {/* Print-only header */}
      <div className="print-only mb-4">
        <h1>SOI Threading & Salon — Sales Report</h1>
        <p style={{ fontSize: "10pt", color: "#444", margin: 0 }}>
          {from} to {to} · Generated {new Date().toLocaleString()}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h1 className="flex items-center gap-2 font-display text-3xl font-semibold">
            <BarChart3 className="h-7 w-7 text-gold" /> Reports
          </h1>
          <p className="text-sm text-muted-foreground">Sales, payments, top services</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={downloadExcel} disabled={completedOrders.length === 0}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={downloadCSV} disabled={completedOrders.length === 0}>
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
          <div className="space-y-1.5">
            <Label className="text-xs">Payment method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All methods</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="zelle">Zelle</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">Cashier</Label>
            <Select value={cashierId} onValueChange={setCashierId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All cashiers</SelectItem>
                {(cashiers as any[]).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.full_name ?? c.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="kpi-grid grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Gross sales" value={fmt(kpis.totalRevenue)} />
        <Kpi label="Net sales" value={fmt(kpis.netSales)} sub={`After ${fmt(kpis.totalDiscount)} discount`} />
        <Kpi label="Tax collected" value={fmt(kpis.totalTax)} />
        <Kpi label="Tips" value={fmt(kpis.totalTips)} />
        <Kpi label="Orders" value={String(kpis.orderCount)} />
        <Kpi label="Avg ticket" value={fmt(kpis.avgTicket)} />
        <Kpi label="Discount given" value={fmt(kpis.totalDiscount)} />
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
        <CardHeader><h2 className="font-display text-lg">Orders ({completedOrders.length})</h2></CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-2 text-left">#</th>
                <th className="p-2 text-left">Date</th>
                <th className="p-2 text-left">Cashier</th>
                <th className="p-2 text-right">Subtotal</th>
                <th className="p-2 text-right">Tax</th>
                <th className="p-2 text-right">Tip</th>
                <th className="p-2 text-right">Total</th>
                <th className="p-2 text-left">Methods</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="p-8 text-center text-xs text-muted-foreground">Loading…</td></tr>
              )}
              {completedOrders.map((o) => {
                const pays = paymentByOrder.get(o.id) ?? [];
                const cashier = (cashiers as any[]).find((c) => c.id === o.cashier_id);
                return (
                  <tr key={o.id} className="border-t border-border">
                    <td className="p-2 font-medium">#{o.order_number}</td>
                    <td className="p-2 text-muted-foreground">
                      {new Date(o.completed_at ?? o.created_at).toLocaleString()}
                    </td>
                    <td className="p-2 text-muted-foreground">{cashier?.full_name ?? cashier?.email ?? "—"}</td>
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
              {!isLoading && completedOrders.length === 0 && (
                <tr><td colSpan={8} className="p-8 text-center text-xs text-muted-foreground">No orders match these filters</td></tr>
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
