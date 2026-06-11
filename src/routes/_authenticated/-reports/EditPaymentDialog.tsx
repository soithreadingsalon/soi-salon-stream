import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { updatePaymentMethod } from "@/lib/admin-overrides.functions";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n || 0);

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orderId: string | null;
  orderNumber?: string | number;
};

export function EditPaymentDialog({ open, onOpenChange, orderId, orderNumber }: Props) {
  const qc = useQueryClient();
  const update = useServerFn(updatePaymentMethod);
  const [pin, setPin] = useState("");
  const [edits, setEdits] = useState<Record<string, string>>({});

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["edit_payments", orderId],
    enabled: !!orderId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, method, payment_method, created_at")
        .eq("order_id", orderId!)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const m = useMutation({
    mutationFn: async () => {
      const tasks = Object.entries(edits).filter(([, v]) => !!v);
      if (tasks.length === 0) throw new Error("No changes");
      if (!/^\d{4,8}$/.test(pin)) throw new Error("Enter the override PIN");
      for (const [paymentId, newMethod] of tasks) {
        await update({ data: { paymentId, newMethod: newMethod as any, pin } });
      }
    },
    onSuccess: () => {
      toast.success("Payment method updated");
      qc.invalidateQueries({ queryKey: ["reports_payments"] });
      qc.invalidateQueries({ queryKey: ["edit_payments", orderId] });
      setPin(""); setEdits({});
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Update failed"),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setPin(""); setEdits({}); } onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">
            Edit payment {orderNumber ? `· #${orderNumber}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {(payments as any[]).map((p) => {
            const current = (edits[p.id] ?? p.payment_method ?? p.method ?? "cash") as string;
            return (
              <div key={p.id} className="grid grid-cols-[1fr,auto] items-center gap-3 rounded-md border border-border/60 p-3">
                <div>
                  <div className="font-medium">{fmt(Number(p.amount))}</div>
                  <div className="text-xs text-muted-foreground">
                    Currently: <span className="capitalize">{p.payment_method ?? p.method}</span>
                  </div>
                </div>
                <Select value={current} onValueChange={(v) => setEdits((s) => ({ ...s, [p.id]: v }))}>
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="zelle">Zelle</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            );
          })}
          {!isLoading && payments.length === 0 && (
            <p className="text-sm text-muted-foreground">No payments on this order.</p>
          )}
          <div className="space-y-1.5 pt-2">
            <Label className="text-xs">Override PIN</Label>
            <Input
              type="password" inputMode="numeric" pattern="\d*" maxLength={8}
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="Required to confirm"
            />
            <p className="text-[11px] text-muted-foreground">Configure or rotate this PIN in Settings → Security.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
