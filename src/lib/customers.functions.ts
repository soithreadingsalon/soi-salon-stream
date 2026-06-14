import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Match-or-create a customer from a payload coming from any appointment source
 * (website webhook OR manual entry from the POS).
 *
 * - Match priority: phone (last-7 digits) → email.
 * - On match: fill in blank fields, never overwrite existing data.
 * - On miss: insert a new customer row.
 * Returns the customer id.
 */
export async function upsertCustomerFromAppointment(
  supabase: any,
  p: {
    full_name: string;
    phone?: string | null;
    email?: string | null;
    service_category_id?: string | null;
    service_name?: string | null;
    notes?: string | null;
    marketing_opt_in?: boolean;
    created_by?: string | null;
  },
): Promise<string> {
  const digits = (p.phone ?? "").replace(/\D/g, "");
  let existing: { id: string } | null = null;

  if (digits.length >= 7) {
    const tail = digits.slice(-7);
    const { data } = await supabase
      .from("customers")
      .select("id, email, preferred_service_name, preferred_service_category_id, notes")
      .ilike("phone", `%${tail}%`)
      .limit(1)
      .maybeSingle();
    if (data) existing = data;
  }
  if (!existing && p.email) {
    const { data } = await supabase
      .from("customers")
      .select("id, email, preferred_service_name, preferred_service_category_id, notes")
      .ilike("email", p.email)
      .limit(1)
      .maybeSingle();
    if (data) existing = data;
  }

  if (existing) {
    const patch: Record<string, any> = {};
    const e = existing as any;
    if (!e.email && p.email) patch.email = p.email;
    if (!e.preferred_service_name && p.service_name) patch.preferred_service_name = p.service_name;
    if (!e.preferred_service_category_id && p.service_category_id) patch.preferred_service_category_id = p.service_category_id;
    if (Object.keys(patch).length > 0) {
      // Best-effort: some staff roles (cashier) can't update customers via RLS.
      // The match is still useful even if we can't enrich the row.
      await supabase.from("customers").update(patch).eq("id", existing.id);
    }
    return existing.id;
  }

  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      full_name: p.full_name,
      phone: p.phone ?? null,
      email: p.email ?? null,
      notes: p.notes ?? null,
      preferred_service_name: p.service_name ?? null,
      preferred_service_category_id: p.service_category_id ?? null,
      marketing_opt_in: p.marketing_opt_in ?? true,
      created_by: p.created_by ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return created.id;
}

export const listCustomersForExport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ search: z.string().max(120).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_any_role", {
      _user_id: context.userId,
      _roles: ["super_admin", "admin", "manager"],
    });
    if (!isAdmin) throw new Error("Not authorized to export customer data");

    let q = context.supabase
      .from("customers")
      .select(
        "full_name, phone, email, birthday, marketing_opt_in, preferred_service_name, preferred_service_category_id, notes, visit_count, total_spend, last_visit_at, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(5000);
    if (data.search && data.search.length >= 2) {
      const s = `%${data.search}%`;
      q = q.or(`full_name.ilike.${s},phone.ilike.${s},email.ilike.${s}`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const { data: cats } = await context.supabase
      .from("service_categories")
      .select("id, name");
    const catMap = new Map<string, string>((cats ?? []).map((c: any) => [c.id, c.name]));

    return (rows ?? []).map((r: any) => ({
      ...r,
      preferred_service_category: r.preferred_service_category_id
        ? catMap.get(r.preferred_service_category_id) ?? ""
        : "",
    }));
  });
