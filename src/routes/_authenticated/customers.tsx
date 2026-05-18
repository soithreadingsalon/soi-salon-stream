import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("super_admin", "admin");
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const { data = [] } = useQuery({
    queryKey: ["customers", q],
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select("id,full_name,phone,email,birthday,notes,allergies,marketing_opt_in,total_spend,visit_count,last_visit_at")
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">{data.length} on record</p>
        </div>
        <Button onClick={() => { setEditing(null); setOpen(true); }} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" /> New customer
        </Button>
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
                <tr><td colSpan={isAdmin ? 6 : 5} className="p-12 text-center text-sm text-muted-foreground">No customers yet</td></tr>
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
  const [birthday, setBirthday] = useState(editing?.birthday ?? "");
  const [allergies, setAllergies] = useState(editing?.allergies ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [marketing, setMarketing] = useState(!!editing?.marketing_opt_in);


  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = { full_name, phone, email, birthday: birthday || null, allergies, notes, marketing_opt_in: marketing };
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
          setName(""); setPhone(""); setEmail(""); setBirthday(""); setAllergies(""); setNotes(""); setMarketing(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">{isEdit ? "Edit customer" : "New customer"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name *</Label><Input autoFocus value={full_name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Birthday</Label><Input type="date" value={birthday ?? ""} onChange={(e) => setBirthday(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Allergies</Label><Input value={allergies} onChange={(e) => setAllergies(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div className="flex items-center justify-between"><Label>Marketing opt-in</Label><Switch checked={marketing} onCheckedChange={setMarketing} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!full_name || mut.isPending} onClick={() => mut.mutate()} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {mut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
