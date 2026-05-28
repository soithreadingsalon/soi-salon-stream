import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { fmtDate, fmtDateTime } from "@/lib/datetime";
import { downloadExcelReport, type ReportData } from "@/lib/reportExport";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, KeyRound, UserX, ExternalLink, Undo2, Trash2, Shield } from "lucide-react";
import { upsertWorkerPin, deactivateWorker, setWorkerRole, listWorkerRoles, setRolePermissions } from "@/lib/worker-auth.functions";


export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { hasRole, loading, rolesLoading, user } = useAuth();
  if (loading || (user && rolesLoading)) return <div className="p-8">Loading…</div>;
  if (!hasRole("super_admin", "admin")) return <Navigate to="/dashboard" />;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your business, workers, services and customers</p>
      <Tabs defaultValue="business">
        <TabsList className="flex-wrap bg-muted/40">
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="workers">Workers & PINs</TabsTrigger>
          <TabsTrigger value="permissions">Roles & Permissions</TabsTrigger>
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="catalog">Services</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="recycle">Recycle Bin</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="pt-6"><BusinessTab /></TabsContent>
        <TabsContent value="workers"  className="pt-6"><WorkersTab /></TabsContent>
        <TabsContent value="permissions" className="pt-6"><PermissionsTab /></TabsContent>
        <TabsContent value="shifts"   className="pt-6"><ShiftsTab /></TabsContent>
        <TabsContent value="catalog"  className="pt-6"><QuickLink to="/services" label="Open service catalog editor" /></TabsContent>
        <TabsContent value="customers" className="pt-6"><QuickLink to="/customers" label="Open customer directory" /></TabsContent>
        <TabsContent value="recycle"   className="pt-6"><RecycleBinTab /></TabsContent>
      </Tabs>

      </Tabs>
    </div>
  );
}

function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Card className="border-border/60 shadow-soft">
      <CardContent className="flex items-center justify-between p-6">
        <p className="text-sm text-muted-foreground">{label}</p>
        <Button asChild variant="outline"><Link to={to}><ExternalLink className="mr-2 h-4 w-4" />Open</Link></Button>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── BUSINESS ─────────────────────────── */

function BusinessTab() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_settings").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (data && !form) setForm({ ...data, tip_presets: (data.tip_presets ?? []).join(",") }); }, [data, form]);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        tax_rate: Number(form.tax_rate),
        tip_presets: String(form.tip_presets).split(",").map((x: string) => Number(x.trim())).filter((n: number) => !isNaN(n)),
      };
      const { error } = await supabase.from("business_settings").update(payload).eq("id", data!.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); qc.invalidateQueries({ queryKey: ["business_settings"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  if (!form) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  const upd = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <Card className="border-border/60 shadow-soft">
      <CardHeader><h2 className="font-display text-xl">Business profile</h2></CardHeader>
      <CardContent className="space-y-4">
        <Field label="Business name"><Input value={form.business_name ?? ""} onChange={(e) => upd("business_name", e.target.value)} /></Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Phone"><Input value={form.phone ?? ""} onChange={(e) => upd("phone", e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={form.email ?? ""} onChange={(e) => upd("email", e.target.value)} /></Field>
        </div>
        <Field label="Address"><Textarea rows={2} value={form.address ?? ""} onChange={(e) => upd("address", e.target.value)} /></Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Website"><Input value={form.website ?? ""} onChange={(e) => upd("website", e.target.value)} /></Field>
          <Field label="Instagram"><Input value={form.instagram ?? ""} onChange={(e) => upd("instagram", e.target.value)} /></Field>
        </div>
        <Field label="Logo URL"><Input value={form.logo_url ?? ""} onChange={(e) => upd("logo_url", e.target.value)} /></Field>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Tax rate (decimal, e.g. 0.06625)"><Input type="number" step="0.00001" value={form.tax_rate ?? 0} onChange={(e) => upd("tax_rate", e.target.value)} /></Field>
          <Field label="Tip presets (% comma-separated)"><Input value={form.tip_presets} onChange={(e) => upd("tip_presets", e.target.value)} /></Field>
          <Field label="Currency"><Input value={form.currency ?? "USD"} onChange={(e) => upd("currency", e.target.value)} /></Field>
        </div>
        <Field label="Timezone"><Input value={form.timezone ?? ""} onChange={(e) => upd("timezone", e.target.value)} /></Field>
        <Field label="Receipt footer"><Textarea rows={2} value={form.receipt_footer ?? ""} onChange={(e) => upd("receipt_footer", e.target.value)} /></Field>
        <Field label="Refund policy"><Textarea rows={2} value={form.refund_policy ?? ""} onChange={(e) => upd("refund_policy", e.target.value)} /></Field>

        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-base">Cash drawer</h3>
              <p className="text-xs text-muted-foreground">Opens automatically only after a confirmed cash payment.</p>
            </div>
            <Switch checked={!!form.cash_drawer_enabled} onCheckedChange={(v) => upd("cash_drawer_enabled", v)} />
          </div>
          {form.cash_drawer_enabled && (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Connection type">
                  <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.cash_drawer_connection_type ?? "manual"} onChange={(e) => upd("cash_drawer_connection_type", e.target.value)}>
                    <option value="manual">Manual</option>
                    <option value="receipt_printer">Receipt printer (print to open)</option>
                    <option value="escpos_network">Network ESC/POS printer</option>
                    <option value="escpos_usb">USB ESC/POS (advanced)</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </Field>
                <Field label="Printer IP (network mode)"><Input value={form.cash_drawer_printer_ip ?? ""} onChange={(e) => upd("cash_drawer_printer_ip", e.target.value)} placeholder="192.168.1.50" /></Field>
                <Field label="Printer port"><Input type="number" value={form.cash_drawer_printer_port ?? 9100} onChange={(e) => upd("cash_drawer_printer_port", Number(e.target.value))} /></Field>
              </div>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Network &amp; USB modes need a local POS bridge on the workstation. Without it the transaction still saves and the drawer is marked &quot;failed&quot;.
              </p>
              <Button type="button" variant="outline" size="sm" onClick={async () => {
                const { openCashDrawer } = await import("@/lib/cashDrawer");
                const status = await openCashDrawer(form);
                if (status === "opened") toast.success("Drawer signal sent");
                else if (status === "disabled") toast.info("Drawer is disabled");
                else toast.error(`Drawer ${status}`);
              }}>Test cash drawer</Button>
            </>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={() => mut.mutate()} disabled={mut.isPending} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {mut.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

/* ─────────────────────────── WORKERS ─────────────────────────── */

function WorkersTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const upsert = useServerFn(upsertWorkerPin);
  const deact = useServerFn(deactivateWorker);

  const { data: workers = [] } = useQuery({
    queryKey: ["workers_admin"],
    queryFn: async () => {
      const { data: pins, error } = await supabase
        .from("worker_pins")
        .select("user_id, display_name, active, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (pins ?? []).map((p) => p.user_id);
      if (ids.length === 0) return [];
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", ids);
      const byId = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (pins ?? []).map((p: any) => ({ ...p, profiles: byId.get(p.user_id) ?? null }));
    },
  });

  const deactMut = useMutation({
    mutationFn: async (workerId: string) => { await deact({ data: { workerId } }); },
    onSuccess: () => { toast.success("Worker deactivated"); qc.invalidateQueries({ queryKey: ["workers_admin"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="border-border/60 shadow-soft">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <h2 className="font-display text-xl">Workers & PINs</h2>
          <p className="text-sm text-muted-foreground">Workers sign in to the POS with a 4-digit PIN</p>
        </div>
        <Button onClick={() => { setEditing({ mode: "create", email: "", fullName: "", pin: "" }); setOpen(true); }} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" /> Add worker
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="p-3 text-left">Name</th><th className="p-3 text-left">Email</th><th className="p-3 text-center">Active</th><th className="p-3 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {workers.map((w: any) => (
              <tr key={w.user_id} className="border-t border-border">
                <td className="p-3 font-medium">{w.display_name ?? w.profiles?.full_name ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{w.profiles?.email ?? "—"}</td>
                <td className="p-3 text-center">{w.active ? "✓" : "—"}</td>
                <td className="p-3 text-right space-x-1">
                  <Button size="sm" variant="outline" onClick={() => { setEditing({ mode: "reset", workerId: w.user_id, fullName: w.display_name ?? w.profiles?.full_name, pin: "" }); setOpen(true); }}>
                    <KeyRound className="mr-1 h-4 w-4" /> Reset PIN
                  </Button>
                  {w.active && (
                    <Button size="sm" variant="ghost" onClick={() => confirm(`Deactivate ${w.display_name}?`) && deactMut.mutate(w.user_id)}>
                      <UserX className="mr-1 h-4 w-4 text-destructive" /> Deactivate
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {workers.length === 0 && (
              <tr><td colSpan={4} className="p-12 text-center text-sm text-muted-foreground">No workers yet — add your first one</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>

      {editing && (
        <WorkerDialog
          open={open}
          setOpen={setOpen}
          state={editing}
          onSave={async (vals) => {
            await upsert({ data: vals });
            toast.success("Saved");
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["workers_admin"] });
            qc.invalidateQueries({ queryKey: ["workers_public"] });
          }}
        />
      )}
    </Card>
  );
}

function WorkerDialog({ open, setOpen, state, onSave }: { open: boolean; setOpen: (b: boolean) => void; state: any; onSave: (vals: any) => Promise<void> }) {
  const [email, setEmail] = useState(state.email ?? "");
  const [fullName, setFullName] = useState(state.fullName ?? "");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const isCreate = state.mode === "create";

  const submit = async () => {
    if (!/^\d{4}$/.test(pin)) return toast.error("PIN must be 4 digits");
    if (isCreate && (!email || !fullName)) return toast.error("Name and email required");
    setBusy(true);
    try {
      await onSave(isCreate
        ? { email, fullName, pin }
        : { workerId: state.workerId, fullName: state.fullName, pin });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">{isCreate ? "Add worker" : `Reset PIN — ${state.fullName}`}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {isCreate && (
            <>
              <Field label="Full name"><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
              <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="worker@example.com" /></Field>
            </>
          )}
          <Field label="4-digit PIN">
            <Input inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" />
          </Field>
          <p className="text-xs text-muted-foreground">Workers sign in by tapping their name on the login screen and entering this PIN.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── RECYCLE BIN ─────────────────────────── */

function RecycleBinTab() {
  return (
    <div className="space-y-6">
      <DeletedList
        title="Deleted customers"
        emptyLabel="No deleted customers"
        queryKey="customers_deleted"
        table="customers_deleted"
        labelFor={(r) => r.full_name}
        restoreRpc="restore_customer"
        hardRpc="hard_delete_customer"
        invalidateKeys={[["customers"]]}
        columns={[
          { header: "Name",  cell: (r) => r.full_name },
          { header: "Phone", cell: (r) => r.phone ?? "—" },
          { header: "Email", cell: (r) => r.email ?? "—" },
        ]}
      />
      <DeletedList
        title="Deleted services"
        emptyLabel="No deleted services"
        queryKey="services_deleted"
        table="services_deleted"
        labelFor={(r) => r.name}
        restoreRpc="restore_service"
        hardRpc="hard_delete_service"
        invalidateKeys={[["services-admin"], ["services"]]}
        columns={[
          { header: "Service", cell: (r) => r.name },
          { header: "Price",   cell: (r) => `$${Number(r.price).toFixed(2)}` },
          { header: "Active",  cell: (r) => (r.active ? "✓" : "—") },
        ]}
      />
    </div>
  );
}

interface DeletedListProps {
  title: string;
  emptyLabel: string;
  queryKey: string;
  table: "customers_deleted" | "services_deleted";
  labelFor: (row: any) => string;
  restoreRpc: "restore_customer" | "restore_service";
  hardRpc: "hard_delete_customer" | "hard_delete_service";
  invalidateKeys: string[][];
  columns: { header: string; cell: (row: any) => React.ReactNode }[];
}

function DeletedList({
  title, emptyLabel, queryKey, table, labelFor, restoreRpc, hardRpc, invalidateKeys, columns,
}: DeletedListProps) {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .order("deleted_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [queryKey] });
    invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
  };

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc(restoreRpc, { _id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Restored"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  const hard = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc(hardRpc, { _id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Permanently deleted"); refresh(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card className="border-border/60 shadow-soft">
      <CardHeader>
        <h2 className="font-display text-xl">{title}</h2>
        <p className="text-sm text-muted-foreground">{data.length} item{data.length === 1 ? "" : "s"}</p>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {columns.map((c) => <th key={c.header} className="p-3 text-left">{c.header}</th>)}
              <th className="p-3 text-left">Deleted</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r: any) => (
              <tr key={r.id} className="border-t border-border">
                {columns.map((c) => <td key={c.header} className="p-3">{c.cell(r)}</td>)}
                <td className="p-3 text-muted-foreground">{new Date(r.deleted_at).toLocaleString()}</td>
                <td className="p-3 text-right space-x-1 whitespace-nowrap">
                  <Button size="sm" variant="outline" onClick={() => restore.mutate(r.id)} disabled={restore.isPending}>
                    <Undo2 className="mr-1 h-4 w-4" /> Restore
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Permanently delete ${labelFor(r)}? This cannot be undone.`)) {
                        hard.mutate(r.id);
                      }
                    }}
                    disabled={hard.isPending}
                  >
                    <Trash2 className="mr-1 h-4 w-4 text-destructive" /> Delete permanently
                  </Button>
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr><td colSpan={columns.length + 2} className="p-8 text-center text-sm text-muted-foreground">{emptyLabel}</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/* ─────────────────────────── SHIFTS ─────────────────────────── */

function ShiftsTab() {
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(weekAgo);
  const [to, setTo] = useState(today);
  const [workerFilter, setWorkerFilter] = useState<string>("all");

  const { data: shifts = [] } = useQuery({
    queryKey: ["worker_shifts_admin", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_shifts")
        .select("*")
        .gte("shift_date", from)
        .lte("shift_date", to)
        .order("clock_in_at", { ascending: true })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const closeOpen = useMutation({
    mutationFn: async (s: any) => {
      const now = new Date();
      const hrs = (now.getTime() - new Date(s.clock_in_at).getTime()) / 3_600_000;
      const { error } = await supabase
        .from("worker_shifts")
        .update({
          clock_out_at: now.toISOString(),
          total_hours: Number(hrs.toFixed(2)),
          status: "closed",
          is_adjusted: true,
          admin_notes: "Closed by admin",
        } as any)
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Shift closed"); qc.invalidateQueries({ queryKey: ["worker_shifts_admin"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const allShifts = shifts as any[];
  const workerOptions = Array.from(
    new Map(allShifts.map((s) => [s.worker_id, s.worker_name ?? "—"])).entries(),
  ).sort(([, a], [, b]) => String(a).localeCompare(String(b)));

  const filtered = workerFilter === "all"
    ? allShifts
    : allShifts.filter((s) => s.worker_id === workerFilter);

  // Group by worker → date
  type Group = { workerId: string; workerName: string; date: string; rows: any[]; hours: number };
  const groupsMap = new Map<string, Group>();
  for (const s of filtered) {
    const key = `${s.worker_id}__${s.shift_date}`;
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        workerId: s.worker_id,
        workerName: s.worker_name ?? "—",
        date: s.shift_date,
        rows: [],
        hours: 0,
      });
    }
    const g = groupsMap.get(key)!;
    g.rows.push(s);
    if (s.total_hours) g.hours += Number(s.total_hours);
  }
  const groups = Array.from(groupsMap.values()).sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.workerName.localeCompare(b.workerName);
  });

  const totalHours = filtered
    .filter((s) => s.total_hours)
    .reduce((sum, s) => sum + Number(s.total_hours), 0);

  // Per-worker grand totals for the range
  const perWorker = new Map<string, { name: string; hours: number; sessions: number }>();
  for (const s of filtered) {
    const cur = perWorker.get(s.worker_id) ?? { name: s.worker_name ?? "—", hours: 0, sessions: 0 };
    cur.sessions += 1;
    if (s.total_hours) cur.hours += Number(s.total_hours);
    perWorker.set(s.worker_id, cur);
  }

  const handleExportExcel = () => {
    const data: ReportData = {
      title: "Worker Shifts Report",
      fromDate: from,
      toDate: to,
      generatedAt: fmtDateTime(new Date()),
      kpis: [
        ["Total shifts (sessions)", filtered.length],
        ["Total hours", Number(totalHours.toFixed(2))],
        ["Workers", perWorker.size],
      ],
      orders: filtered.map((s) => ({
        Date: s.shift_date,
        Worker: s.worker_name ?? "—",
        "Clock in": fmtDateTime(s.clock_in_at),
        "Clock out": s.clock_out_at ? fmtDateTime(s.clock_out_at) : "—",
        Hours: s.total_hours ? Number(Number(s.total_hours).toFixed(2)) : 0,
        Status: s.status,
        Adjusted: s.is_adjusted ? "Yes" : "No",
        Notes: s.admin_notes ?? "",
      })),
      byMethod: Array.from(perWorker.entries()).map(([, v]) => ({
        Worker: v.name,
        Sessions: v.sessions,
        "Total hours": Number(v.hours.toFixed(2)),
      })),
      topServices: [],
    };
    downloadExcelReport(data, `soi-shifts-${from}-to-${to}.xlsx`);
  };

  return (
    <Card className="border-border/60 shadow-soft">
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
        <div>
          <h2 className="font-display text-xl">Worker shifts</h2>
          <p className="text-sm text-muted-foreground">
            {filtered.length} session(s) · {totalHours.toFixed(2)}h total · {perWorker.size} worker(s)
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Worker</Label>
            <select
              value={workerFilter}
              onChange={(e) => setWorkerFilter(e.target.value)}
              className="h-9 w-44 rounded-md border border-border bg-background px-2 text-sm"
            >
              <option value="all">All workers</option>
              {workerOptions.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>
          <Button variant="outline" size="sm" onClick={handleExportExcel}>Export Excel</Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>Print</Button>
        </div>
      </CardHeader>

      <CardContent className="p-0 print-doc">
        <div className="hidden print:block px-4 pt-4">
          <h1 className="font-display text-2xl">SOI Threading & Salon — Worker Shifts</h1>
          <p className="text-sm text-muted-foreground">
            Period: {from} to {to} · Generated: {fmtDateTime(new Date())}
            {workerFilter !== "all" && ` · Worker: ${workerOptions.find(([id]) => id === workerFilter)?.[1]}`}
          </p>
        </div>

        {/* Per-worker totals summary */}
        {perWorker.size > 0 && (
          <div className="border-b border-border p-4">
            <h3 className="mb-2 font-semibold">Totals by worker</h3>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="p-2 text-left">Worker</th>
                  <th className="p-2 text-right">Sessions</th>
                  <th className="p-2 text-right">Total hours</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(perWorker.entries()).map(([id, v]) => (
                  <tr key={id} className="border-t border-border">
                    <td className="p-2 font-medium">{v.name}</td>
                    <td className="p-2 text-right tabular-nums">{v.sessions}</td>
                    <td className="p-2 text-right font-semibold tabular-nums">{v.hours.toFixed(2)}h</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Grouped sessions */}
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Date / Worker</th>
              <th className="p-3 text-left">Clock in</th>
              <th className="p-3 text-left">Clock out</th>
              <th className="p-3 text-right">Hours</th>
              <th className="p-3 text-center">Status</th>
              <th className="p-3 text-right print:hidden">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={`${g.workerId}-${g.date}`}>
                <tr className="border-t-2 border-gold/40 bg-gold/5">
                  <td colSpan={6} className="p-2 px-3 text-xs font-semibold uppercase tracking-wider">
                    {fmtDate(g.date)} · {g.workerName}
                    <span className="ml-2 font-normal text-muted-foreground">
                      ({g.rows.length} session{g.rows.length === 1 ? "" : "s"} · {g.hours.toFixed(2)}h)
                    </span>
                  </td>
                </tr>
                {g.rows.map((s) => (
                  <tr key={s.id} className="border-t border-border">
                    <td className="p-3 pl-6 text-muted-foreground">↳ session</td>
                    <td className="p-3 tabular-nums">{fmtDateTime(s.clock_in_at)}</td>
                    <td className="p-3 tabular-nums">{s.clock_out_at ? fmtDateTime(s.clock_out_at) : "—"}</td>
                    <td className="p-3 text-right font-semibold tabular-nums">
                      {s.total_hours ? Number(s.total_hours).toFixed(2) : "—"}
                    </td>
                    <td className="p-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        s.status === "open" ? "bg-gold/15 text-foreground" : "bg-muted text-muted-foreground"
                      }`}>{s.status}</span>
                      {s.is_adjusted && <span className="ml-1 text-[10px] text-amber-600">(adj)</span>}
                    </td>
                    <td className="p-3 text-right print:hidden">
                      {s.status === "open" && (
                        <Button size="sm" variant="outline" onClick={() => closeOpen.mutate(s)}>Close shift</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
            {groups.length === 0 && (
              <tr><td colSpan={6} className="p-12 text-center text-sm text-muted-foreground">No shifts in this range</td></tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
