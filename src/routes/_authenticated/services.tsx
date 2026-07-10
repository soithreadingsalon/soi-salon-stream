import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDeleteDialog } from "@/components/ConfirmDeleteDialog";
import { softDeleteServiceFn, hardDeleteServiceFn, resetServicesToOfficialMenuFn } from "@/lib/admin-recycle.functions";

export const Route = createFileRoute("/_authenticated/services")({
  component: ServicesAdmin,
});

function ServicesAdmin() {
  const qc = useQueryClient();
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<any | null>(null);

  const { data: cats = [] } = useQuery({
    queryKey: ["cats-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_categories").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["services-admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("*").order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const currentCatId = active ?? cats[0]?.id;
  const visible = services.filter((s: any) => s.category_id === currentCatId);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["services-admin"] });
    qc.invalidateQueries({ queryKey: ["services"] });
  };

  const softDel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("soft_delete_service", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Moved to Recycle Bin"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const hardDel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("hard_delete_service", { _id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Service permanently deleted"); invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold">Service catalog</h1>
          <p className="text-sm text-muted-foreground">Edit prices, durations and availability</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={async () => {
            if (!confirm("Reset the entire service catalog to the official SOI menu? This wipes current services. Past orders keep their snapshots.")) return;
            const { error } = await supabase.rpc("reset_services_to_official_menu");
            if (error) return toast.error(error.message);
            toast.success("Service catalog reset to official menu");
            invalidate();
            qc.invalidateQueries({ queryKey: ["cats-admin"] });
            qc.invalidateQueries({ queryKey: ["service_categories"] });
          }}>Reset to Official Menu</Button>
          <Button onClick={() => { setEditing({ category_id: currentCatId, name: "", price: 0, starts_at: false, taxable: false, commission_eligible: true, active: true, duration_minutes: 15, sort_order: visible.length + 1, is_variable_price: false, price_label: null }); setOpen(true); }} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-2 h-4 w-4" /> New service
          </Button>
        </div>
      </div>

      <Tabs value={currentCatId} onValueChange={setActive}>
        <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
          {cats.map((c: any) => (
            <TabsTrigger key={c.id} value={c.id} className="rounded-full data-[state=active]:bg-card data-[state=active]:shadow-soft">
              {c.name}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Card className="border-border/60 shadow-soft">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Service</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3 text-right">Duration</th>
                <th className="p-3 text-center">Active</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((s: any) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="p-3 font-medium">{s.name}</td>
                  <td className="p-3 text-right font-semibold text-gold">{s.starts_at ? `${fmt(s.price)}+` : fmt(s.price)}</td>
                  <td className="p-3 text-right text-muted-foreground">{s.duration_minutes} min</td>
                  <td className="p-3 text-center">{s.active ? "✓" : "—"}</td>
                  <td className="p-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(s); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleting(s)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {editing && <EditDialog open={open} setOpen={setOpen} editing={editing} onSaved={invalidate} />}

      {deleting && (
        <ConfirmDeleteDialog
          open={!!deleting}
          onOpenChange={(b) => !b && setDeleting(null)}
          entityLabel={`service "${deleting.name}"`}
          onSoftDelete={() => softDel.mutateAsync(deleting.id)}
          onHardDelete={() => hardDel.mutateAsync(deleting.id)}
        />
      )}
    </div>
  );
}

function EditDialog({ open, setOpen, editing, onSaved }: { open: boolean; setOpen: (b: boolean) => void; editing: any; onSaved: () => void }) {
  const [s, setS] = useState(editing);
  const upd = (k: string, v: any) => setS({ ...s, [k]: v });

  const mut = useMutation({
    mutationFn: async () => {
      const payload = { ...s, price: Number(s.price), duration_minutes: Number(s.duration_minutes), sort_order: Number(s.sort_order) };
      if (s.id) {
        const { error } = await supabase.from("services").update(payload).eq("id", s.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("services").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Saved"); setOpen(false); onSaved(); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">{s.id ? "Edit service" : "New service"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Name</Label><Input value={s.name} onChange={(e) => upd("name", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Price ($)</Label><Input type="number" step="0.01" value={s.price} onChange={(e) => upd("price", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Duration (min)</Label><Input type="number" value={s.duration_minutes ?? 15} onChange={(e) => upd("duration_minutes", e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label>Sort order</Label><Input type="number" value={s.sort_order} onChange={(e) => upd("sort_order", e.target.value)} /></div>
          <div className="flex items-center justify-between"><Label>Price starts at (e.g. body wax)</Label><Switch checked={s.starts_at} onCheckedChange={(v) => upd("starts_at", v)} /></div>
          <div className="flex items-center justify-between"><Label>Taxable</Label><Switch checked={s.taxable} onCheckedChange={(v) => upd("taxable", v)} /></div>
          <div className="flex items-center justify-between"><Label>Commission eligible</Label><Switch checked={s.commission_eligible} onCheckedChange={(v) => upd("commission_eligible", v)} /></div>
          <div className="flex items-center justify-between"><Label>Active</Label><Switch checked={s.active} onCheckedChange={(v) => upd("active", v)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={!s.name || mut.isPending} onClick={() => mut.mutate()} className="bg-primary text-primary-foreground hover:bg-primary/90">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
