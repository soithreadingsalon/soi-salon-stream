import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingBag,
  Users,
  Sparkles,
  Settings,
  LogOut,
  History,
  IdCard,
  BarChart3,
  CalendarClock,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SoiLogo } from "./SoiLogo";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions, type PermissionKey } from "@/hooks/use-permissions";
import { Button } from "./ui/button";

type NavItem = {
  title: string;
  url: string;
  icon: typeof LayoutDashboard;
  // Show if user has ANY of these permissions (admin always sees all)
  permissions?: PermissionKey[];
  // Or admin-only when no permissions are listed
  adminOnly?: boolean;
};

const items: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, permissions: ["reports.view"] },
  { title: "POS Checkout", url: "/pos", icon: ShoppingBag, permissions: ["pos.use"] },
  { title: "My Sales", url: "/my-sales", icon: History, permissions: ["pos.use"] },
  { title: "Customers", url: "/customers", icon: Users, permissions: ["customers.view"] },
  { title: "Services", url: "/services", icon: Sparkles, permissions: ["services.edit"] },
  { title: "Memberships", url: "/memberships", icon: IdCard, permissions: ["memberships.view", "memberships.manage"] },
  { title: "Appointments", url: "/appointments", icon: CalendarClock, permissions: ["appointments.view_all", "appointments.checkin"] },
  { title: "Reports", url: "/reports", icon: BarChart3, permissions: ["reports.view", "reports.full", "reports.today_only"] },
  { title: "Settings", url: "/settings", icon: Settings, adminOnly: true },
];

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { signOut, user, roles, hasRole } = useAuth();
  const { can, isAdmin } = usePermissions();

  const visible = items.filter((it) => {
    if (it.adminOnly) return hasRole("super_admin", "admin");
    if (isAdmin) return true;
    return (it.permissions ?? []).some((p) => can(p));
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border bg-sidebar p-4">
        <SoiLogo />
      </SidebarHeader>
      <SidebarContent className="bg-sidebar">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Front Desk
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visible.map((it) => {
                const active = path === it.url || path.startsWith(it.url + "/");
                return (
                  <SidebarMenuItem key={it.url}>
                    <SidebarMenuButton asChild isActive={active}>
                      <Link to={it.url} className="flex items-center gap-3">
                        <it.icon className="h-4 w-4" />
                        <span>{it.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border bg-sidebar p-3">
        <div className="mb-2 px-2">
          <p className="truncate text-xs font-medium text-foreground">{user?.email}</p>
          <p className="text-[10px] uppercase tracking-wider text-gold">{roles[0] ?? "user"}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut} className="justify-start gap-2">
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
