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
import { Button } from "./ui/button";

const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: ["super_admin", "admin", "manager"] },
  { title: "POS Checkout", url: "/pos", icon: ShoppingBag, roles: ["super_admin", "admin", "manager", "cashier"] },
  { title: "My Sales", url: "/my-sales", icon: History, roles: ["cashier"] },
  { title: "Customers", url: "/customers", icon: Users, roles: ["super_admin", "admin", "manager"] },
  { title: "Services", url: "/services", icon: Sparkles, roles: ["super_admin", "admin"] },
  { title: "Memberships", url: "/memberships", icon: IdCard, roles: ["super_admin", "admin", "manager"] },
  { title: "Settings", url: "/settings", icon: Settings, roles: ["super_admin", "admin"] },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { hasRole, signOut, user, roles } = useAuth();

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
              {items
                .filter((it) => hasRole(...(it.roles as any)))
                .map((it) => {
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
