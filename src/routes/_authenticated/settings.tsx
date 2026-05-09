import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/settings")({
  component: Settings,
});

function Settings() {
  const { data } = useQuery({
    queryKey: ["business_settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("business_settings").select("*").limit(1).single();
      if (error) throw error;
      return data;
    },
  });

  if (!data) return <div className="p-8">Loading…</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="font-display text-3xl font-semibold">Business Settings</h1>
        <p className="text-sm text-muted-foreground">Editable business profile (full edit form coming next iteration)</p>
      </div>
      <Card className="border-border/60 shadow-soft">
        <CardHeader><h2 className="font-display text-xl">{data.business_name}</h2></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row k="Address" v={data.address} />
          <Row k="Phone" v={data.phone} />
          <Row k="Email" v={data.email} />
          <Row k="Website" v={data.website} />
          <Row k="Instagram" v={data.instagram} />
          <Row k="Tax rate" v={`${(Number(data.tax_rate) * 100).toFixed(3)}%`} />
          <Row k="Tip presets" v={data.tip_presets.join("%, ") + "%"} />
          <Row k="Currency" v={data.currency} />
          <Row k="Timezone" v={data.timezone} />
        </CardContent>
      </Card>
      <Card className="border-gold/40 bg-accent/30 shadow-soft">
        <CardContent className="space-y-2 p-5 text-sm">
          <div className="font-display text-lg">Coming next</div>
          <ul className="list-inside list-disc text-muted-foreground">
            <li>Full editable settings form (logo, hours, receipt footer, refund policy)</li>
            <li>Appointments + walk-in queue</li>
            <li>Loyalty (10th eyebrow free), coupons, memberships, gift cards</li>
            <li>Cash drawer, daily closeout, refunds</li>
            <li>Reports + CSV/PDF export</li>
            <li>Stripe Terminal in production</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return (
    <div className="flex justify-between border-b border-border/50 py-2 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v ?? "—"}</span>
    </div>
  );
}
