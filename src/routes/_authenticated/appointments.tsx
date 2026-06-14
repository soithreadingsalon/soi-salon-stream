import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAppointments,
  updateAppointmentStatus,
  assignAppointment,
  claimAppointment,
  createAppointment,
  listAssignableStaff,
} from "@/lib/appointments.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { toast } from "sonner";
import { Plus, UserCheck, Play, Check, X, AlertCircle, Hand } from "lucide-react";

export const Route = createFileRoute("/_authenticated/appointments")({
  component: AppointmentsPage,
});

type Appt = {
  id: string;
  customer_name: string;
  customer_phone: string | null;
  customer_email: string | null;
  service_name: string | null;
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  assigned_staff_id: string | null;
  booking_source: string;
  status: string;
  notes: string | null;
  checked_in_at: string | null;
  order_id: string | null;
  created_at: string;
  environment: string;
};

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  confirmed: "Confirmed",
  checked_in: "Checked In",
  waiting: "Waiting",
  in_service: "In Service",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-Show",
};

const STATUS_COLOR: Record<string, string> = {
  new: "bg-amber-100 text-amber-900 border-amber-300",
  confirmed: "bg-blue-100 text-blue-900 border-blue-300",
  checked_in: "bg-purple-100 text-purple-900 border-purple-300",
  waiting: "bg-orange-100 text-orange-900 border-orange-300",
  in_service: "bg-emerald-100 text-emerald-900 border-emerald-300",
  completed: "bg-neutral-100 text-neutral-700 border-neutral-300",
  cancelled: "bg-rose-100 text-rose-900 border-rose-300",
  no_show: "bg-rose-100 text-rose-900 border-rose-300",
};

function fmt(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayStr() { return fmt(new Date()); }
function tomorrowStr() { const d = new Date(); d.setDate(d.getDate() + 1); return fmt(d); }
function weekEndStr() { const d = new Date(); d.setDate(d.getDate() + 6); return fmt(d); }

type DatePreset = "today" | "tomorrow" | "week" | "all" | "custom";

// Hide the environment toggle on the live production site. Preview/dev keeps it.
function isProdHost() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "pos.soithreadingandsalon.com" || h === "soi-salon-stream.lovable.app";
}

function AppointmentsPage() {
  const { user } = useAuth();
  const { isAdmin } = usePermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // Admin-only assigns. Everyone else uses "Assign to me".
  const canAssignOthers = isAdmin;
  const canCancel = isAdmin;
  const canCheckin = true; // staff can check guests in / start service

  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [envFilter, setEnvFilter] = useState<"production" | "test" | "all">("production");
  const prodHost = isProdHost();
  useEffect(() => { if (prodHost) setEnvFilter("production"); }, [prodHost]);
  const [search, setSearch] = useState("");
  // Default: non-admin staff see only their own appointments
  const [mineOnly, setMineOnly] = useState<boolean>(!isAdmin);

  useEffect(() => { setMineOnly(!isAdmin); }, [isAdmin]);

  function applyPreset(p: DatePreset) {
    setDatePreset(p);
    if (p === "today")    { setFrom(todayStr());    setTo(todayStr()); }
    if (p === "tomorrow") { setFrom(tomorrowStr()); setTo(tomorrowStr()); }
    if (p === "week")     { setFrom(todayStr());    setTo(weekEndStr()); }
    if (p === "all")      { setFrom("");            setTo(""); }
  }

  const list = useServerFn(listAppointments);
  const staffFn = useServerFn(listAssignableStaff);
  const updateStatus = useServerFn(updateAppointmentStatus);
  const assignFn = useServerFn(assignAppointment);
  const claimFn = useServerFn(claimAppointment);
  const createFn = useServerFn(createAppointment);

  const { data: appts = [], isLoading } = useQuery({
    queryKey: ["appointments", from, to, statusFilter, sourceFilter, envFilter, search],
    queryFn: () => list({
      data: {
        from: from || undefined,
        to: to || undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        source: sourceFilter !== "all" ? sourceFilter : undefined,
        environment: envFilter,
        search: search || undefined,
      },
    }),
  });

  const { data: staff = [] } = useQuery({
    queryKey: ["assignable-staff"],
    queryFn: () => staffFn({ data: undefined as any }),
    staleTime: 60_000,
  });
  const staffMap = useMemo(
    () => Object.fromEntries(staff.map((s: any) => [s.id, s.full_name || s.email])),
    [staff],
  );

  // Live updates: refetch when any appointment row changes
  useEffect(() => {
    const ch = supabase
      .channel("appointments-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, () => {
        qc.invalidateQueries({ queryKey: ["appointments"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: any }) => updateStatus({ data: v }),
    onSuccess: () => { toast.success("Status updated"); qc.invalidateQueries({ queryKey: ["appointments"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const assignMut = useMutation({
    mutationFn: (v: { id: string; staffId: string | null }) => assignFn({ data: v }),
    onSuccess: () => { toast.success("Assigned"); qc.invalidateQueries({ queryKey: ["appointments"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const claimMut = useMutation({
    mutationFn: (id: string) => claimFn({ data: { id } }),
    onSuccess: () => { toast.success("Claimed — it's yours"); qc.invalidateQueries({ queryKey: ["appointments"] }); },
    onError: (e: any) => toast.error(e.message ?? "Could not claim"),
  });

  // Apply "Mine only" filter client-side
  const visible = useMemo(() => {
    const rows = appts as Appt[];
    return mineOnly && user?.id ? rows.filter((a) => a.assigned_staff_id === user.id) : rows;
  }, [appts, mineOnly, user?.id]);

  // Counters reflect what the user actually sees (live via realtime + invalidation)
  const newWebsite     = visible.filter((a) => a.status === "new" && a.booking_source === "website");
  const waiting        = visible.filter((a) => a.status === "checked_in" || a.status === "waiting");
  const inService      = visible.filter((a) => a.status === "in_service");
  const completedToday = visible.filter((a) => a.status === "completed");
  const unassigned     = visible.filter((a) => !a.assigned_staff_id && !["completed", "cancelled", "no_show"].includes(a.status));

  function startCheckout(a: Appt) {
    navigate({
      to: "/pos",
      search: {
        appointment: a.id,
        service: a.service_name ?? "",
        customer: a.customer_name,
        phone: a.customer_phone ?? "",
      } as any,
    });
  }

  const presetBtn = (p: DatePreset, label: string) => (
    <Button
      key={p}
      size="sm"
      variant={datePreset === p ? "default" : "outline"}
      onClick={() => applyPreset(p)}
      className="h-8"
    >
      {label}
    </Button>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Appointments</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Manage queue, assign staff, and check guests in." : "Claim new bookings and manage your day."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border/60 bg-card px-3 py-2 text-sm">
            <Switch checked={mineOnly} onCheckedChange={setMineOnly} />
            <span className="font-medium">Show only mine</span>
          </label>
          <NewAppointmentDialog
            staff={staff}
            canAssign={canAssignOthers}
            onCreate={async (payload) => {
              await createFn({ data: payload });
              toast.success("Appointment created");
              qc.invalidateQueries({ queryKey: ["appointments"] });
            }}
          />
        </div>
      </div>

      {/* Summary cards (reflect current filter + mine toggle) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="New website bookings" value={newWebsite.length} accent="bg-amber-50" />
        <StatCard label="Waiting" value={waiting.length} accent="bg-orange-50" />
        <StatCard label="In service" value={inService.length} accent="bg-emerald-50" />
        <StatCard label="Completed" value={completedToday.length} accent="bg-neutral-50" />
        <StatCard label="Unassigned" value={unassigned.length} accent="bg-rose-50" />
      </div>

      {/* Quick date chips */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Quick view:</span>
        {presetBtn("today", "Today")}
        {presetBtn("tomorrow", "Tomorrow")}
        {presetBtn("week", "This week")}
        {presetBtn("all", "All dates")}
      </div>

      {/* Filters */}
      <Card className="border-border/60 shadow-soft">
        <CardContent className="grid gap-3 p-4 md:grid-cols-6">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setDatePreset("custom"); }} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setDatePreset("custom"); }} />
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Source</Label>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="pos">POS</SelectItem>
                <SelectItem value="walk_in">Walk-In</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!prodHost && (
            <div>
              <Label className="text-xs">Environment</Label>
              <Select value={envFilter} onValueChange={(v) => setEnvFilter(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="test">Test (sandbox)</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Search</Label>
            <Input placeholder="Name / phone / email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="border-border/60 shadow-soft">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">Appointments</h2>
            <span className="text-xs text-muted-foreground">{visible.length} showing</span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : visible.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              {mineOnly
                ? "No appointments are currently assigned to you. Turn off 'Show only mine' to see what's available to claim."
                : "No appointments match these filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-muted/60 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">When</th>
                    <th className="px-3 py-2 text-left">Customer</th>
                    <th className="px-3 py-2 text-left">Service</th>
                    <th className="px-3 py-2 text-left">Source</th>
                    <th className="px-3 py-2 text-left">Staff</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((a) => {
                    const mine = a.assigned_staff_id === user?.id;
                    const isUnassigned = !a.assigned_staff_id;
                    return (
                      <tr key={a.id} className={`border-t border-border/40 hover:bg-muted/30 ${mine ? "bg-amber-50/40" : ""}`}>
                        <td className="px-3 py-3">
                          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${STATUS_COLOR[a.status] ?? ""}`}>
                            {STATUS_LABEL[a.status] ?? a.status}
                          </span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="font-medium">{a.appointment_date}</div>
                          <div className="text-xs text-muted-foreground">{a.appointment_time.slice(0,5)} · {a.duration_minutes}m</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 font-medium">
                            {a.customer_name}
                            {!prodHost && a.environment === "test" && (
                              <Badge className="bg-purple-600 text-white">TEST</Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">{a.customer_phone}</div>
                        </td>
                        <td className="px-3 py-3">{a.service_name ?? "—"}</td>
                        <td className="px-3 py-3">
                          <Badge variant="outline" className="capitalize">{a.booking_source.replace("_", " ")}</Badge>
                          {a.booking_source === "website" && a.status === "new" && (
                            <Badge className="ml-1 bg-amber-500 text-white">New</Badge>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {canAssignOthers ? (
                            <Select
                              value={a.assigned_staff_id ?? "__none__"}
                              onValueChange={(v) => assignMut.mutate({ id: a.id, staffId: v === "__none__" ? null : v })}
                            >
                              <SelectTrigger className="h-8 w-[180px]"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Unassigned</SelectItem>
                                {staff.map((s: any) => (
                                  <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : isUnassigned ? (
                            <Button
                              size="sm"
                              className="h-8 gap-1"
                              disabled={claimMut.isPending}
                              onClick={() => claimMut.mutate(a.id)}
                            >
                              <Hand className="h-3.5 w-3.5" /> Assign to me
                            </Button>
                          ) : (
                            <span className="text-sm">
                              {staffMap[a.assigned_staff_id!] ?? "—"}
                              {mine && <span className="ml-1 text-xs font-semibold text-emerald-700">(you)</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            {canCheckin && a.status === "new" && (
                              <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: a.id, status: "checked_in" })}>
                                <UserCheck className="mr-1 h-3 w-3" />Check In
                              </Button>
                            )}
                            {canCheckin && a.status === "checked_in" && (
                              <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: a.id, status: "in_service" })}>
                                <Play className="mr-1 h-3 w-3" />Start
                              </Button>
                            )}
                            {["new","confirmed","checked_in","in_service"].includes(a.status) && (
                              <Button size="sm" onClick={() => startCheckout(a)}>
                                Convert to Sale
                              </Button>
                            )}
                            {canCancel && !["completed","cancelled","no_show"].includes(a.status) && (
                              <>
                                <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: a.id, status: "no_show" })}>
                                  <AlertCircle className="mr-1 h-3 w-3" />No-show
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: a.id, status: "cancelled" })}>
                                  <X className="mr-1 h-3 w-3" />Cancel
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className={`border-border/60 shadow-soft ${accent ?? ""}`}>
      <CardContent className="p-4">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function NewAppointmentDialog({
  staff, canAssign, onCreate,
}: {
  staff: any[];
  canAssign: boolean;
  onCreate: (p: any) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [service, setService] = useState("");
  const [date, setDate] = useState(todayStr());
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState(30);
  const [staffId, setStaffId] = useState<string>("__none__");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-1 h-4 w-4" />New Appointment</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Appointment</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Customer name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div><Label>Email (optional)</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>Service</Label><Input value={service} onChange={(e) => setService(e.target.value)} placeholder="e.g. Eyebrow Threading" /></div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><Label>Time</Label><Input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></div>
            <div><Label>Duration (min)</Label><Input type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 30)} /></div>
          </div>
          {canAssign && (
            <div>
              <Label>Assign to</Label>
              <Select value={staffId} onValueChange={setStaffId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.full_name || s.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Notes</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <Button
            disabled={saving || !name || !phone || !service || !date || !time}
            onClick={async () => {
              setSaving(true);
              try {
                await onCreate({
                  customer_name: name,
                  customer_phone: phone,
                  customer_email: email || null,
                  service_name: service,
                  appointment_date: date,
                  appointment_time: time,
                  duration_minutes: duration,
                  assigned_staff_id: canAssign && staffId !== "__none__" ? staffId : null,
                  notes: notes || null,
                  booking_source: "manual",
                });
                setOpen(false);
                setName(""); setPhone(""); setEmail(""); setService(""); setNotes("");
              } finally {
                setSaving(false);
              }
            }}
          >
            <Check className="mr-1 h-4 w-4" />Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
