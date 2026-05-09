import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export function ReceiptDialog({
  orderId,
  onClose,
  settings,
}: {
  orderId: string | null;
  onClose: () => void;
  settings: any;
}) {
  const { data } = useQuery({
    queryKey: ["receipt", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const [{ data: order }, { data: items }, { data: payments }] = await Promise.all([
        supabase.from("orders").select("*").eq("id", orderId!).single(),
        supabase.from("order_items").select("*").eq("order_id", orderId!),
        supabase.from("payments").select("*").eq("order_id", orderId!),
      ]);
      return { order, items: items ?? [], payments: payments ?? [] };
    },
  });

  if (!orderId) return null;

  return (
    <Dialog open={!!orderId} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center font-display text-xl">Receipt</DialogTitle>
        </DialogHeader>
        <div id="receipt-print" className="space-y-3 rounded-md border border-border bg-cream p-5 font-mono text-xs">
          <div className="text-center">
            <div className="font-display text-lg font-semibold">{settings?.business_name}</div>
            <div className="text-[10px]">{settings?.address}</div>
            <div className="text-[10px]">{settings?.phone} · {settings?.website}</div>
          </div>
          <hr className="border-dashed border-border" />
          <div className="space-y-1">
            {data?.items.map((i) => (
              <div key={i.id} className="flex justify-between">
                <span>{i.quantity}× {i.service_name}</span>
                <span>{fmt(Number(i.unit_price) * i.quantity)}</span>
              </div>
            ))}
          </div>
          <hr className="border-dashed border-border" />
          {data?.order && (
            <div className="space-y-0.5">
              <RowR l="Subtotal" v={fmt(Number(data.order.subtotal))} />
              {Number(data.order.discount_total) > 0 && <RowR l="Discount" v={`-${fmt(Number(data.order.discount_total))}`} />}
              <RowR l="Tax" v={fmt(Number(data.order.tax_total))} />
              {Number(data.order.tip_total) > 0 && <RowR l="Tip" v={fmt(Number(data.order.tip_total))} />}
              <div className="mt-1 flex justify-between font-semibold">
                <span>TOTAL</span><span>{fmt(Number(data.order.total))}</span>
              </div>
            </div>
          )}
          <hr className="border-dashed border-border" />
          {data?.payments.map((p) => (
            <div key={p.id} className="flex justify-between">
              <span>{p.method.toUpperCase()}{p.card_last4 ? ` •••• ${p.card_last4}` : ""}</span>
              <span>{fmt(Number(p.amount))}</span>
            </div>
          ))}
          {data?.order && (
            <div className="text-center text-[9px] text-muted-foreground">
              Order #{data.order.order_number} · {new Date(data.order.completed_at!).toLocaleString()}
            </div>
          )}
          <div className="text-center text-[10px] italic">{settings?.receipt_footer}</div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print
          </Button>
          <Button onClick={onClose} className="bg-primary text-primary-foreground hover:bg-primary/90">
            New Sale
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowR({ l, v }: { l: string; v: string }) {
  return <div className="flex justify-between"><span>{l}</span><span>{v}</span></div>;
}
