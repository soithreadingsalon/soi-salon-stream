import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SoiLogo } from "@/components/SoiLogo";
import { toast } from "sonner";
import { Loader2, User, ArrowLeft, Delete } from "lucide-react";
import { signInWithPin } from "@/lib/worker-auth.functions";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

type Worker = { id: string; display_name: string; active: boolean };

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<"workers" | "pin" | "admin">("workers");
  const [picked, setPicked] = useState<Worker | null>(null);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);

  const callSignIn = useServerFn(signInWithPin);

  const { data: workers = [], isLoading } = useQuery({
    queryKey: ["workers_public"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("workers_public")
        .select("id,display_name,active")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as Worker[];
    },
  });

  if (!loading && user) return <Navigate to="/dashboard" />;

  useEffect(() => {
    if (pin.length !== 4 || !picked || busy) return;
    (async () => {
      setBusy(true);
      try {
        const { email, token_hash } = await callSignIn({ data: { workerId: picked.id, pin } });
        const { error } = await supabase.auth.verifyOtp({
          type: "magiclink", token_hash, email,
        } as any);
        if (error) throw error;
        toast.success(`Welcome, ${picked.display_name}`);
        navigate({ to: "/pos" });
      } catch (e: any) {
        toast.error(e?.message ?? "Invalid PIN");
        setPin("");
      } finally { setBusy(false); }
    })();
  }, [pin, picked, busy, callSignIn, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-cream px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center"><SoiLogo /></div>

        {view === "workers" && (
          <Card className="border-border/60 shadow-lift">
            <CardHeader className="text-center space-y-1">
              <h1 className="font-display text-3xl font-semibold">Who's on shift?</h1>
              <p className="text-sm text-muted-foreground">Tap your name to sign in</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
              ) : workers.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No workers configured yet. Use the admin login below to set them up.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {workers.map((w) => (
                    <button key={w.id} onClick={() => { setPicked(w); setPin(""); setView("pin"); }}
                      className="flex items-center gap-3 rounded-xl border-2 border-border bg-card p-4 text-left transition hover:border-gold hover:shadow-soft active:scale-[0.98]">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/20 text-gold">
                        <User className="h-6 w-6" />
                      </div>
                      <div className="font-display text-xl">{w.display_name}</div>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => setView("admin")}
                className="block w-full pt-2 text-center text-xs text-muted-foreground hover:text-foreground underline">
                Admin / owner sign-in →
              </button>
            </CardContent>
          </Card>
        )}

        {view === "pin" && picked && (
          <Card className="border-border/60 shadow-lift">
            <CardHeader className="text-center space-y-1">
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-gold/20">
                <User className="h-7 w-7 text-gold" />
              </div>
              <h1 className="font-display text-2xl">Hi, {picked.display_name}</h1>
              <p className="text-sm text-muted-foreground">Enter your 4-digit PIN</p>
            </CardHeader>
            <CardContent>
              <div className="mx-auto mb-5 flex justify-center gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`h-14 w-12 rounded-lg border-2 flex items-center justify-center font-display text-3xl ${
                    pin.length > i ? "border-gold bg-gold/10" : "border-border bg-card"
                  }`}>{pin[i] ? "•" : ""}</div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["1","2","3","4","5","6","7","8","9"].map((d) => (
                  <button key={d} disabled={busy}
                    onClick={() => setPin((p) => (p.length < 4 ? p + d : p))}
                    className="h-16 rounded-xl border-2 border-border bg-card font-display text-2xl active:scale-95 hover:border-gold disabled:opacity-50">
                    {d}
                  </button>
                ))}
                <button onClick={() => { setView("workers"); setPicked(null); setPin(""); }}
                  className="h-16 rounded-xl border-2 border-border bg-card text-sm font-medium active:scale-95 hover:border-gold">
                  <ArrowLeft className="mx-auto h-5 w-5" />
                </button>
                <button disabled={busy} onClick={() => setPin((p) => (p.length < 4 ? p + "0" : p))}
                  className="h-16 rounded-xl border-2 border-border bg-card font-display text-2xl active:scale-95 hover:border-gold disabled:opacity-50">
                  0
                </button>
                <button disabled={busy} onClick={() => setPin((p) => p.slice(0, -1))}
                  className="h-16 rounded-xl border-2 border-border bg-card active:scale-95 hover:border-gold disabled:opacity-50">
                  <Delete className="mx-auto h-5 w-5" />
                </button>
              </div>
              {busy && <p className="mt-4 text-center text-sm text-muted-foreground">Signing in…</p>}
            </CardContent>
          </Card>
        )}

        {view === "admin" && <AdminLogin onBack={() => setView("workers")} navigate={navigate} />}
      </div>
    </div>
  );
}

function AdminLogin({ onBack, navigate }: { onBack: () => void; navigate: ReturnType<typeof useNavigate> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Allow either plain username (e.g. "SOI") or full email
      const email = username.includes("@") ? username.trim() : `${username.trim().toLowerCase()}@soi.local`;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Sign in failed");
    } finally { setBusy(false); }
  };
  return (
    <Card className="border-border/60 shadow-lift">
      <CardHeader className="space-y-1 text-center">
        <h1 className="font-display text-2xl font-semibold">Admin sign-in</h1>
        <p className="text-sm text-muted-foreground">Owner & manager access</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)} className="h-11" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" required minLength={6} value={password}
              onChange={(e) => setPassword(e.target.value)} className="h-11" />
          </div>
          <Button type="submit" disabled={busy}
            className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary/90">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign in
          </Button>
          <button type="button" onClick={onBack}
            className="block w-full text-center text-xs text-muted-foreground hover:text-foreground underline">
            ← Back to worker sign-in
          </button>
        </form>
      </CardContent>
    </Card>
  );
}
