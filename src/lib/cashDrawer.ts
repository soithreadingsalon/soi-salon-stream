/**
 * Cash drawer abstraction for SOI POS.
 *
 * Browsers can't open a USB/serial cash drawer directly. In practice you need
 * ONE of these on the workstation:
 *   1. A receipt printer with the drawer kick port wired through → trigger via
 *      window.print() of a receipt that includes the ESC/POS kick bytes, OR
 *   2. A network-attached ESC/POS printer (port 9100) → POST raw bytes to it
 *      via a tiny local bridge (the browser cannot open raw TCP), OR
 *   3. A local POS bridge service (Electron / Node helper) on http://localhost
 *      that exposes POST /open-drawer.
 *
 * For (2) and (3) we do `fetch("http://<ip>:<port>/open-drawer", ...)` and
 * the local bridge translates that into ESC p m t1 t2 = [27,112,0,25,250].
 *
 * If no bridge is reachable we degrade gracefully and the transaction is
 * still saved with cash_drawer_status = 'failed'.
 */

export type CashDrawerStatus = "not_applicable" | "opened" | "failed" | "disabled";

export type CashDrawerSettings = {
  cash_drawer_enabled?: boolean | null;
  cash_drawer_connection_type?: string | null; // 'disabled'|'manual'|'receipt_printer'|'escpos_network'|'escpos_usb'
  cash_drawer_printer_ip?: string | null;
  cash_drawer_printer_port?: number | null;
};

/** Standard ESC/POS cash drawer kick command: ESC p m t1 t2 */
export const ESC_POS_KICK = new Uint8Array([27, 112, 0, 25, 250]);

export async function openCashDrawer(
  settings: CashDrawerSettings | null | undefined,
): Promise<CashDrawerStatus> {
  if (!settings?.cash_drawer_enabled) return "disabled";

  const mode = settings.cash_drawer_connection_type ?? "manual";

  try {
    switch (mode) {
      case "disabled":
        return "disabled";

      case "manual":
        // Worker opens the drawer themselves. Treat as success so we don't alarm them.
        return "opened";

      case "receipt_printer":
        // The receipt template embeds the kick bytes; printing the receipt
        // fires the drawer. The POS calls window.print() on success.
        if (typeof window !== "undefined") window.print();
        return "opened";

      case "escpos_network": {
        const ip = settings.cash_drawer_printer_ip;
        const port = settings.cash_drawer_printer_port ?? 9100;
        if (!ip) return "failed";
        // Requires a local POS bridge listening on this IP:port that accepts
        // raw ESC/POS bytes. Browsers can't open raw TCP sockets directly.
        const res = await fetch(`http://${ip}:${port}/open-drawer`, {
          method: "POST",
          body: ESC_POS_KICK,
          // CORS will block this unless the local bridge sends
          // Access-Control-Allow-Origin: *.
        });
        return res.ok ? "opened" : "failed";
      }

      case "escpos_usb": {
        // WebUSB requires a user-initiated permission grant and a driver-side
        // bridge for the specific printer. Stubbed — wire to your local helper.
        // TODO: integrate WebUSB or local helper for USB ESC/POS printer.
        return "failed";
      }

      default:
        return "failed";
    }
  } catch (err) {
    console.warn("[cashDrawer] open failed:", err);
    return "failed";
  }
}
