import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "list_todays_appointments",
  title: "List today's appointments",
  description:
    "Return all appointments for the salon on a given date (defaults to today). Respects the signed-in user's role and row-level security.",
  inputSchema: {
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("ISO date (YYYY-MM-DD). Defaults to today."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ date }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const day = date ?? new Date().toISOString().slice(0, 10);
    const { data, error } = await supabaseForUser(ctx)
      .from("appointments")
      .select(
        "id, customer_name, customer_phone, appointment_date, appointment_time, service_name, duration_minutes, status, assigned_staff_id, notes, booking_source",
      )
      .eq("appointment_date", day)
      .order("appointment_time");
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { date: day, appointments: data ?? [] },
    };
  },
});
