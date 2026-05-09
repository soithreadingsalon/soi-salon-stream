export function SoiLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gradient-gold shadow-soft">
        <span className="font-display text-xl font-semibold text-primary">S</span>
      </div>
      <div className="leading-tight">
        <div className="font-display text-lg font-semibold tracking-wide text-foreground">
          SOI
        </div>
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Threading Salon
        </div>
      </div>
    </div>
  );
}
