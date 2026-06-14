import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listAppointments,
  updateAppointmentStatus,
  assignAppointment,
  createAppointment,
  listAssignableStaff,
} from "@/lib/appointments.functions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { CalendarClock, Plus, UserCheck, Play, Check, X, AlertCircle } from "lucide-react";

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
  new: "bg-amber-100 text-amber-900 border-amber-200",
  confirmed: "bg-blue-100 text-blue-900 border-blue-200",
  checked_in: "bg-purple-100 text-purple-900 border-purple-200",
  waiting: "bg-orange-100 text-orange-900 border-orange-200",
  in_service: "bg-emerald-100 text-emerald-900 border-emerald-200",
  completed: "bg-neutral-100 text-neutral-700 border-neutral-200",
  cancelled: "bg-rose-100 text-rose-900 border-rose-200",
  no_show: "bg-rose-100 text-rose-900 border-rose-200",
};

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function AppointmentsPage() {
  const { user } = useAuth();
  const { can, isAdmin } = usePermissions();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const canAssign = isAdmin || can("appointments.assign");
  const canCancel = isAdmin || can("appointments.cancel");
  const canCheckin = isAdmin || can("appointments.checkin");

  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [envFilter, setEnvFilter] = useState<"production" | "test" | "all">("production");
  const [search, setSearch] = useState("");

  const list = useServerFn(listAppointments);
  const staffFn = useServerFn(listAssignableStaff);
  const updateStatus = useServerFn(updateAppointmentStatus);
  const assignFn = useServerFn(assignAppointment);
  const createFn = useServerFn(createAppointment);

  const { data: appts = [], isLoading } = useQuery({
    queryKey: ["appointments", from, to, statusFilter, sourceFilter, envFilter, search],
    queryFn: () => list({
      data: {
        from, to,
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
  const staffMap = useMemo(() => Object.fromEntries(staff.map((s: any) => [s.id, s.full_name || s.email])), [staff]);

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: any }) => updateStatus({ data: v }),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["appointments"] }); },
    onError: (e: any) => toast.error(e.message),
  });
  const assignMut = useMutation({
    mutationFn: (v: { id: string; staffId: string | null }) => assignFn({ data: v }),
    onSuccess: () => { toast.success("Assigned"); qc.invalidateQueries({ queryKey: ["appointments"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  // Group for kanban: today only
  const today = todayStr();
  const todayAppts = (appts as Appt[]).filter((a) => a.appointment_date === today);
  const newWebsite = todayAppts.filter((a) => a.status === "new" && a.booking_source === "website");
  const waiting = todayAppts.filter((a) => a.status === "checked_in" || a.status === "waiting");
  const inService = todayAppts.filter((a) => a.status === "in_service");
  const completedToday = todayAppts.filter((a) => a.status === "completed");
  const unassigned = todayAppts.filter((a) => !a.assigned_staff_id && !["completed", "cancelled", "no_show"].includes(a.status));

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

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Appointments</h1>
          <p className="text-sm text-muted-foreground">
            Today's queue · website bookings · staff assignments
          </p>
        </div>
        <NewAppointmentDialog
          staff={staff}
          onCreate={async (payload) => {
            await createFn({ data: payload });
            toast.success("Appointment created");
            qc.invalidateQueries({ queryKey: ["appointments"] });
          }}
        />
      </div>

      {/* Today summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="New website bookings" value={newWebsite.length} accent="bg-amber-50" />
        <StatCard label="Waiting" value={waiting.length} accent="bg-orange-50" />
        <StatCard label="In service" value={inService.length} accent="bg-emerald-50" />
        <StatCard label="Completed today" value={completedToday.length} accent="bg-neutral-50" />
        <StatCard label="Needs assignment" value={unassigned.length} accent="bg-rose-50" />
      </div>

      {/* Filters */}
      <Card className="border-border/60 shadow-soft">
        <CardContent className="grid gap-3 p-4 md:grid-cols-5">
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
          <div>
            <Label className="text-xs">Search</Label>
            <Input placeholder="Name / phone / email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card className="border-border/60 shadow-soft">
        <CardHeader className="pb-2">
          <h2 className="font-display text-lg">Appointments</h2>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading…</div>
          ) : appts.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No appointments match these filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">When</th>
                    <th className="px-3 py-2 text-left">Customer</th>
                    <th className="px-3 py-2 text-left">Service</th>
                    <th className="px-3 py-2 text-left">Source</th>
                    <th className="px-3 py-2 text-left">Staff</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(appts as Appt[]).map((a) => {
                    const mine = a.assigned_staff_id === user?.id;
                    return (
                      <tr key={a.id} className="border-t border-border/40 hover:bg-muted/30">
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div className="font-medium">{a.appointment_date}</div>
                          <div className="text-xs text-muted-foreground">{a.appointment_time.slice(0,5)} · {a.duration_minutes}m</div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{a.customer_name}</div>
                          <div className="text-xs text-muted-foreground">{a.customer_phone}</div>
                        </td>
                        <td className="px-3 py-2">{a.service_name ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="capitalize">{a.booking_source.replace("_", " ")}</Badge>
                          {a.booking_source === "website" && a.status === "new" && (
                            <Badge className="ml-1 bg-amber-500 text-white">New</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {canAssign ? (
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
                          ) : (
                            <span className="text-sm">{a.assigned_staff_id ? staffMap[a.assigned_staff_id] ?? "—" : "—"}{mine && " (you)"}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded border px-2 py-0.5 text-xs ${STATUS_COLOR[a.status] ?? ""}`}>
                            {STATUS_LABEL[a.status] ?? a.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
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

function NewAppointmentDialog({ staff, onCreate }: { staff: any[]; onCreate: (p: any) => Promise<void> }) {
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
                  assigned_staff_id: staffId === "__none__" ? null : staffId,
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
