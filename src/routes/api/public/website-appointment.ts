import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const schema = z.object({
  customer_name: z.string().min(1).max(120),
  customer_phone: z.string().min(1).max(40),
  customer_email: z.string().email().max(160).optional().nullable(),
  service_category: z.string().max(80).optional().nullable(), // slug OR name OR uuid
  service_name: z.string().min(1).max(160),
  appointment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  appointment_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  duration_minutes: z.number().int().min(5).max(480).optional(),
  notes: z.string().max(2000).optional().nullable(),
  external_booking_id: z.string().max(160).optional().nullable(),
  external_source: z.string().max(60).optional().nullable(),
});

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-soi-signature, x-booking-secret",
  };
}

export const Route = createFileRoute("/api/public/website-appointment")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: corsHeaders() }),
      POST: async ({ request }) => {
        const secret = process.env.WEBSITE_BOOKING_SECRET;
        if (!secret) {
          return new Response(JSON.stringify({ error: "Booking endpoint not configured" }), {
            status: 503, headers: corsHeaders(),
          });
        }
        const body = await request.text();
        const staticSecret = request.headers.get("x-booking-secret") ?? "";
        const sig = request.headers.get("x-soi-signature") ?? "";
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const providedStatic = Buffer.from(staticSecret);
        const configuredStatic = Buffer.from(secret);
        const providedSig = Buffer.from(sig);
        const expectedSig = Buffer.from(expected);
        const isStaticSecretValid =
          providedStatic.length === configuredStatic.length && timingSafeEqual(providedStatic, configuredStatic);
        const isSignatureValid =
          providedSig.length === expectedSig.length && timingSafeEqual(providedSig, expectedSig);
        if (!isStaticSecretValid && !isSignatureValid) {
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 401, headers: corsHeaders(),
          });
        }

        const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "").toLowerCase();
        const environment =
          host.includes("-dev.lovable.app") ||
          host.startsWith("preview--") ||
          host.includes("-preview--") ||
          host.endsWith(".lovableproject.com")
            ? "test"
            : "production";

        let payload: z.infer<typeof schema>;
        try {
          payload = schema.parse(JSON.parse(body));
        } catch (e: any) {
          return new Response(JSON.stringify({ error: "Invalid payload", detail: String(e?.message ?? e) }), {
            status: 400, headers: corsHeaders(),
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { upsertCustomerFromAppointment } = await import("@/lib/customers.functions");

        // dedup on external_booking_id (scoped to environment so test+prod don't collide)
        if (payload.external_booking_id) {
          const { data: existing } = await supabaseAdmin
            .from("appointments")
            .select("id")
            .eq("external_source", payload.external_source ?? "website")
            .eq("external_booking_id", payload.external_booking_id)
            .eq("environment", environment)
            .maybeSingle();
          if (existing) {
            return new Response(JSON.stringify({ ok: true, appointment_id: existing.id, deduped: true, environment }), {
              status: 200, headers: corsHeaders(),
            });
          }
        }

        // Resolve service category: accept slug, name, or uuid
        let service_category_id: string | null = null;
        if (payload.service_category) {
          const raw = payload.service_category.trim();
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
          if (isUuid) {
            const { data } = await supabaseAdmin.from("service_categories").select("id").eq("id", raw).maybeSingle();
            if (data) service_category_id = data.id;
          } else {
            const { data } = await supabaseAdmin
              .from("service_categories")
              .select("id")
              .or(`slug.ilike.${raw},name.ilike.${raw}`)
              .limit(1)
              .maybeSingle();
            if (data) service_category_id = data.id;
          }
        }

        // Match-or-create customer (website bookings default to marketing opt-in)
        const customer_id = await upsertCustomerFromAppointment(supabaseAdmin, {
          full_name: payload.customer_name,
          phone: payload.customer_phone,
          email: payload.customer_email,
          service_category_id,
          service_name: payload.service_name,
          notes: payload.notes,
          marketing_opt_in: true,
          created_by: null,
        });

        const { data: row, error } = await supabaseAdmin
          .from("appointments")
          .insert({
            customer_id,
            customer_name: payload.customer_name,
            customer_phone: payload.customer_phone,
            customer_email: payload.customer_email ?? null,
            service_name: payload.service_name,
            service_category_id,
            appointment_date: payload.appointment_date,
            appointment_time: payload.appointment_time,
            duration_minutes: payload.duration_minutes ?? 30,
            notes: payload.notes ?? null,
            booking_source: "website",
            external_source: payload.external_source ?? "website",
            external_booking_id: payload.external_booking_id ?? null,
            status: "new",
            environment,
            sync_status: "synced",
            last_synced_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders() });
        }

        return new Response(JSON.stringify({ ok: true, appointment_id: row.id, customer_id, environment }), {
          status: 200, headers: corsHeaders(),
        });
      },
    },
  },
});
