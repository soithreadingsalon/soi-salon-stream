import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "./use-auth";

export type PermissionKey =
  | "pos.use"
  | "pos.refund"
  | "giftcards.sell"
  | "services.edit"
  | "categories.edit"
  | "customers.view"
  | "customers.edit"
  | "customers.delete"
  | "memberships.view"
  | "memberships.manage"
  | "reports.view"
  | "reports.full"
  | "reports.today_only"
  | "reports.export"
  | "shifts.view"
  | "shifts.edit"
  | "appointments.view_all"
  | "appointments.assign"
  | "appointments.checkin"
  | "appointments.cancel";

// Safety-net defaults so a signed-in worker never sees an empty sidebar
// if role_permissions hasn't loaded yet, returns [], or errors.
// DB rows still take precedence when they exist.
const ROLE_FALLBACK: Record<AppRole, PermissionKey[]> = {
  super_admin: [],
  admin: [],
  manager: [
    "pos.use", "pos.refund", "giftcards.sell",
    "services.edit", "categories.edit",
    "customers.view", "customers.edit",
    "memberships.view", "memberships.manage",
    "reports.view", "reports.full", "reports.export",
    "shifts.view", "shifts.edit",
    "appointments.view_all", "appointments.assign",
    "appointments.checkin", "appointments.cancel",
  ],
  cashier: [
    "pos.use", "giftcards.sell",
    "customers.view",
    "memberships.view",
    "reports.today_only",
    "appointments.view_all", "appointments.checkin",
  ],
  staff: [
    "pos.use",
    "customers.view",
    "appointments.checkin",
  ],
};

export function usePermissions() {
  const { roles, hasRole } = useAuth();
  const isAdmin = hasRole("super_admin", "admin");

  const { data: rows = [], isLoading, isError } = useQuery({
    queryKey: ["role_permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role, permission_key, allowed");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const useFallback = isLoading || isError || rows.length === 0;

  const can = (key: PermissionKey): boolean => {
    if (isAdmin) return true;
    if (
      rows.some(
        (r: any) =>
          r.allowed === true &&
          r.permission_key === key &&
          roles.includes(r.role),
      )
    ) {
      return true;
    }
    if (useFallback) {
      return roles.some((r) => (ROLE_FALLBACK[r] ?? []).includes(key));
    }
    return false;
  };

  return { can, isAdmin, isLoading, isError };
}
