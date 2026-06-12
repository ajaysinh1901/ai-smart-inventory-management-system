// PDF invoice generator — server-side GST-compliant tax invoice | spec: C3
const PDFDocument = require('pdfkit');

// pdfkit's built-in Helvetica does not include the ₹ glyph; "Rs." is a safe fallback.
const RUPEE = 'Rs.';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatMoney(value) {
  const num = Number(value || 0);
  return `${RUPEE} ${num.toFixed(2)}`;
}

// Indian numbering: lakh / crore. Returns spelled-out integer rupees + paise. | spec: C3
const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigitsToWords(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return TENS[t] + (o ? ' ' + ONES[o] : '');
}

function threeDigitsToWords(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let str = '';
  if (h) str += ONES[h] + ' Hundred';
  if (rest) str += (h ? ' ' : '') + twoDigitsToWords(rest);
  return str;
}

function numberToIndianWords(num) {
  num = Math.floor(num);
  if (num === 0) return 'Zero';
  // Defensive guard — discount > subtotal used to push num negative and the
  // ONES[-N] lookup printed "undefined" on invoices. Controller now rejects
  // that input but keep this so the helper is robust on its own. | bug #004
  if (num < 0) return 'Negative ' + numberToIndianWords(-num);

  const crore = Math.floor(num / 10000000);
  num %= 10000000;
  const lakh = Math.floor(num / 100000);
  num %= 100000;
  const thousand = Math.floor(num / 1000);
  num %= 1000;
  const remainder = num;

  const parts = [];
  if (crore) parts.push(twoDigitsToWords(crore) + ' Crore');
  if (lakh) parts.push(twoDigitsToWords(lakh) + ' Lakh');
  if (thousand) parts.push(twoDigitsToWords(thousand) + ' Thousand');
  if (remainder) parts.push(threeDigitsToWords(remainder));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function amountInWords(total) {
  const totalNum = Number(total || 0);
  const rupees = Math.floor(totalNum);
  const paise = Math.round((totalNum - rupees) * 100);
  let words = `Rupees ${numberToIndianWords(rupees)}`;
  if (paise > 0) words += ` and ${numberToIndianWords(paise)} Paise`;
  words += ' Only';
  return words;
}

// ─── Renderer ────────────────────────────────────────────────────────────────
function generateInvoicePDF(sale) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const isInterstate = sale.gst?.isInterstate || false;
      const seller = sale.seller || {};
      const customer = sale.customer || {};
      const items = sale.items || [];

      const pageLeft = 40;
      const pageRight = doc.page.width - 40;
      const fullWidth = pageRight - pageLeft;

      // ── Header bar ─────────────────────────────────────────────────────────
      doc.rect(pageLeft, 40, fullWidth, 50).fill('#482de1');
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20)
        .text('TAX INVOICE', pageLeft + 14, 56);

      doc.fontSize(10).font('Helvetica')
        .text(`Invoice #: ${sale.invoiceNumber || '-'}`, pageLeft, 50, { width: fullWidth - 14, align: 'right' })
        .text(`Date: ${new Date(sale.createdAt || Date.now()).toLocaleDateString('en-IN')}`,
          pageLeft, 70, { width: fullWidth - 14, align: 'right' });

      doc.fillColor('#000000');
      let y = 110;

      // ── Seller / Buyer split ───────────────────────────────────────────────
      const colWidth = fullWidth / 2 - 8;
      doc.font('Helvetica-Bold').fontSize(10).text('FROM:', pageLeft, y);
      doc.text('BILL TO:', pageLeft + colWidth + 16, y);
      y += 14;

      doc.font('Helvetica').fontSize(9);
      const sellerLines = [
        seller.companyName || 'Your Company',
        seller.gstin ? `GSTIN: ${seller.gstin}` : '',
        seller.address || '',
        seller.state ? `State: ${seller.state}` : '',
      ].filter(Boolean);

      const customerLines = [
        customer.name || 'Walk-in Customer',
        customer.gstin ? `GSTIN: ${customer.gstin}` : '',
        customer.address || '',
        customer.state ? `State: ${customer.state}` : '',
        customer.phone ? `Phone: ${customer.phone}` : '',
        customer.email ? `Email: ${customer.email}` : '',
      ].filter(Boolean);

      const startY = y;
      sellerLines.forEach((line, idx) => doc.text(line, pageLeft, startY + idx * 12, { width: colWidth }));
      customerLines.forEach((line, idx) => doc.text(line, pageLeft + colWidth + 16, startY + idx * 12, { width: colWidth }));

      const maxLines = Math.max(sellerLines.length, customerLines.length);
      y = startY + maxLines * 12 + 14;

      doc.moveTo(pageLeft, y).lineTo(pageRight, y).strokeColor('#cccccc').stroke();
      y += 10;

      // ── Items table ────────────────────────────────────────────────────────
      const cgstRate = sale.gst?.cgstRate ?? 9;
      const sgstRate = sale.gst?.sgstRate ?? 9;
      const igstRate = sale.gst?.igstRate ?? 18;

      // Column layout (widths sum to fullWidth)
      const cols = isInterstate
        ? [
          { key: 'no', label: '#', width: 24 },
          { key: 'desc', label: 'Description', width: 175 },
          { key: 'hsn', label: 'HSN', width: 50 },
          { key: 'qty', label: 'Qty', width: 35 },
          { key: 'rate', label: 'Rate', width: 65 },
          { key: 'igst', label: `IGST ${igstRate}%`, width: 70 },
          { key: 'amount', label: 'Amount', width: 96 },
        ]
        : [
          { key: 'no', label: '#', width: 22 },
          { key: 'desc', label: 'Description', width: 145 },
          { key: 'hsn', label: 'HSN', width: 45 },
          { key: 'qty', label: 'Qty', width: 30 },
          { key: 'rate', label: 'Rate', width: 60 },
          { key: 'cgst', label: `CGST ${cgstRate}%`, width: 60 },
          { key: 'sgst', label: `SGST ${sgstRate}%`, width: 60 },
          { key: 'amount', label: 'Amount', width: 93 },
        ];

      // Header row
      doc.rect(pageLeft, y, fullWidth, 18).fill('#f3f4f6');
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8.5);
      let cx = pageLeft;
      cols.forEach((c) => {
        doc.text(c.label, cx + 4, y + 5, { width: c.width - 8, align: ['no', 'desc', 'hsn'].includes(c.key) ? 'left' : 'right' });
        cx += c.width;
      });
      y += 18;

      // Item rows
      doc.fillColor('#000000').font('Helvetica').fontSize(8.5);
      items.forEach((item, idx) => {
        const subtotal = Number(item.subtotal || 0);
        // Per-line GST share (for display only — backend stores rolled-up totals)
        const lineCgst = isInterstate ? 0 : (subtotal * cgstRate) / 100;
        const lineSgst = isInterstate ? 0 : (subtotal * sgstRate) / 100;
        const lineIgst = isInterstate ? (subtotal * igstRate) / 100 : 0;

        const values = {
          no: String(idx + 1),
          desc: item.productName || '',
          hsn: item.hsnCode || '-',
          qty: String(item.quantity || 0),
          rate: Number(item.unitPrice || 0).toFixed(2),
          cgst: lineCgst.toFixed(2),
          sgst: lineSgst.toFixed(2),
          igst: lineIgst.toFixed(2),
          amount: subtotal.toFixed(2),
        };

        const rowH = 16;
        if (idx % 2 === 1) doc.rect(pageLeft, y, fullWidth, rowH).fill('#fafafa').fillColor('#000000');

        cx = pageLeft;
        cols.forEach((c) => {
          const align = ['no', 'desc', 'hsn'].includes(c.key) ? 'left' : 'right';
          doc.fillColor('#000000').text(values[c.key] ?? '', cx + 4, y + 4, { width: c.width - 8, align });
          cx += c.width;
        });
        y += rowH;

        // Page break safety
        if (y > doc.page.height - 200) { doc.addPage(); y = 60; }
      });

      doc.moveTo(pageLeft, y).lineTo(pageRight, y).strokeColor('#cccccc').stroke();
      y += 10;

      // ── Totals (right aligned) ─────────────────────────────────────────────
      const totalsX = pageLeft + fullWidth - 220;
      const labelW = 110;
      const valueW = 110;

      const drawRow = (label, value, opts = {}) => {
        doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.bold ? 11 : 9);
        doc.fillColor('#000000');
        doc.text(label, totalsX, y, { width: labelW, align: 'left' });
        doc.text(value, totalsX + labelW, y, { width: valueW, align: 'right' });
        y += opts.bold ? 18 : 14;
      };

      drawRow('Subtotal:', formatMoney(sale.subtotal));
      if (Number(sale.discount || 0) > 0) drawRow('Discount:', `- ${formatMoney(sale.discount)}`);
      if (!isInterstate) {
        drawRow(`CGST (${cgstRate}%):`, formatMoney(sale.gst?.cgstAmount));
        drawRow(`SGST (${sgstRate}%):`, formatMoney(sale.gst?.sgstAmount));
      } else {
        drawRow(`IGST (${igstRate}%):`, formatMoney(sale.gst?.igstAmount));
      }
      doc.moveTo(totalsX, y).lineTo(totalsX + labelW + valueW, y).strokeColor('#888888').stroke();
      y += 6;
      drawRow('TOTAL:', formatMoney(sale.total), { bold: true });
      y += 4;

      // ── Amount in words ────────────────────────────────────────────────────
      doc.font('Helvetica-Oblique').fontSize(9).fillColor('#374151');
      doc.text(`Amount in words: ${amountInWords(sale.total)}`, pageLeft, y, { width: fullWidth });
      y += 24;

      // ── Notes ──────────────────────────────────────────────────────────────
      if (sale.notes) {
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000').text('Notes:', pageLeft, y);
        y += 12;
        doc.font('Helvetica').fontSize(9).fillColor('#374151').text(sale.notes, pageLeft, y, { width: fullWidth });
        y += 24;
      }

      // ── Terms + signatory ──────────────────────────────────────────────────
      doc.moveTo(pageLeft, y).lineTo(pageRight, y).strokeColor('#cccccc').stroke();
      y += 10;

      const termsX = pageLeft;
      const signX = pageLeft + fullWidth - 180;

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000').text('Terms & Conditions:', termsX, y);
      doc.font('Helvetica').fontSize(8).fillColor('#374151');
      const terms = [
        '1. Goods once sold will not be taken back.',
        '2. Subject to local jurisdiction.',
        '3. Payment due within 7 days of invoice.',
      ];
      terms.forEach((t, i) => doc.text(t, termsX, y + 14 + i * 11, { width: fullWidth - 200 }));

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#000000')
        .text('Authorized Signatory', signX, y + 50, { width: 180, align: 'center' });
      doc.moveTo(signX + 20, y + 48).lineTo(signX + 160, y + 48).strokeColor('#000000').stroke();

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateInvoicePDF, amountInWords, numberToIndianWords };
