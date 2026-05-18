import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Plus, KeyRound, UserX, ExternalLink, Undo2, Trash2 } from "lucide-react";
import { upsertWorkerPin, deactivateWorker } from "@/lib/worker-auth.functions";

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
      </div>
      <Tabs defaultValue="business">
        <TabsList className="bg-muted/40">
          <TabsTrigger value="business">Business</TabsTrigger>
          <TabsTrigger value="workers">Workers & PINs</TabsTrigger>
          <TabsTrigger value="catalog">Services</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>

        <TabsContent value="business" className="pt-6"><BusinessTab /></TabsContent>
        <TabsContent value="workers"  className="pt-6"><WorkersTab /></TabsContent>
        <TabsContent value="catalog"  className="pt-6"><QuickLink to="/services" label="Open service catalog editor" /></TabsContent>
        <TabsContent value="customers" className="pt-6"><QuickLink to="/customers" label="Open customer directory" /></TabsContent>
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
