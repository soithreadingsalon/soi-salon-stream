import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createHash, randomBytes } from "crypto";

const hashPin = (salt: string, pin: string) =>
  createHash("sha256").update(salt + pin).digest("hex");

/**
 * Given a worker_id and 4-digit PIN, verify and return a sign-in token
 * (token_hash + email) that the client uses with supabase.auth.verifyOtp().
 */
export const signInWithPin = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      workerId: z.string().uuid(),
      pin: z.string().regex(/^\d{4}$/),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    // 1. Load PIN row
    const { data: row, error } = await supabaseAdmin
      .from("worker_pins")
      .select("user_id, pin_salt, pin_hash, active")
      .eq("user_id", data.workerId)
      .maybeSingle();
    if (error || !row || !row.active) throw new Error("Invalid PIN");

    if (hashPin(row.pin_salt, data.pin) !== row.pin_hash) {
      throw new Error("Invalid PIN");
    }

    // 2. Look up the user's email
    const { data: user, error: uErr } =
      await supabaseAdmin.auth.admin.getUserById(row.user_id);
    if (uErr || !user?.user?.email) throw new Error("Worker account not found");

    // 3. Generate a magic-link token the browser can verify
    const { data: link, error: lErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: user.user.email,
    });
    if (lErr || !link?.properties?.hashed_token) {
      throw new Error("Could not generate session token");
    }

    return {
      email: user.user.email,
      token_hash: link.properties.hashed_token,
    };
  });

/**
 * Admin-only: set or reset a worker's 4-digit PIN.
 * If workerId is omitted, creates a brand-new auth user + profile + worker_pin.
 */
export const upsertWorkerPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      workerId: z.string().uuid().optional(),
      email: z.string().email().optional(),
      fullName: z.string().min(1).max(120).optional(),
      pin: z.string().regex(/^\d{4}$/),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Verify caller is admin
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r) =>
      r.role === "super_admin" || r.role === "admin",
    );
    if (!isAdmin) throw new Error("Forbidden");

    let userId = data.workerId;

    // Create new user if needed
    if (!userId) {
      if (!data.email || !data.fullName) {
        throw new Error("Email and full name required for new worker");
      }
      const tempPw = randomBytes(24).toString("hex");
      const { data: created, error: cErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: tempPw,
        email_confirm: true,
        user_metadata: { full_name: data.fullName },
      });
      if (created?.user) {
        userId = created.user.id;
      } else if (cErr && /already.*registered|already exists/i.test(cErr.message)) {
        // Reuse the existing auth user with this email
        const { data: list } = await supabaseAdmin.auth.admin.listUsers();
        const existing = list?.users.find((u) => u.email?.toLowerCase() === data.email!.toLowerCase());
        if (!existing) throw new Error(cErr.message);
        userId = existing.id;
      } else {
        throw new Error(cErr?.message ?? "Create failed");
      }
      // Ensure profile + cashier role (handle_new_user trigger covers this, but be safe)
      await supabaseAdmin.from("profiles").upsert({
        id: userId, email: data.email, full_name: data.fullName,
      });
    }

    const salt = randomBytes(16).toString("hex");
    const pin_hash = hashPin(salt, data.pin);

    const { error: pErr } = await supabaseAdmin.from("worker_pins").upsert({
      user_id: userId,
      pin_salt: salt,
      pin_hash,
      display_name: data.fullName ?? null,
      active: true,
    });
    if (pErr) throw new Error(pErr.message);

    return { userId };
  });

export const deactivateWorker = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ workerId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase
      .from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "super_admin" || r.role === "admin")) {
      throw new Error("Forbidden");
    }
    await supabaseAdmin.from("worker_pins")
      .update({ active: false })
      .eq("user_id", data.workerId);
    return { ok: true };
  });
