import * as XLSX from "xlsx";

export type ReportData = {
  title: string;
  fromDate: string;
  toDate: string;
  generatedAt: string;
  cashierLabel?: string;
  kpis: Array<[string, string | number]>;
  orders: Array<Record<string, string | number>>;
  byMethod: Array<Record<string, string | number>>;
  topServices: Array<Record<string, string | number>>;
};

const MONEY_FMT = '"$"#,##0.00;[Red]("$"#,##0.00)';

function aoaSheet(rows: any[][], moneyCols: number[] = []) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  // bold header row
  for (let c = range.s.c; c <= range.e.c; c++) {
    const ref = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[ref]) ws[ref].s = { font: { bold: true } };
  }
  // currency formatting
  for (let r = 1; r <= range.e.r; r++) {
    for (const c of moneyCols) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (ws[ref] && typeof ws[ref].v === "number") ws[ref].z = MONEY_FMT;
    }
  }
  // column widths
  const colWidths: { wch: number }[] = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    let maxLen = 10;
    for (let r = range.s.r; r <= range.e.r; r++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const v = ws[ref]?.v;
      if (v != null) maxLen = Math.max(maxLen, String(v).length + 2);
    }
    colWidths.push({ wch: Math.min(maxLen, 38) });
  }
  ws["!cols"] = colWidths;
  return ws;
}

export function downloadExcelReport(data: ReportData, filename: string) {
  const wb = XLSX.utils.book_new();

  const summaryRows: any[][] = [
    ["SOI Threading & Salon"],
    [data.title],
    [`Period: ${data.fromDate} to ${data.toDate}`],
    [`Generated: ${data.generatedAt}`],
    ...(data.cashierLabel ? [[`Cashier: ${data.cashierLabel}`]] : []),
    [],
    ["Metric", "Value"],
    ...data.kpis,
  ];
  XLSX.utils.book_append_sheet(wb, aoaSheet(summaryRows, [1]), "Summary");

  if (data.orders.length) {
    const headers = Object.keys(data.orders[0]);
    const rows = [headers, ...data.orders.map((o) => headers.map((h) => o[h]))];
    const moneyCols = headers
      .map((h, i) => (/subtotal|discount|tax|tip|total|amount|revenue/i.test(h) ? i : -1))
      .filter((i) => i >= 0);
    XLSX.utils.book_append_sheet(wb, aoaSheet(rows, moneyCols), "Orders");
  }

  if (data.byMethod.length) {
    const headers = Object.keys(data.byMethod[0]);
    const rows = [headers, ...data.byMethod.map((o) => headers.map((h) => o[h]))];
    const moneyCols = headers.map((h, i) => (/amount|total/i.test(h) ? i : -1)).filter((i) => i >= 0);
    XLSX.utils.book_append_sheet(wb, aoaSheet(rows, moneyCols), "Payments");
  }

  if (data.topServices.length) {
    const headers = Object.keys(data.topServices[0]);
    const rows = [headers, ...data.topServices.map((o) => headers.map((h) => o[h]))];
    const moneyCols = headers.map((h, i) => (/amount|revenue/i.test(h) ? i : -1)).filter((i) => i >= 0);
    XLSX.utils.book_append_sheet(wb, aoaSheet(rows, moneyCols), "Top Services");
  }

  XLSX.writeFile(wb, filename);
}

export function downloadCsvOrders(orders: Array<Record<string, any>>, filename: string) {
  if (!orders.length) return;
  const headers = Object.keys(orders[0]);
  const csv = [headers, ...orders.map((o) => headers.map((h) => o[h]))]
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
