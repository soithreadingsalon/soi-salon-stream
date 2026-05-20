import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/memberships")({
  component: MembershipsAdmin,
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n) || 0);

function MembershipsAdmin() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: rows = [] } = useQuery({
    queryKey: ["memberships"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("memberships")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Memberships</h1>
          <p className="text-sm text-muted-foreground">Sell and track salon memberships</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-2 h-4 w-4" /> New membership
        </Button>
      </div>

      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Customer</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3 text-left">Start</th>
                <th className="p-3 text-left">Expires</th>
                <th className="p-3 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No memberships sold yet.</td></tr>
              )}
              {rows.map((m: any) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="p-3 font-medium">{m.customer_name}</td>
                  <td className="p-3">{m.membership_type}</td>
                  <td className="p-3 text-right font-semibold text-gold">{fmt(m.price)}</td>
                  <td className="p-3 text-muted-foreground">{m.start_date}</td>
                  <td className="p-3 text-muted-foreground">{m.expiration_date ?? "—"}</td>
                  <td className="p-3"><span className="rounded-full bg-muted px-2 py-0.5 text-xs">{m.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <NewMembershipDialog open={open} setOpen={setOpen} onSaved={() => qc.invalidateQueries({ queryKey: ["memberships"] })} />
    </div>
  );
}

function NewMembershipDialog({ open, setOpen, onSaved }: { open: boolean; setOpen: (b: boolean) => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    customer_name: "",
    membership_type: "",
    price: "",
    start_date: today,
    expiration_date: "",
    status: "active",
  });
  const upd = (k: string, v: any) => setForm({ ...form, [k]: v });

  const mut = useMutation({
    mutationFn: async () => {
      const payload: any = {
        customer_name: form.customer_name.trim(),
        membership_type: form.membership_type.trim(),
        price: Number(form.price),
        start_date: form.start_date,
        expiration_date: form.expiration_date || null,
        status: form.status,
      };
      const { error } = await (supabase as any).from("memberships").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Membership saved");
      setOpen(false);
      onSaved();
      setForm({ customer_name: "", membership_type: "", price: "", start_date: today, expiration_date: "", status: "active" });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const valid = form.customer_name && form.membership_type && Number(form.price) > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">New membership</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Customer name</Label><Input value={form.customer_name} onChange={(e) => upd("customer_name", e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Membership type</Label><Input placeholder="e.g. Monthly Eyebrow, VIP Annual" value={form.membership_type} onChange={(e) => upd("membership_type", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Price ($)</Label><Input type="number" step="0.01" value={form.price} onChange={(e) => upd("price", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Status</Label><Input value={form.status} onChange={(e) => upd("status", e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Start date</Label><Input type="date" value={form.start_date} onChange={(e) => upd("start_date", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Expiration (optional)</Label><Input type="date" value={form.expiration_date} onChange={(e) => upd("expiration_date", e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!valid || mut.isPending} onClick={() => mut.mutate()} className="bg-primary text-primary-foreground hover:bg-primary/90">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
