import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { importWebsiteAppointments } from "@/lib/website-import.functions";

type ParsedRow = {
  full_name: string;
  phone?: string;
  email?: string;
  service_category?: string;
  service_name?: string;
  appointment_date?: string;
  appointment_time?: string;
  notes?: string;
  external_id?: string;
};

const FIELD_ALIASES: Record<keyof ParsedRow, string[]> = {
  full_name: ["full_name", "fullname", "name", "customer_name", "customer", "client_name", "client"],
  phone: ["phone", "phone_number", "mobile", "cell", "contact"],
  email: ["email", "email_address", "e-mail"],
  service_category: ["service_category", "category"],
  service_name: ["service_name", "service", "treatment"],
  appointment_date: ["appointment_date", "date", "booking_date", "appt_date"],
  appointment_time: ["appointment_time", "time", "booking_time", "appt_time"],
  notes: ["notes", "note", "message", "comments", "comment"],
  external_id: ["id", "booking_id", "external_id", "reservation_id", "appointment_id"],
};

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let val = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { val += '"'; i++; }
        else inQ = false;
      } else val += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ",") { cur.push(val); val = ""; }
      else if (c === "\n") { cur.push(val); rows.push(cur); cur = []; val = ""; }
      else if (c === "\r") {/* skip */}
      else val += c;
    }
  }
  if (val.length || cur.length) { cur.push(val); rows.push(cur); }
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((v) => v && v.trim().length)).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
    return obj;
  });
}

function normalizeKey(k: string) { return k.toLowerCase().replace(/[\s-]+/g, "_").trim(); }

function mapRow(raw: Record<string, any>): ParsedRow | null {
  const lower: Record<string, any> = {};
  for (const k of Object.keys(raw)) lower[normalizeKey(k)] = raw[k];
  const out: any = {};
  for (const field of Object.keys(FIELD_ALIASES) as (keyof ParsedRow)[]) {
    for (const alias of FIELD_ALIASES[field]) {
      if (lower[alias] != null && String(lower[alias]).trim().length) {
        out[field] = String(lower[alias]).trim();
        break;
      }
    }
  }
  if (!out.full_name) return null;
  // Normalize date to yyyy-mm-dd
  if (out.appointment_date) {
    const d = new Date(out.appointment_date);
    if (!isNaN(d.getTime())) out.appointment_date = d.toISOString().slice(0, 10);
  }
  // Normalize time to HH:mm
  if (out.appointment_time) {
    const m = String(out.appointment_time).match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (m) {
      let h = parseInt(m[1], 10);
      const mins = m[2];
      if (m[3]) { const pm = m[3].toLowerCase() === "pm"; if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
      out.appointment_time = `${String(h).padStart(2, "0")}:${mins}`;
    }
  }
  return out;
}

export function ImportWebsiteDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (b: boolean) => void; onDone: () => void }) {
  const importFn = useServerFn(importWebsiteAppointments);
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
  const [filename, setFilename] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const mapped = useMemo(() => rawRows.map(mapRow).filter(Boolean) as ParsedRow[], [rawRows]);

  const onFile = async (f: File | null) => {
    if (!f) return;
    setFilename(f.name);
    setResult(null);
    const text = await f.text();
    try {
      if (f.name.toLowerCase().endsWith(".json") || text.trim().startsWith("[") || text.trim().startsWith("{")) {
        const parsed = JSON.parse(text);
        const arr = Array.isArray(parsed) ? parsed : (parsed.appointments ?? parsed.bookings ?? parsed.data ?? parsed.rows ?? []);
        setRawRows(arr);
      } else {
        setRawRows(parseCsv(text));
      }
    } catch (e: any) {
      toast.error(`Could not parse file: ${e.message}`);
      setRawRows([]);
    }
  };

  const run = async () => {
    if (mapped.length === 0) return;
    setRunning(true);
    try {
      const r = await importFn({ data: { rows: mapped } });
      setResult(r);
      toast.success(`Import done: ${r.customers_created} new, ${r.customers_merged} merged`);
      onDone();
    } catch (e: any) {
      toast.error(e.message ?? "Import failed");
    } finally {
      setRunning(false);
    }
  };

  const close = (b: boolean) => {
    if (!b) { setRawRows([]); setFilename(""); setResult(null); }
    onOpenChange(b);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="font-display">Import from Website</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload a CSV or JSON export of appointments from soithreadingandsalon.com. Customers will be created (or merged
            by phone/email) and historical appointments backfilled. Re-running the same file is safe — duplicates are skipped.
          </p>
          <div className="space-y-1.5">
            <Label>File (CSV or JSON)</Label>
            <Input type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            {filename && <p className="text-xs text-muted-foreground">{filename} — {mapped.length} valid row(s) found</p>}
          </div>

          {mapped.length > 0 && !result && (
            <div className="rounded-md border border-border max-h-64 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <th className="p-2 text-left">Name</th>
                    <th className="p-2 text-left">Phone</th>
                    <th className="p-2 text-left">Email</th>
                    <th className="p-2 text-left">Service</th>
                    <th className="p-2 text-left">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {mapped.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="p-2">{r.full_name}</td>
                      <td className="p-2">{r.phone ?? "—"}</td>
                      <td className="p-2">{r.email ?? "—"}</td>
                      <td className="p-2">{r.service_name ?? "—"}</td>
                      <td className="p-2">{r.appointment_date ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mapped.length > 10 && <p className="p-2 text-xs text-muted-foreground">…and {mapped.length - 10} more</p>}
            </div>
          )}

          {result && (
            <div className="rounded-md border border-border p-3 text-sm space-y-1">
              <p><strong>{result.customers_created}</strong> new customers created</p>
              <p><strong>{result.customers_merged}</strong> existing customers matched / merged</p>
              <p><strong>{result.appointments_created}</strong> historical appointments backfilled</p>
              <p><strong>{result.appointments_skipped}</strong> appointments skipped (duplicates)</p>
              {result.errors?.length > 0 && (
                <details className="text-xs text-destructive">
                  <summary>{result.errors.length} error(s)</summary>
                  <ul className="mt-1 space-y-0.5">
                    {result.errors.slice(0, 20).map((e: any, i: number) => (
                      <li key={i}>Row {e.row}: {e.message}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => close(false)}>{result ? "Close" : "Cancel"}</Button>
          {!result && (
            <Button onClick={run} disabled={mapped.length === 0 || running} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Upload className="mr-2 h-4 w-4" /> {running ? "Importing…" : `Import ${mapped.length} row(s)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
