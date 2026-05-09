import { createFileRoute, useNavigate, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SoiLogo } from "@/components/SoiLogo";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const DEV_EMAIL = "test123@soi.local";
const DEV_PASSWORD = "test123";

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  if (!loading && user) return <Navigate to="/dashboard" />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (error) throw error;
        toast.success("Account created. Signing you in…");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message ?? "Authentication failed");
    } finally {
      setBusy(false);
    }
  };

  const seedDev = async () => {
    setBusy(true);
    try {
      // Try to sign in; if user doesn't exist, sign up.
      let { error } = await supabase.auth.signInWithPassword({
        email: DEV_EMAIL,
        password: DEV_PASSWORD,
      });
      if (error) {
        const { error: suErr } = await supabase.auth.signUp({
          email: DEV_EMAIL,
          password: DEV_PASSWORD,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (suErr) throw suErr;
      }
      toast.success("Signed in as dev admin");
      navigate({ to: "/dashboard" });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-cream px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <SoiLogo />
        </div>
        <Card className="border-border/60 shadow-lift">
          <CardHeader className="space-y-1 text-center">
            <h1 className="font-display text-3xl font-semibold">Welcome back</h1>
            <p className="text-sm text-muted-foreground">Sign in to the front desk</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@soithreadingsalon.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy} className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "signin" ? "Sign in" : "Create account"}
              </Button>
              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                {mode === "signin" ? "Need an account? Create one" : "Have an account? Sign in"}
              </button>
            </form>
            <div className="mt-6 rounded-lg border border-dashed border-gold/50 bg-accent/40 p-3">
              <p className="text-[11px] uppercase tracking-wider text-gold">Development only</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Quick-launch a test admin account ({DEV_EMAIL} / {DEV_PASSWORD}).
                <strong className="block mt-1 text-destructive">Change before production.</strong>
              </p>
              <Button onClick={seedDev} variant="outline" size="sm" className="mt-2 w-full border-gold/60">
                Use dev admin
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
