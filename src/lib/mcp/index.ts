import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTodaysAppointments from "./tools/list-todays-appointments";
import getSalesSummary from "./tools/get-sales-summary";
import findCustomer from "./tools/find-customer";

// The OAuth issuer MUST be the direct Supabase host, not the .lovable.cloud
// proxy that SUPABASE_URL becomes on publish. The project ref survives publish
// unchanged and is inlined by Vite from VITE_SUPABASE_PROJECT_ID.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "soi-pos-mcp",
  title: "SOI Threading Salon POS",
  version: "0.1.0",
  instructions:
    "Read-only tools for the SOI Threading Salon POS. Use `list_todays_appointments` to see the day's schedule, `get_sales_summary` for daily/period totals, and `find_customer` to look up customers. All calls act as the signed-in user and respect the app's row-level security.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTodaysAppointments, getSalesSummary, findCustomer],
});
