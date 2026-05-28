import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./use-auth";

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
  | "reports.export"
  | "shifts.view"
  | "shifts.edit";

export function usePermissions() {
  const { roles, hasRole } = useAuth();
  const isAdmin = hasRole("super_admin", "admin");

  const { data: rows = [] } = useQuery({
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

  const can = (key: PermissionKey): boolean => {
    if (isAdmin) return true;
    return rows.some(
      (r: any) =>
        r.allowed === true &&
        r.permission_key === key &&
        roles.includes(r.role),
    );
  };

  return { can, isAdmin };
}
