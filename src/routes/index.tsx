import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-cream">
        <div className="font-display text-xl text-muted-foreground">Loading…</div>
      </div>
    );
  }
  return user ? <Navigate to="/dashboard" /> : <Navigate to="/login" />;
}
