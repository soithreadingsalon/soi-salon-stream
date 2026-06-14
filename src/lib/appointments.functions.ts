import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const dateLike = z.string().min(1);

export const listAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      from: dateLike.optional(),
      to: dateLike.optional(),
      status: z.string().optional(),
      staffId: z.string().uuid().optional().nullable(),
      source: z.string().optional(),
      environment: z.enum(["production", "test", "all"]).optional(),
      search: z.string().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("appointments").select("*").order("appointment_date", { ascending: true }).order("appointment_time", { ascending: true });
    if (data.from) q = q.gte("appointment_date", data.from);
    if (data.to) q = q.lte("appointment_date", data.to);
    if (data.status) q = q.eq("status", data.status as any);
    if (data.staffId === null) q = q.is("assigned_staff_id", null);
    else if (data.staffId) q = q.eq("assigned_staff_id", data.staffId);
    if (data.source) q = q.eq("booking_source", data.source);
    // default: hide test bookings unless explicitly requested
    if (!data.environment || data.environment === "production") q = q.eq("environment", "production");
    else if (data.environment === "test") q = q.eq("environment", "test");
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`customer_name.ilike.${s},customer_phone.ilike.${s},customer_email.ilike.${s}`);
    }
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      customer_id: z.string().uuid().optional().nullable(),
      customer_name: z.string().min(1).max(120),
      customer_phone: z.string().max(40).optional().nullable(),
      customer_email: z.string().email().max(160).optional().nullable(),
      service_id: z.string().uuid().optional().nullable(),
      service_name: z.string().max(160).optional().nullable(),
      appointment_date: dateLike,
      appointment_time: z.string().min(1),
      duration_minutes: z.number().int().min(5).max(480).optional(),
      assigned_staff_id: z.string().uuid().optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
      booking_source: z.enum(["manual", "pos", "walk_in", "website"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("appointments")
      .insert({ ...data, booking_source: data.booking_source ?? "manual", status: "new" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["new", "confirmed", "checked_in", "waiting", "in_service", "completed", "cancelled", "no_show"]),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: any = { status: data.status };
    const now = new Date().toISOString();
    if (data.status === "checked_in") patch.checked_in_at = now;
    if (data.status === "in_service") patch.started_at = now;
    if (data.status === "completed") patch.completed_at = now;
    if (data.status === "cancelled") patch.cancelled_at = now;
    if (data.status === "no_show") patch.no_show_at = now;
    const { error } = await context.supabase.from("appointments").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const assignAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      staffId: z.string().uuid().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleErr } = await context.supabase.rpc("has_any_role", {
      _user_id: context.userId,
      _roles: ["super_admin", "admin"],
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Only an admin can assign staff to appointments");
    const { error } = await context.supabase
      .from("appointments")
      .update({ assigned_staff_id: data.staffId, reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const claimAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("appointments")
      .update({
        assigned_staff_id: context.userId,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .is("assigned_staff_id", null)
      .select("id");
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) {
      throw new Error("This appointment was already claimed by someone else");
    }
    return { ok: true, staffId: context.userId };
  });

export const linkAppointmentToOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), orderId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("appointments")
      .update({ order_id: data.orderId, status: "completed", completed_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listAssignableStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // staff = anyone with cashier/manager/staff/admin role; manager+ for assignment UI
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });
