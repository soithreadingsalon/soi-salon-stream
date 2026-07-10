import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SoiLogo } from "@/components/SoiLogo";
import { Loader2, Lock } from "lucide-react";
import { isSiteUnlocked, unlockSite } from "@/lib/gate.functions";

export const Route = createFileRoute("/gate")({
  beforeLoad: async () => {
    const { unlocked } = await isSiteUnlocked();
    if (unlocked) throw redirect({ to: "/login" });
  },
  component: GatePage,
});

function GatePage() {
  const navigate = useNavigate();
  const unlock = useServerFn(unlockSite);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { ok } = await unlock({ data: { password } });
      if (!ok) {
        setError("Incorrect password");
        setPassword("");
        return;
      }
      await navigate({ to: "/login" });
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-cream px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center"><SoiLogo /></div>
        <Card className="border-border/60 shadow-lift">
          <CardHeader className="space-y-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gold/20">
              <Lock className="h-7 w-7 text-gold" />
            </div>
            <h1 className="font-display text-2xl font-semibold">Protected access</h1>
            <p className="text-sm text-muted-foreground">
              Enter the salon access password to continue.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="site-password">Password</Label>
                <Input
                  id="site-password"
                  type="password"
                  autoFocus
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11"
                  autoComplete="current-password"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={busy || password.length === 0}
                className="h-12 w-full bg-primary text-base text-primary-foreground hover:bg-primary/90"
              >
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Unlock
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
