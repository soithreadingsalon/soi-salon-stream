import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Clock, LogIn, LogOut } from "lucide-react";
import { toast } from "sonner";

function fmtElapsed(startIso: string) {
  const ms = Date.now() - new Date(startIso).getTime();
  const mins = Math.floor(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ClockWidget() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [tick, setTick] = useState(0);

  const { data: openShift } = useQuery({
    queryKey: ["worker_shifts_open", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("worker_shifts")
        .select("*")
        .eq("worker_id", user!.id)
        .eq("status", "open")
        .order("clock_in_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!openShift) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [openShift]);

  const clockIn = useMutation({
    mutationFn: async () => {
      const fullName =
        user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Worker";
      const { error } = await supabase.from("worker_shifts").insert({
        worker_id: user!.id,
        worker_name: fullName,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Clocked in");
      qc.invalidateQueries({ queryKey: ["worker_shifts_open"] });
      qc.invalidateQueries({ queryKey: ["worker_shifts_admin"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const clockOut = useMutation({
    mutationFn: async () => {
      if (!openShift) return;
      const now = new Date();
      const hours =
        (now.getTime() - new Date(openShift.clock_in_at).getTime()) / 3_600_000;
      const { error } = await supabase
        .from("worker_shifts")
        .update({
          clock_out_at: now.toISOString(),
          total_hours: Number(hours.toFixed(2)),
          status: "closed",
        } as any)
        .eq("id", openShift.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Clocked out");
      qc.invalidateQueries({ queryKey: ["worker_shifts_open"] });
      qc.invalidateQueries({ queryKey: ["worker_shifts_admin"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (!user) return null;
  void tick;

  if (openShift) {
    return (
      <div className="flex items-center gap-2">
        <div className="hidden items-center gap-1.5 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-foreground sm:flex">
          <Clock className="h-3.5 w-3.5 text-gold" />
          <span>On shift · {fmtElapsed(openShift.clock_in_at)}</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => clockOut.mutate()}
          disabled={clockOut.isPending}
        >
          <LogOut className="mr-1 h-3.5 w-3.5" /> Clock out
        </Button>
      </div>
    );
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => clockIn.mutate()}
      disabled={clockIn.isPending}
    >
      <LogIn className="mr-1 h-3.5 w-3.5" /> Clock in
    </Button>
  );
}
