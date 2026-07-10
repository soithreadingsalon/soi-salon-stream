import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireAdmin(ctx: any) {
  const { data: rows } = await ctx.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", ctx.userId);
  const roles = (rows ?? []).map((r: any) => r.role);
  if (!roles.some((r: string) => r === "super_admin" || r === "admin")) {
    throw new Error("Not authorized");
  }
}

const idInput = (d: unknown) => z.object({ id: z.string().uuid() }).parse(d);

export const softDeleteCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("soft_delete_customer" as any, { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const hardDeleteCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("hard_delete_customer" as any, { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("restore_customer" as any, { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const softDeleteServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("soft_delete_service" as any, { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const hardDeleteServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("hard_delete_service" as any, { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const restoreServiceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(idInput)
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("restore_service" as any, { _id: data.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetServicesToOfficialMenuFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("reset_services_to_official_menu" as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
