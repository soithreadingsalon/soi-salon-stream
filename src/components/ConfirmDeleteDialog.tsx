import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  entityLabel: string;          // e.g. "customer Sarah"
  /** Move to recycle bin (recoverable). */
  onSoftDelete: () => Promise<void> | void;
  /** Permanently remove from DB. */
  onHardDelete: () => Promise<void> | void;
}

/**
 * Two-step delete flow.
 *  1. Confirm intent (Yes / No)
 *  2. Either close → soft-delete (recoverable),
 *     or type "DELETE" + submit → hard-delete.
 */
export function ConfirmDeleteDialog({ open, onOpenChange, entityLabel, onSoftDelete, onHardDelete }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setStep(1); setTyped(""); }
  }, [open]);

  const close = () => { if (!busy) onOpenChange(false); };

  const proceedToStep2 = () => setStep(2);

  const soft = async () => {
    setBusy(true);
    try { await onSoftDelete(); onOpenChange(false); } finally { setBusy(false); }
  };

  const hard = async () => {
    if (typed !== "DELETE") return;
    setBusy(true);
    try { await onHardDelete(); onOpenChange(false); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            {step === 1 ? "Are you sure?" : "Permanently delete?"}
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? <>Are you sure you want to delete <span className="font-medium text-foreground">{entityLabel}</span>?</>
              : <>Type <span className="font-mono font-semibold text-foreground">DELETE</span> in capitals to permanently remove this record. If you cancel, it will be moved to the Recycle Bin and can be restored later.</>}
          </DialogDescription>
        </DialogHeader>

        {step === 2 && (
          <Input
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="DELETE"
            className="font-mono"
          />
        )}

        <DialogFooter className="gap-2">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={close} disabled={busy}>No</Button>
              <Button variant="destructive" onClick={proceedToStep2} disabled={busy}>Yes, delete</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={soft} disabled={busy}>
                Cancel & move to Recycle Bin
              </Button>
              <Button
                variant="destructive"
                onClick={hard}
                disabled={busy || typed !== "DELETE"}
              >
                Permanently delete
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
