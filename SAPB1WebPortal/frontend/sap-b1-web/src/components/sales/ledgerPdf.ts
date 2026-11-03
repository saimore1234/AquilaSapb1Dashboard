import type { CustomerLedger } from '../../types';
import { isNative } from '../../native/platform';
import { shareFile } from '../../native/files';

const amount = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (v: number) => (v ? amount.format(v) : '');
/** Ledger balances are debit-positive: Dr when >= 0, Cr when negative. */
const bal = (v: number) => `${amount.format(Math.abs(v))} ${v < 0 ? 'Cr' : 'Dr'}`;
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

/**
 * Builds the A4 customer account statement from the ledger API response (no balances are recomputed here) and saves it.
 * jsPDF is imported on demand so it stays out of the main bundle.
 */
export async function downloadLedgerPdf(data: CustomerLedger, companyName?: string | null) {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const autoTable = autoTableMod.default;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 12;
  const navy: [number, number, number] = [30, 58, 95];
  const grey: [number, number, number] = [100, 100, 100];
  const from = ddmmyyyy(data.dateFrom);
  const to = ddmmyyyy(data.dateTo);
  const company = data.companyName || companyName || '';

  // ---- Letterhead
  let y = M + 4;
  doc.setFont('helvetica', 'bold').setFontSize(15).setTextColor(...navy);
  doc.text(company || 'Statement of Account', M, y);
  y += 5;
  doc.setFont('helvetica', 'normal').setFontSize(8.5).setTextColor(...grey);
  if (data.companyAddress) {
    const lines = doc.splitTextToSize(data.companyAddress.replace(/\s*,\s*,+/g, ', ').replace(/\s+/g, ' '), W - 2 * M - 50) as string[];
    doc.text(lines, M, y);
    y += lines.length * 4;
  }
  if (data.companyGstin) { doc.text(`GSTIN: ${data.companyGstin}`, M, y); y += 4; }
  doc.setDrawColor(...navy).setLineWidth(0.6).line(M, y, W - M, y);
  y += 7;

  doc.setFont('helvetica', 'bold').setFontSize(12).setTextColor(0, 0, 0);
  doc.text('CUSTOMER ACCOUNT STATEMENT', W / 2, y, { align: 'center' });
  y += 7;

  // ---- Customer block (left) and period (right)
  const boxTop = y;
  doc.setFontSize(8).setTextColor(...grey).setFont('helvetica', 'bold');
  doc.text('CUSTOMER', M, y);
  doc.text('STATEMENT PERIOD', W - M - 55, y);
  y += 4.5;
  doc.setFontSize(10).setTextColor(0, 0, 0);
  doc.text(data.customerName || data.customerCode, M, y);
  doc.setFont('helvetica', 'normal').setFontSize(8.5);
  doc.text(`From: ${from}`, W - M - 55, y);
  let ly = y + 4.5;
  doc.text(`Customer Code: ${data.customerCode}`, M, ly);
  doc.text(`To: ${to}`, W - M - 55, ly);
  ly += 4;
  if (data.address || data.city) {
    const lines = doc.splitTextToSize(data.address || data.city || '', W - 2 * M - 70) as string[];
    doc.text(lines, M, ly);
    ly += lines.length * 4;
  }
  const gstin = data.gstin || data.taxNo;
  if (gstin) { doc.text(`GSTIN: ${gstin}`, M, ly); ly += 4; }
  y = Math.max(ly, boxTop + 16) + 2;

  // ---- Summary
  const sum: [string, string][] = [
    ['Opening Balance', bal(data.openingBalance)],
    ['Total Debit', amount.format(data.totalDebit)],
    ['Total Credit', amount.format(data.totalCredit)],
    ['Closing Balance', bal(data.closingBalance)]
  ];
  const cw = (W - 2 * M) / 4;
  doc.setDrawColor(200, 200, 200).setLineWidth(0.2);
  sum.forEach(([label, value], i) => {
    const x = M + i * cw;
    doc.setFillColor(i === 3 ? 232 : 245, i === 3 ? 238 : 247, i === 3 ? 247 : 250).rect(x, y, cw, 13, 'FD');
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...grey).text(label.toUpperCase(), x + 2.5, y + 4.5);
    doc.setFont('helvetica', 'bold').setFontSize(10).setTextColor(0, 0, 0).text(value, x + 2.5, y + 10);
  });
  y += 18;

  if (data.truncated) {
    doc.setFont('helvetica', 'bold').setFontSize(8).setTextColor(180, 40, 40);
    doc.text('Note: this period has more postings than could be listed; the closing balance is that of the rows shown.', M, y);
    y += 5;
  }

  // ---- Transactions
  const body = [
    [{ content: '', styles: {} }, '', '', { content: 'Opening Balance', styles: { fontStyle: 'bold' as const } }, '', '', { content: bal(data.openingBalance), styles: { fontStyle: 'bold' as const } }],
    ...data.rows.map((r) => [ddmmyyyy(r.date.slice(0, 10)), r.docType, r.docNo ?? '', r.particulars ?? '', money(r.debit), money(r.credit), bal(r.balance)])
  ];
  autoTable(doc, {
    startY: y,
    head: [['Date', 'Document Type', 'Doc No.', 'Particulars', 'Debit', 'Credit', 'Balance']],
    body,
    foot: [[{ content: 'Closing Balance', colSpan: 4, styles: { halign: 'left' } }, amount.format(data.totalDebit), amount.format(data.totalCredit), bal(data.closingBalance)]],
    showFoot: 'lastPage',
    showHead: 'everyPage',
    theme: 'grid',
    margin: { left: M, right: M, bottom: 16 },
    styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 1.6, lineColor: [210, 210, 210], lineWidth: 0.15, overflow: 'linebreak', textColor: [20, 20, 20] },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', halign: 'center' },
    footStyles: { fillColor: [232, 238, 247], textColor: 0, fontStyle: 'bold', halign: 'right' },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    columnStyles: {
      0: { cellWidth: 19 }, 1: { cellWidth: 27 }, 2: { cellWidth: 18 }, 3: { cellWidth: 'auto' },
      4: { halign: 'right', cellWidth: 24 }, 5: { halign: 'right', cellWidth: 24 }, 6: { halign: 'right', cellWidth: 29 }
    }
  });

  if (data.rows.length === 0) {
    const endY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    doc.setFont('helvetica', 'italic').setFontSize(9).setTextColor(...grey).text('No postings in this period.', W / 2, endY + 8, { align: 'center' });
  }

  // ---- Footer on every page (page numbers need the final count, so this runs after the table)
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(200, 200, 200).setLineWidth(0.2).line(M, H - 12, W - M, H - 12);
    doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...grey);
    doc.text(`${company ? company + ' · ' : ''}${data.customerCode} · Statement ${from} to ${to} · Amounts in INR · Dr = debit balance, Cr = credit balance`, M, H - 8);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 8, { align: 'right' });
  }

  const filename = `CustomerStatement_${data.customerCode}_${from}_to_${to}.pdf`;
  if (isNative) { await shareFile(filename, doc.output('blob'), filename); return; }
  doc.save(filename);
}
