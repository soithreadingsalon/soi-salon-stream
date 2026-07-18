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
  name: "get_sales_summary",
  title: "Get sales summary",
  description:
    "Return totals (order count, gross, tips) for orders within a date range. Dates are inclusive ISO YYYY-MM-DD; defaults to today.",
  inputSchema: {
    start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ start_date, end_date }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const today = new Date().toISOString().slice(0, 10);
    const start = start_date ?? today;
    const end = end_date ?? start;
    const startIso = `${start}T00:00:00.000Z`;
    const endIso = `${end}T23:59:59.999Z`;

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("orders")
      .select("id, total, tip_amount, created_at, status")
      .gte("created_at", startIso)
      .lte("created_at", endIso);
    if (error) {
      return { content: [{ type: "text", text: error.message }], isError: true };
    }
    const rows = data ?? [];
    const orderCount = rows.length;
    const gross = rows.reduce((s, r: any) => s + Number(r.total ?? 0), 0);
    const tips = rows.reduce((s, r: any) => s + Number(r.tip_amount ?? 0), 0);
    const summary = {
      start_date: start,
      end_date: end,
      order_count: orderCount,
      gross_total: Number(gross.toFixed(2)),
      tip_total: Number(tips.toFixed(2)),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary) }],
      structuredContent: summary,
    };
  },
});
