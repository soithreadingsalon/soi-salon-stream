import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

const makeFmt = (currency: string) => (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD" }).format(n);

// 58mm thermal printers fit ~32 monospace chars per line at this size.
const LINE_CHARS = 32;
const padLine = (left: string, right: string) => {
  const space = Math.max(1, LINE_CHARS - left.length - right.length);
  return left + " ".repeat(space) + right;
};
const centerLine = (s: string) => {
  if (s.length >= LINE_CHARS) return s.slice(0, LINE_CHARS);
  const pad = Math.floor((LINE_CHARS - s.length) / 2);
  return " ".repeat(pad) + s;
};

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
      let cashier_name: string | null = null;
      let customer_name: string | null = null;
      if (order?.cashier_id) {
        const { data: c } = await supabase.from("profiles")
          .select("full_name,email").eq("id", order.cashier_id).maybeSingle();
        cashier_name = c?.full_name ?? c?.email ?? null;
      }
      if (order?.customer_id) {
        const { data: cu } = await supabase.from("customers")
          .select("full_name").eq("id", order.customer_id).maybeSingle();
        customer_name = cu?.full_name ?? null;
      }
      return { order, items: items ?? [], payments: payments ?? [], cashier_name, customer_name };
    },
  });

  if (!orderId) return null;

  return (
    <Dialog open={!!orderId} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-center font-display text-xl">Receipt</DialogTitle>
        </DialogHeader>
        <div id="receipt-print" className="receipt-58mm space-y-1 rounded-md border border-border bg-white p-3 text-black">
          <div className="text-center">
            <div className="receipt-bus-name">{settings?.business_name}</div>
            {settings?.address && <div>{settings.address}</div>}
            {settings?.phone && <div>{settings.phone}</div>}
            {settings?.website && <div>{settings.website}</div>}
          </div>

          <div className="receipt-sep">{"-".repeat(LINE_CHARS)}</div>

          {data?.order && (
            <>
              <div>{padLine(`Order #${data.order.order_number}`, new Date(data.order.completed_at ?? data.order.created_at).toLocaleDateString())}</div>
              <div>{padLine("", new Date(data.order.completed_at ?? data.order.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))}</div>
              {data.cashier_name && <div>Served by: {data.cashier_name}</div>}
              {data.customer_name && <div>Customer: {data.customer_name}</div>}
            </>
          )}

          <div className="receipt-sep">{"-".repeat(LINE_CHARS)}</div>

          <div>
            {data?.items.map((i) => {
              const line = `${i.quantity}x ${i.service_name}`;
              const price = fmt(Number(i.unit_price) * i.quantity);
              // wrap long item names
              if (line.length + price.length + 1 > LINE_CHARS) {
                return (
                  <div key={i.id}>
                    <div>{line}</div>
                    <div>{padLine("", price)}</div>
                  </div>
                );
              }
              return <div key={i.id}>{padLine(line, price)}</div>;
            })}
          </div>

          <div className="receipt-sep">{"-".repeat(LINE_CHARS)}</div>

          {data?.order && (
            <div>
              <div>{padLine("Subtotal", fmt(Number(data.order.subtotal)))}</div>
              {Number(data.order.discount_total) > 0 && (
                <div>{padLine("Discount", `-${fmt(Number(data.order.discount_total))}`)}</div>
              )}
              <div>{padLine("Tax", fmt(Number(data.order.tax_total)))}</div>
              {Number(data.order.tip_total) > 0 && (
                <div>{padLine("Tip", fmt(Number(data.order.tip_total)))}</div>
              )}
              <div className="receipt-total">{padLine("TOTAL", fmt(Number(data.order.total)))}</div>
            </div>
          )}

          <div className="receipt-sep">{"-".repeat(LINE_CHARS)}</div>

          {data?.payments.map((p) => (
            <div key={p.id}>
              {padLine(
                `${p.method.toUpperCase()}${p.card_last4 ? ` ${p.card_last4}` : ""}${p.external_reference ? ` (${p.external_reference})` : ""}`,
                fmt(Number(p.amount)),
              )}
            </div>
          ))}

          <div className="receipt-sep">{"-".repeat(LINE_CHARS)}</div>

          {settings?.receipt_footer && (
            <div className="text-center receipt-footer">{settings.receipt_footer}</div>
          )}
          <div className="text-center">{centerLine("Thank you!")}</div>
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
