import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Pencil, Plus, Search, Trash2, Upload } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { listCustomersForExport } from "@/lib/customers.functions";
import { softDeleteCustomerFn, hardDeleteCustomerFn } from "@/lib/admin-recycle.functions";
import { ImportWebsiteDialog } from "@/components/ImportWebsiteDialog";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

function toCsv(rows: any[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: any) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

function CustomersPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("super_admin", "admin");
  const canExport = hasRole("super_admin", "admin", "manager");
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const exportFn = useServerFn(listCustomersForExport);

  const { data = [] } = useQuery({
    queryKey: ["customers", q],
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select("id,full_name,phone,email,birthday,notes,allergies,marketing_opt_in,preferred_service_category_id,preferred_service_name,total_spend,visit_count,last_visit_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (q.length >= 2) {
        query = query.or(`full_name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  const softDel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("soft_delete_customer", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Moved to Recycle Bin"); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const hardDel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("hard_delete_customer", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Customer permanently deleted"); qc.invalidateQueries({ queryKey: ["customers"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = await exportFn({ data: { search: q } });
      if (!rows || rows.length === 0) {
        toast.info("No customers to export");
        return;
      }
      const exportRows = rows.map((r: any) => ({
        full_name: r.full_name,
        phone: r.phone,
        email: r.email,
        birthday: r.birthday,
        marketing_opt_in: r.marketing_opt_in,
        preferred_service_category: r.preferred_service_category,
        preferred_service_name: r.preferred_service_name,
        visit_count: r.visit_count,
        total_spend: r.total_spend,
        last_visit_at: r.last_visit_at,
        notes: r.notes,
        created_at: r.created_at,
      }));
      const csv = toCsv(exportRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${exportRows.length} customer(s)`);
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">{data.length} on record</p>
        </div>
        <div className="flex gap-2">
          {canExport && (
            <>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Import from Website
              </Button>
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                <Download className="mr-2 h-4 w-4" /> {exporting ? "Exporting…" : "Export CSV"}
              </Button>
            </>
          )}
          <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" /> New customer
          </Button>
        </div>
      </div>

      <Card className="border-border/60 shadow-soft">
        <CardHeader className="border-b border-border">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone, email" className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Phone</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-left">Preferred Service</th>
                <th className="p-3 text-right">Visits</th>
                <th className="p-3 text-right">Total Spend</th>
                {isAdmin && <th className="p-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((c: any) => (
                <tr key={c.id} className="border-t border-border hover:bg-accent/20">
                  <td className="p-3 font-medium">
                    <Link to="/customers/$customerId" params={{ customerId: c.id }} className="hover:text-gold">{c.full_name}</Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{c.phone}</td>
                  <td className="p-3 text-muted-foreground">{c.email}</td>
                  <td className="p-3 text-muted-foreground">{c.preferred_service_name ?? "—"}</td>
                  <td className="p-3 text-right">{c.visit_count}</td>
                  <td className="p-3 text-right font-semibold text-gold">{fmt(Number(c.total_spend))}</td>
                  {isAdmin && (
                    <td className="p-3 text-right space-x-1 whitespace-nowrap">
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleting(c)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={isAdmin ? 7 : 6} className="p-12 text-center text-sm text-muted-foreground">No customers yet</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <CustomerDialog
        open={open}
        setOpen={setOpen}
        editing={editing}
        userId={user!.id}
        onSaved={() => qc.invalidateQueries({ queryKey: ["customers"] })}
      />

      <ImportWebsiteDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onDone={() => qc.invalidateQueries({ queryKey: ["customers"] })}
      />

      {deleting && (
        <ConfirmDeleteDialog
          open={!!deleting}
          onOpenChange={(b) => !b && setDeleting(null)}
          entityLabel={`customer ${deleting.full_name}`}
          onSoftDelete={() => softDel.mutateAsync(deleting.id)}
          onHardDelete={() => hardDel.mutateAsync(deleting.id)}
        />
      )}
    </div>
  );
}

function CustomerDialog({
  open, setOpen, editing, userId, onSaved,
}: { open: boolean; setOpen: (b: boolean) => void; editing: any | null; userId: string; onSaved: () => void }) {
  const isEdit = !!editing?.id;
  const [full_name, setName] = useState(editing?.full_name ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [categoryId, setCategoryId] = useState<string>(editing?.preferred_service_category_id ?? "__none__");
  const [serviceName, setServiceName] = useState(editing?.preferred_service_name ?? "");
  const [birthday, setBirthday] = useState(editing?.birthday ?? "");
  const [allergies, setAllergies] = useState(editing?.allergies ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [marketing, setMarketing] = useState(editing?.marketing_opt_in ?? true);

  const { data: categories = [] } = useQuery({
    queryKey: ["service_categories_active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_categories")
        .select("id, name")
        .eq("active", true)
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        full_name,
        phone,
        email,
        birthday: birthday || null,
        allergies,
        notes,
        marketing_opt_in: marketing,
        preferred_service_category_id: categoryId !== "__none__" ? categoryId : null,
        preferred_service_name: serviceName || null,
      };
      if (isEdit) {
        const { error } = await supabase.from("customers").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        payload.created_by = userId;
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Customer updated" : "Customer added");
      setOpen(false); onSaved();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog
      key={editing?.id ?? "new"}
      open={open}
      onOpenChange={(b) => {
        setOpen(b);
        if (!b) {
          setName(""); setPhone(""); setEmail(""); setBirthday(""); setAllergies(""); setNotes("");
          setMarketing(true); setCategoryId("__none__"); setServiceName("");
        }
      }}
    >
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">{isEdit ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Full Name *</Label><Input autoFocus value={full_name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Phone Number *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Service Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Service</Label><Input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="e.g. Eyebrow threading" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Birthday</Label><Input type="date" value={birthday ?? ""} onChange={(e) => setBirthday(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Allergies</Label><Input value={allergies} onChange={(e) => setAllergies(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything we should know?" /></div>
          <div className="flex items-center justify-between"><Label>Marketing opt-in</Label><Switch checked={marketing} onCheckedChange={setMarketing} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!full_name || !phone || mut.isPending} onClick={() => mut.mutate()} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
