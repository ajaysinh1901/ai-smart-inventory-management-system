// Tally XML export — produces a TallyPrime "Import Data" envelope of Sales
// Vouchers from a date range of Sales documents.
//
// Tally is the dominant accounting tool in the Indian SMB segment, and the
// vast majority of CAs ask for data in this exact XML shape so they can paste
// it into Tally's "Import Data" wizard. Mismatches in ledger names cause
// silent import failures (Tally beeps and skips the voucher) — so the ledger
// strings here MUST match the customer's Tally ledger setup exactly. We use
// the most common defaults; the controller can swap them in future.
//
// Spec reference: TallyPrime XML envelope, voucher type "Sales".

// XML 1.0 disallows ASCII 0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F. We also escape
// the five named entities. Failure to escape will silently break the import
// at the offending row — Tally won't tell us which one.
function xmlEscape(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Tally wants `YYYYMMDD` with no separators — anything else fails silently.
function tallyDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// 2-decimal number formatter — Tally is strict about trailing zeros for
// monetary fields.
function money(n) {
  return Number(n || 0).toFixed(2);
}

// Build a single <VOUCHER> entry from a Sale doc. We use INVENTORYENTRIES
// (stockful) since SmartStock AI is inventory-first; service-only invoices
// would use LEDGERENTRIES instead.
function voucherForSale(sale, opts) {
  const isInterstate = sale.gst?.isInterstate || false;
  const partyName = sale.customer?.name || 'Walk-in Customer';
  const date = tallyDate(sale.createdAt);
  const total = Number(sale.total || 0);

  // Tally signs: in a Sales voucher, the party (debtor) is positive (debit),
  // the sales + tax ledgers are negative (credit). Tally uses the leading
  // hyphen as the credit indicator.
  const partyAmount = money(total);

  // Each line item becomes one INVENTORYENTRIES.LIST entry with its stock
  // movement, plus the corresponding sales-account ledger allocation.
  const inventoryEntries = (sale.items || []).map((it) => {
    const lineSubtotal = Number(it.subtotal || it.unitPrice * it.quantity || 0);
    return `
        <INVENTORYENTRIES.LIST>
          <STOCKITEMNAME>${xmlEscape(it.productName)}</STOCKITEMNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <RATE>${money(it.unitPrice)}/Nos</RATE>
          <AMOUNT>-${money(lineSubtotal)}</AMOUNT>
          <ACTUALQTY>${it.quantity} Nos</ACTUALQTY>
          <BILLEDQTY>${it.quantity} Nos</BILLEDQTY>
          <ACCOUNTINGALLOCATIONS.LIST>
            <LEDGERNAME>${xmlEscape(opts.salesLedger)}</LEDGERNAME>
            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
            <AMOUNT>-${money(lineSubtotal)}</AMOUNT>
          </ACCOUNTINGALLOCATIONS.LIST>
        </INVENTORYENTRIES.LIST>`;
  }).join('');

  // Tax ledger allocations — CGST+SGST for intra-state, IGST for inter.
  const cgst = Number(sale.gst?.cgstAmount || 0);
  const sgst = Number(sale.gst?.sgstAmount || 0);
  const igst = Number(sale.gst?.igstAmount || 0);

  const taxLedgers = isInterstate
    ? igst > 0
      ? `
        <LEDGERENTRIES.LIST>
          <LEDGERNAME>${xmlEscape(opts.igstLedger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>-${money(igst)}</AMOUNT>
        </LEDGERENTRIES.LIST>`
      : ''
    : `
        ${cgst > 0 ? `<LEDGERENTRIES.LIST>
          <LEDGERNAME>${xmlEscape(opts.cgstLedger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>-${money(cgst)}</AMOUNT>
        </LEDGERENTRIES.LIST>` : ''}
        ${sgst > 0 ? `<LEDGERENTRIES.LIST>
          <LEDGERNAME>${xmlEscape(opts.sgstLedger)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>-${money(sgst)}</AMOUNT>
        </LEDGERENTRIES.LIST>` : ''}`;

  return `
    <VOUCHER REMOTEID="${xmlEscape(sale._id)}" VCHKEY="${xmlEscape(sale.invoiceNumber)}" VCHTYPE="Sales" ACTION="Create">
      <DATE>${date}</DATE>
      <REFERENCEDATE>${date}</REFERENCEDATE>
      <REFERENCE>${xmlEscape(sale.invoiceNumber)}</REFERENCE>
      <NARRATION>Invoice ${xmlEscape(sale.invoiceNumber)} — ${xmlEscape(partyName)}</NARRATION>
      <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      <VOUCHERNUMBER>${xmlEscape(sale.invoiceNumber)}</VOUCHERNUMBER>
      <PARTYLEDGERNAME>${xmlEscape(partyName)}</PARTYLEDGERNAME>
      <PARTYNAME>${xmlEscape(partyName)}</PARTYNAME>
      <BASICBUYERNAME>${xmlEscape(partyName)}</BASICBUYERNAME>
      <STATENAME>${xmlEscape(sale.customer?.state || '')}</STATENAME>
      <PLACEOFSUPPLY>${xmlEscape(sale.customer?.state || '')}</PLACEOFSUPPLY>
      <PARTYGSTIN>${xmlEscape(sale.customer?.gstin || '')}</PARTYGSTIN>
      <ISINVOICE>Yes</ISINVOICE>
      <EFFECTIVEDATE>${date}</EFFECTIVEDATE>
      <LEDGERENTRIES.LIST>
        <LEDGERNAME>${xmlEscape(partyName)}</LEDGERNAME>
        <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
        <AMOUNT>${partyAmount}</AMOUNT>
      </LEDGERENTRIES.LIST>${inventoryEntries}${taxLedgers}
    </VOUCHER>`;
}

// Public entry point — wraps an array of Sale docs into the full TallyPrime
// envelope. Caller is expected to send the result with a UTF-8 BOM and
// Content-Type "application/xml".
function buildSalesEnvelope(sales, opts = {}) {
  const config = {
    salesLedger: opts.salesLedger || 'Sales Account',
    cgstLedger:  opts.cgstLedger  || 'CGST @ 9%',
    sgstLedger:  opts.sgstLedger  || 'SGST @ 9%',
    igstLedger:  opts.igstLedger  || 'IGST @ 18%',
    companyName: opts.companyName || 'SmartStock Export',
  };

  const vouchers = (sales || []).map((s) => voucherForSale(s, config)).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>Vouchers</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>${xmlEscape(config.companyName)}</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>${vouchers}
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;
}

module.exports = { buildSalesEnvelope };
