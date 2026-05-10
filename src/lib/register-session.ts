import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RegisterSession = {
  id: string;
  code: string;
  register_name: string;
  active_order_id: string | null;
  live_cart: LiveCart | Record<string, never>;
  last_seen_at: string;
};

export type LiveCartItem = {
  uid: string;
  service_id: string;
  service_name: string;
  unit_price: number;
  quantity: number;
  taxable: boolean;
  is_free?: boolean;
};

export type LiveCart = {
  items: LiveCartItem[];
  customer: {
    id: string;
    full_name: string;
    points_balance?: number;
    free_eyebrow_credits?: number;
    visit_count?: number;
  } | null;
  business_name?: string;
  updatedAt: number;
};

const KEY_CASHIER = "soi.register.cashier_id";
const KEY_CUSTOMER = "soi.register.customer_id";

const gen4 = () => String(Math.floor(1000 + Math.random() * 9000));

export async function getOrCreateRegister(): Promise<RegisterSession> {
  const cached = typeof window !== "undefined" ? localStorage.getItem(KEY_CASHIER) : null;
  if (cached) {
    const { data } = await supabase
      .from("register_sessions")
      .select("*")
      .eq("id", cached)
      .maybeSingle();
    if (data) return data as unknown as RegisterSession;
  }
  const { data: existing } = await supabase
    .from("register_sessions")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existing) {
    localStorage.setItem(KEY_CASHIER, existing.id);
    return existing as unknown as RegisterSession;
  }
  for (let i = 0; i < 10; i++) {
    const code = gen4();
    const { data, error } = await supabase
      .from("register_sessions")
      .insert({ code, register_name: "Register 1" } as any)
      .select()
      .single();
    if (!error && data) {
      localStorage.setItem(KEY_CASHIER, data.id);
      return data as unknown as RegisterSession;
    }
  }
  throw new Error("Could not create register session");
}

export function useRegisterSession() {
  const [reg, setReg] = useState<RegisterSession | null>(null);

  useEffect(() => {
    let m = true;
    getOrCreateRegister().then((r) => m && setReg(r)).catch(() => {});
    return () => { m = false; };
  }, []);

  useEffect(() => {
    if (!reg?.id) return;
    const ch = supabase
      .channel(`reg-cashier-${reg.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "register_sessions", filter: `id=eq.${reg.id}` },
        (p) => setReg(p.new as unknown as RegisterSession),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [reg?.id]);

  return reg;
}

export const getCustomerPairedId = () =>
  typeof window !== "undefined" ? localStorage.getItem(KEY_CUSTOMER) : null;

export const setCustomerPairedId = (id: string | null) => {
  if (id) localStorage.setItem(KEY_CUSTOMER, id);
  else localStorage.removeItem(KEY_CUSTOMER);
};

export async function pairByCode(code: string): Promise<RegisterSession | null> {
  const { data } = await supabase
    .from("register_sessions")
    .select("*")
    .eq("code", code.trim())
    .maybeSingle();
  if (!data) return null;
  setCustomerPairedId(data.id);
  return data as unknown as RegisterSession;
}

export async function publishLiveCart(registerId: string, cart: LiveCart) {
  await supabase
    .from("register_sessions")
    .update({ live_cart: cart as any, last_seen_at: new Date().toISOString() } as any)
    .eq("id", registerId);
}

export async function setActiveOrder(registerId: string, orderId: string | null) {
  await supabase
    .from("register_sessions")
    .update({ active_order_id: orderId } as any)
    .eq("id", registerId);
}

export async function regenerateCode(registerId: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = gen4();
    const { error } = await supabase
      .from("register_sessions")
      .update({ code } as any)
      .eq("id", registerId);
    if (!error) return code;
  }
  throw new Error("Could not regenerate code");
}
