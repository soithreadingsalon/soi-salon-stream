import { createFileRoute, Navigate, Outlet, redirect } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { SoiLogo } from "@/components/SoiLogo";
import { ClockWidget } from "@/components/ClockWidget";
import { isSiteUnlocked } from "@/lib/gate.functions";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { unlocked } = await isSiteUnlocked();
    if (!unlocked) throw redirect({ to: "/gate" });
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-cream">
        <div className="font-display text-xl text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" />;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/85 px-3 backdrop-blur md:px-6">
            <div className="flex items-center gap-2">
              <SidebarTrigger />
              <div className="md:hidden">
                <SoiLogo />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden text-xs uppercase tracking-[0.18em] text-muted-foreground lg:block">
                180 Hamburg Turnpk · Wayne, NJ · 551-301-3894
              </div>
              <ClockWidget />
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
