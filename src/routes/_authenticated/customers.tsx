import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/customers")({
  component: CustomersPage,
});

function CustomersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["customers", q],
    queryFn: async () => {
      let query = supabase
        .from("customers")
        .select("id,full_name,phone,email,total_spend,visit_count,last_visit_at")
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

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Customers</h1>
          <p className="text-sm text-muted-foreground">{data.length} on record</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
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
              <tr><th className="p-3 text-left">Name</th><th className="p-3 text-left">Phone</th><th className="p-3 text-left">Email</th><th className="p-3 text-right">Visits</th><th className="p-3 text-right">Total Spend</th></tr>
            </thead>
            <tbody>
              {data.map((c: any) => (
                <tr key={c.id} className="border-t border-border hover:bg-accent/20">
                  <td className="p-3 font-medium">{c.full_name}</td>
                  <td className="p-3 text-muted-foreground">{c.phone}</td>
                  <td className="p-3 text-muted-foreground">{c.email}</td>
                  <td className="p-3 text-right">{c.visit_count}</td>
                  <td className="p-3 text-right font-semibold text-gold">{fmt(Number(c.total_spend))}</td>
                </tr>
              ))}
              {data.length === 0 && (
                <tr><td colSpan={5} className="p-12 text-center text-sm text-muted-foreground">No customers yet</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <NewCustomer open={open} setOpen={setOpen} userId={user!.id} onCreated={() => qc.invalidateQueries({ queryKey: ["customers"] })} />
    </div>
  );
}

function NewCustomer({ open, setOpen, userId, onCreated }: { open: boolean; setOpen: (b: boolean) => void; userId: string; onCreated: () => void }) {
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("customers").insert({ full_name, phone, email, notes, created_by: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Customer added");
      setOpen(false); setName(""); setPhone(""); setEmail(""); setNotes("");
      onCreated();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">New customer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name *</Label><Input autoFocus value={full_name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Notes</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!full_name || mut.isPending} onClick={() => mut.mutate()} className="bg-primary text-primary-foreground hover:bg-primary/90">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
