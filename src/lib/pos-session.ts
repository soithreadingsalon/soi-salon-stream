// Shared in-flight sale state synced between cashier and customer-facing displays.
// Uses BroadcastChannel for instant cross-tab updates and localStorage so the
// customer-display tab can read state on first paint.

export type PosSessionItem = {
  uid: string;
  service_name: string;
  unit_price: number;
  quantity: number;
  is_free?: boolean;
};

export type PosSessionCustomer = {
  full_name: string;
  points_balance?: number;
  free_eyebrow_credits?: number;
  visit_count?: number;
} | null;

export type PosSession = {
  items: PosSessionItem[];
  customer: PosSessionCustomer;
  subtotal: number;
  discount: number;
  tax: number;
  tip: number;
  total: number;
  tipPct: number | null;
  tipCustom: number; // 0 means none; >0 overrides percentage
  status: "building" | "paid" | "idle";
  business_name?: string;
  updatedAt: number;
};

const KEY = "soi.posSession";
const CHAN = "soi-pos";

export const emptySession: PosSession = {
  items: [],
  customer: null,
  subtotal: 0,
  discount: 0,
  tax: 0,
  tip: 0,
  total: 0,
  tipPct: null,
  tipCustom: 0,
  status: "idle",
  updatedAt: 0,
};

export function publishSession(s: PosSession) {
  if (typeof window === "undefined") return;
  const payload = { ...s, updatedAt: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch {}
  try {
    const ch = new BroadcastChannel(CHAN);
    ch.postMessage(payload);
    ch.close();
  } catch {}
}

export function readSession(): PosSession {
  if (typeof window === "undefined") return emptySession;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySession;
    return JSON.parse(raw) as PosSession;
  } catch {
    return emptySession;
  }
}

export function subscribeSession(cb: (s: PosSession) => void): () => void {
  if (typeof window === "undefined") return () => {};
  let ch: BroadcastChannel | null = null;
  try {
    ch = new BroadcastChannel(CHAN);
    ch.onmessage = (e) => cb(e.data as PosSession);
  } catch {}
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY && e.newValue) {
      try {
        cb(JSON.parse(e.newValue));
      } catch {}
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    ch?.close();
    window.removeEventListener("storage", onStorage);
  };
}
