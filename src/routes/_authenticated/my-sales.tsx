import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/my-sales")({
  component: MySalesPage,
});

type Order = {
  id: string;
  order_number: number;
  total: number;
  status: string;
  completed_at: string | null;
  created_at: string;
};

function MySalesPage() {
  const { user } = useAuth();
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["my_sales", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, order_number, total, status, completed_at, created_at")
        .eq("cashier_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Order[];
    },
  });

  const completed = orders.filter((o) => o.status === "completed");
  const totalRevenue = completed.reduce((s, o) => s + Number(o.total), 0);

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">My Sales</h1>
        <p className="text-sm text-muted-foreground">Services you have rung up</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><p className="text-xs uppercase tracking-wider text-muted-foreground">Completed orders</p></CardHeader>
          <CardContent><p className="font-display text-3xl">{completed.length}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><p className="text-xs uppercase tracking-wider text-muted-foreground">Revenue</p></CardHeader>
          <CardContent><p className="font-display text-3xl">${totalRevenue.toFixed(2)}</p></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><h2 className="font-display text-xl">Recent</h2></CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No sales yet.</div>
          ) : (
            <div className="divide-y">
              {orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium">#{o.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(o.completed_at ?? o.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg">${Number(o.total).toFixed(2)}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{o.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
