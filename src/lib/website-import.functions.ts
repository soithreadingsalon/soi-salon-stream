import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { upsertCustomerFromAppointment } from "@/lib/customers.functions";

const rowSchema = z.object({
  full_name: z.string().min(1).max(160),
  phone: z.string().max(40).optional().nullable(),
  email: z.string().max(160).optional().nullable(),
  service_category: z.string().max(120).optional().nullable(),
  service_name: z.string().max(200).optional().nullable(),
  appointment_date: z.string().max(40).optional().nullable(), // ISO yyyy-mm-dd
  appointment_time: z.string().max(20).optional().nullable(), // HH:mm
  notes: z.string().max(2000).optional().nullable(),
  external_id: z.string().max(200).optional().nullable(),
});

export const importWebsiteAppointments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ rows: z.array(rowSchema).min(1).max(5000) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAuthorized } = await context.supabase.rpc("has_any_role", {
      _user_id: context.userId,
      _roles: ["super_admin", "admin", "manager"],
    });
    if (!isAuthorized) throw new Error("Not authorized to import customer data");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: cats } = await supabaseAdmin
      .from("service_categories")
      .select("id, name, slug");
    const catByKey = new Map<string, string>();
    for (const c of cats ?? []) {
      if (c.name) catByKey.set(c.name.toLowerCase().trim(), c.id);
      if (c.slug) catByKey.set(c.slug.toLowerCase().trim(), c.id);
    }

    let customers_created = 0;
    let customers_merged = 0;
    let appointments_created = 0;
    let appointments_skipped = 0;
    const errors: { row: number; message: string }[] = [];

    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      try {
        const catKey = r.service_category?.toLowerCase().trim();
        const service_category_id = catKey ? catByKey.get(catKey) ?? null : null;

        // Check if customer already exists (to count merge vs create)
        const digits = (r.phone ?? "").replace(/\D/g, "");
        let preExisting: { id: string } | null = null;
        if (digits.length >= 7) {
          const { data: m } = await supabaseAdmin
            .from("customers")
            .select("id")
            .ilike("phone", `%${digits.slice(-7)}%`)
            .limit(1)
            .maybeSingle();
          if (m) preExisting = m;
        }
        if (!preExisting && r.email) {
          const { data: m } = await supabaseAdmin
            .from("customers")
            .select("id")
            .ilike("email", r.email)
            .limit(1)
            .maybeSingle();
          if (m) preExisting = m;
        }

        const customer_id = await upsertCustomerFromAppointment(supabaseAdmin, {
          full_name: r.full_name,
          phone: r.phone,
          email: r.email,
          service_category_id,
          service_name: r.service_name,
          notes: r.notes ? `[website import] ${r.notes}` : "[website import]",
          marketing_opt_in: true,
          created_by: context.userId,
        });
        if (preExisting) customers_merged++;
        else customers_created++;

        // Backfill appointment if date+time provided
        if (r.appointment_date && r.appointment_time) {
          const external_booking_id = r.external_id ?? `wi-${r.appointment_date}-${digits || r.email || r.full_name}`;
          const { data: existing } = await supabaseAdmin
            .from("appointments")
            .select("id")
            .eq("external_source", "website_import")
            .eq("external_booking_id", external_booking_id)
            .eq("environment", "production")
            .maybeSingle();
          if (existing) {
            appointments_skipped++;
          } else {
            const time = r.appointment_time.length === 5 ? `${r.appointment_time}:00` : r.appointment_time;
            const { error } = await supabaseAdmin.from("appointments").insert({
              customer_id,
              customer_name: r.full_name,
              customer_phone: r.phone ?? null,
              customer_email: r.email ?? null,
              service_name: r.service_name ?? null,
              service_category_id,
              appointment_date: r.appointment_date,
              appointment_time: time,
              duration_minutes: 30,
              notes: r.notes ?? null,
              booking_source: "website",
              external_source: "website_import",
              external_booking_id,
              status: "completed",
              environment: "production",
              sync_status: "synced",
              last_synced_at: new Date().toISOString(),
            });
            if (error) {
              appointments_skipped++;
              errors.push({ row: i + 1, message: `appointment: ${error.message}` });
            } else {
              appointments_created++;
            }
          }
        }
      } catch (e: any) {
        errors.push({ row: i + 1, message: String(e?.message ?? e) });
      }
    }

    return { customers_created, customers_merged, appointments_created, appointments_skipped, errors };
  });
