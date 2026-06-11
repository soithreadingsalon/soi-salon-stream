import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHash, randomBytes } from "crypto";

const hashPin = (salt: string, pin: string) =>
  createHash("sha256").update(salt + pin).digest("hex");

async function requireAdmin(ctx: { supabase: any; userId: string }) {
  const { data: roles } = await ctx.supabase
    .from("user_roles").select("role").eq("user_id", ctx.userId);
  const ok = (roles ?? []).some((r: any) => r.role === "super_admin" || r.role === "admin");
  if (!ok) throw new Error("Forbidden");
}

/** Returns true if a PIN is configured. Safe for any signed-in user. */
export const hasOverridePin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("business_settings")
      .select("override_pin_hash")
      .limit(1)
      .maybeSingle();
    return { configured: !!(data as any)?.override_pin_hash };
  });

/** Admin-only: set or rotate the override PIN. */
export const setOverridePin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ newPin: z.string().regex(/^\d{4,8}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const salt = randomBytes(16).toString("hex");
    const hash = hashPin(salt, data.newPin);
    const { data: row } = await supabaseAdmin
      .from("business_settings").select("id").limit(1).maybeSingle();
    if (!row) throw new Error("Business settings not initialized");
    const { error } = await supabaseAdmin
      .from("business_settings")
      .update({ override_pin_salt: salt, override_pin_hash: hash })
      .eq("id", (row as any).id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "override_pin.rotated",
      entity_type: "business_settings",
      entity_id: (row as any).id,
      metadata: {},
    });
    return { ok: true };
  });

const METHOD_ENUM_MAP: Record<string, "cash" | "card" | "other"> = {
  cash: "cash",
  card: "card",
  zelle: "other",
  other: "other",
};

/** Admin-only: change payment method on an existing payment row. */
export const updatePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      paymentId: z.string().uuid(),
      newMethod: z.enum(["cash", "card", "zelle", "other"]),
      pin: z.string().regex(/^\d{4,8}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("business_settings")
      .select("override_pin_hash, override_pin_salt")
      .limit(1)
      .maybeSingle();
    const s = settings as any;
    if (!s?.override_pin_hash || !s?.override_pin_salt) {
      throw new Error("Override PIN not configured");
    }
    if (hashPin(s.override_pin_salt, data.pin) !== s.override_pin_hash) {
      throw new Error("Invalid PIN");
    }
    const { data: before } = await supabaseAdmin
      .from("payments")
      .select("id, order_id, method, payment_method, amount")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!before) throw new Error("Payment not found");
    const enumValue = METHOD_ENUM_MAP[data.newMethod];
    const { error } = await supabaseAdmin
      .from("payments")
      .update({ method: enumValue, payment_method: data.newMethod })
      .eq("id", data.paymentId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "payment.method_changed",
      entity_type: "payment",
      entity_id: data.paymentId,
      metadata: {
        order_id: (before as any).order_id,
        before: { method: (before as any).method, payment_method: (before as any).payment_method },
        after: { method: enumValue, payment_method: data.newMethod },
        amount: (before as any).amount,
      },
    });
    return { ok: true };
  });
