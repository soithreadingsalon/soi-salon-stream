import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const ROWS: [string, string][] = [
  ["/  or  Ctrl/⌘+K", "Focus the search box"],
  ["1 – 9", "Switch service category"],
  ["G", "Open Gift Card dialog"],
  ["M", "Open Membership dialog"],
  ["C", "Open Customer picker"],
  ["Enter", "Open Pay dialog (when cart has items)"],
  ["1 / 2 / 3", "In Pay dialog: Cash / Card / Zelle"],
  ["Esc", "Close any open dialog"],
  ["Shift + ?", "Show this help"],
];

export function ShortcutsDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <ul className="divide-y divide-border text-sm">
          {ROWS.map(([key, desc]) => (
            <li key={key} className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">{desc}</span>
              <kbd className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-semibold text-foreground">
                {key}
              </kbd>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
