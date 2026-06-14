import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";

const schema = z.object({
  customer_name: z.string().min(1).max(120),
  customer_phone: z.string().min(1).max(40),
  customer_email: z.string().email().max(160).optional().nullable(),
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
    "Access-Control-Allow-Headers": "Content-Type, x-soi-signature",
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
        const sig = request.headers.get("x-soi-signature") ?? "";
        const expected = createHmac("sha256", secret).update(body).digest("hex");
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 401, headers: corsHeaders(),
          });
        }

        // Auto-detect environment from hostname:
        // - *-dev.lovable.app or *.lovableproject.com → "test" (sandbox)
        // - anything else (custom domain, prod *.lovable.app) → "production"
        const host = (request.headers.get("host") ?? "").toLowerCase();
        const environment =
          host.includes("-dev.lovable.app") || host.endsWith(".lovableproject.com")
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

        // dedup on external_booking_id
        if (payload.external_booking_id) {
          const { data: existing } = await supabaseAdmin
            .from("appointments")
            .select("id")
            .eq("external_source", payload.external_source ?? "website")
            .eq("external_booking_id", payload.external_booking_id)
            .maybeSingle();
          if (existing) {
            return new Response(JSON.stringify({ ok: true, appointment_id: existing.id, deduped: true }), {
              status: 200, headers: corsHeaders(),
            });
          }
        }

        // fuzzy-match customer by phone (digits only)
        const phoneDigits = payload.customer_phone.replace(/\D/g, "");
        let customer_id: string | null = null;
        if (phoneDigits.length >= 7) {
          const { data: cust } = await supabaseAdmin
            .from("customers").select("id").ilike("phone", `%${phoneDigits.slice(-7)}%`).limit(1).maybeSingle();
          if (cust) customer_id = cust.id;
        }

        const { data: row, error } = await supabaseAdmin
          .from("appointments")
          .insert({
            customer_id,
            customer_name: payload.customer_name,
            customer_phone: payload.customer_phone,
            customer_email: payload.customer_email ?? null,
            service_name: payload.service_name,
            appointment_date: payload.appointment_date,
            appointment_time: payload.appointment_time,
            duration_minutes: payload.duration_minutes ?? 30,
            notes: payload.notes ?? null,
            booking_source: "website",
            external_source: payload.external_source ?? "website",
            external_booking_id: payload.external_booking_id ?? null,
            status: "new",
            sync_status: "synced",
            last_synced_at: new Date().toISOString(),
          })
          .select("id")
          .single();

        if (error) {
          return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders() });
        }

        return new Response(JSON.stringify({ ok: true, appointment_id: row.id }), {
          status: 200, headers: corsHeaders(),
        });
      },
    },
  },
});
