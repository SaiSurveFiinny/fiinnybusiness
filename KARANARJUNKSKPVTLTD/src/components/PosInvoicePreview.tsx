import UpiQrCode from './UpiQrCode';
import { getInvoiceProductCategories, getApplicableLicenses } from '../utils/invoiceCategories';

// ── English fallback for the L() translation helper ─────────────────────────
// When the component is used without a translation function (e.g. from
// InvoiceSettingsPage), labels fall back to English so the preview is readable.
const EN: Record<string, string> = {
    gst_invoice: 'GST INVOICE',
    cash_bill: 'CASH BILL',
    credit_bill: 'CREDIT BILL',
    item_description: 'Item Descriptions',
    company: 'Company',
    batch_no: 'Batch',
    exp_date: 'Exp',
    gst_pct: 'GST%',
    per: 'Per',
    qty: 'Qty',
    rate: 'Rate',
    gross_amount: 'Amount',
    sno: '#',
    total: 'TOTAL',
    discount: 'Discount',
    transport_charges: 'Transport',
    labor_charges: 'Labour',
    round_off: 'Round Off',
    net_amount: 'NET AMOUNT',
    amount_paid: 'Amount Paid',
    credit_amount: 'Credit Amount',
    previous_outstanding: 'Previous Outstanding',
    total_payable: 'Total Payable',
    amount_in_words: 'Amount in Words',
    declaration: 'Declaration',
    declaration_text: 'We certify that the details in this invoice are true and correct. Goods once sold are not eligible for a full refund.',
    scan_to_pay: 'Scan to Pay',
    for_business: 'For',
    authorised_signatory: 'Authorised Signatory',
    taxable: 'Taxable',
    cgst: 'CGST',
    sgst: 'SGST',
    total_tax: 'Total Tax',
    output_cgst: 'Output CGST',
    output_sgst: 'Output SGST',
    buyer_title: 'Buyer',
    contact: 'Contact',
    bill_no: 'Bill No',
    bill_date: 'Date',
    mode_of_payment: 'Mode',
};
const defaultL = (key: string): string => EN[key] ?? key;

// ── Helper functions (exported so POSPage can import them) ───────────────────

export function numberToWords(num: number): string {
    if (!num || num < 0) return 'Zero only';
    if (num === 0) return 'Zero only';
    const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
        'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
        'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const convert = (n: number): string => {
        if (n < 20) return ones[n];
        if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
        if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + convert(n % 100) : '');
        if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
        if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + convert(n % 100000) : '');
        return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + convert(n % 10000000) : '');
    };
    const intPart = Math.floor(num);
    const decPart = Math.round((num - intPart) * 100);
    let result = convert(intPart);
    if (decPart > 0) result += ' and ' + convert(decPart) + ' Paise';
    return result + ' only';
}

// "2026-03" or "2026-03-15" → "03/26" for compact display
export function toMonthYear(val: string): string {
    // Matches YYYY-MM or YYYY-MM-DD; we only need year+month
    const m = /^(\d{4})-(\d{2})/.exec((val || '').trim());
    return m ? `${m[2]}/${m[1].slice(2)}` : (val || '');
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PosInvoiceItem {
    name: string;
    mfgCompany?: string;
    batchNo?: string;
    expDate?: string;
    gstPct?: number;
    unit?: string;
    baseUnit?: string;
    cartQuantity: number;
    cartTotal: number;
    sellingPrice?: number;
    maxRetailPrice?: number;
    type?: string;
}

export interface PosInvoiceCustomer {
    name?: string;
    phone?: string;
    address?: string;
    pin?: string;
}

export interface PosInvoiceBranding {
    businessName?: string;
    address?: string;
    gstin?: string;
    contact?: string;
    logoUrl?: string;
    signatureUrl?: string;
    signatureName?: string;
    upiId?: string;
    fertilizerLicense?: string;
    pesticideLicense?: string;
    seedsLicense?: string;
}

interface Props {
    cart: PosInvoiceItem[];
    customer: PosInvoiceCustomer;
    branding: PosInvoiceBranding | null;
    billNumber: string;
    discount?: number;
    transportCharges?: number;
    laborCharges?: number;
    grandTotal: number;
    creditPaidNow?: number;
    creditAmount?: number;
    billFormat?: 'A4' | 'A5';
    invoiceDate?: string;
    modeOfPayment?: string;
    previousOutstanding?: number;
    L?: (key: string) => string;
}

// ── Component — single source of truth for the POS GST invoice layout ────────

export function PosInvoicePreview({
    cart,
    customer,
    branding,
    billNumber,
    discount = 0,
    transportCharges = 0,
    laborCharges = 0,
    grandTotal,
    creditPaidNow = 0,
    creditAmount = 0,
    billFormat = 'A5',
    invoiceDate,
    modeOfPayment = 'Cash',
    previousOutstanding = 0,
    L = defaultL,
}: Props) {
    const fmt = (n: number) => (Number.isFinite(n) ? n : 0).toFixed(2);
    const lineGst = (i: PosInvoiceItem) => (typeof i.gstPct === 'number' ? i.gstPct : 5);
    const rate = (i: PosInvoiceItem) => Number(i.sellingPrice) || Number(i.maxRetailPrice) || 0;

    const taxable = cart.reduce((s, i) => s + (i.cartTotal || 0) / (1 + lineGst(i) / 100), 0);
    const cgst = cart.reduce((s, i) => { const g = lineGst(i); return s + ((i.cartTotal || 0) / (1 + g / 100)) * (g / 2) / 100; }, 0);
    const sgst = cgst;
    const tax = cgst + sgst;
    const net = Math.round(grandTotal || 0);
    const roundOff = net - (taxable + tax + (transportCharges || 0) + (laborCharges || 0) - (discount || 0));
    const sellerName = branding?.businessName || 'Your Business Name';
    const isA5 = billFormat === 'A5';
    const baseFont = isA5 ? '0.65rem' : '0.82rem';
    const dateLabel = invoiceDate || new Date().toISOString().split('T')[0];
    const activeCats = getInvoiceProductCategories(cart);

    return (
        <div style={{ padding: isA5 ? '4mm 6mm' : '12mm', fontFamily: "'Times New Roman', serif", background: '#fff', color: '#000', fontSize: baseFont }}>
            <style>{`
                @media print { @page { size: ${isA5 ? 'A5 landscape' : 'A4'}; margin: ${isA5 ? '4mm' : '10mm'}; } }
                .kaprint-table { border-collapse: collapse; width: 100%; }
                .kaprint-table th, .kaprint-table td { border: 1px solid #222; padding: ${isA5 ? '1px 2px' : '3px 5px'}; font-size: ${baseFont}; }
                .kaprint-table th { background: #f2f2f2; font-weight: 700; text-align: center; }
                * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            `}</style>

            {isA5 ? (
                // ── A5 LANDSCAPE — Reference Invoice Redesign ─────────────────
                <div style={{ border: '1.5px solid #333', fontFamily: 'Arial, Helvetica, sans-serif' }}>

                    {/* ══ HEADER ══════════════════════════════════════════════════ */}
                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr 112px', borderBottom: '1.5px solid #333' }}>

                        {/* Left: Invoice type badge */}
                        <div style={{ borderRight: '1px solid #aaa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4px 6px', gap: '4px' }}>
                            <div style={{ fontWeight: 900, fontSize: '0.72rem', letterSpacing: '0.04em', textAlign: 'center' as const, lineHeight: 1.1 }}>GST<br />INVOICE</div>
                            <div style={{ width: '100%', border: '1px solid #555', padding: '1px 3px', fontSize: '0.58rem', fontWeight: 700, textAlign: 'center' as const }}>
                                {modeOfPayment === 'Khata' || modeOfPayment === 'Credit' ? L('credit_bill') : L('cash_bill')}
                            </div>
                        </div>

                        {/* Center: Business name + address + GSTIN + licenses */}
                        <div style={{ borderRight: '1px solid #aaa', padding: '4px 8px', textAlign: 'center' as const, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center' }}>
                                {branding?.logoUrl && <img src={branding.logoUrl} alt="Logo" style={{ height: '24px', objectFit: 'contain' }} />}
                                <div style={{ fontWeight: 900, fontSize: '1.05rem', lineHeight: 1.1, letterSpacing: '-0.01em' }}>{sellerName}</div>
                            </div>
                            {branding?.address && <div style={{ fontSize: '0.55rem', color: '#333', lineHeight: 1.4 }}>{branding.address}</div>}
                            <div style={{ fontSize: '0.55rem', color: '#333', display: 'flex', gap: '6px', flexWrap: 'wrap' as const, justifyContent: 'center' }}>
                                {branding?.gstin && <span><strong>GSTIN:</strong> {branding.gstin}</span>}
                                {branding?.contact && <span>| <strong>Ph:</strong> {branding.contact}</span>}
                            </div>
                            {getApplicableLicenses(activeCats, branding).length > 0 && (
                                <div style={{ fontSize: '0.50rem', color: '#555', borderTop: '1px dashed #ccc', marginTop: '2px', paddingTop: '1.5px', display: 'flex', gap: '6px', flexWrap: 'wrap' as const, justifyContent: 'center' }}>
                                    {getApplicableLicenses(activeCats, branding).map(lic => (
                                        <span key={lic.label}><strong>{lic.label}:</strong> {lic.number}</span>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Right: Bill meta */}
                        <div style={{ padding: '4px 7px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2px', fontSize: '0.56rem' }}>
                            <div style={{ display: 'flex', gap: '3px' }}><strong style={{ whiteSpace: 'nowrap' }}>Bill No:</strong><span style={{ fontWeight: 900 }}>{billNumber}</span></div>
                            <div style={{ display: 'flex', gap: '3px' }}><strong style={{ whiteSpace: 'nowrap' }}>Date:</strong><span>{dateLabel}</span></div>
                            <div style={{ display: 'flex', gap: '3px' }}><strong style={{ whiteSpace: 'nowrap' }}>Mode:</strong><span>{modeOfPayment}</span></div>
                        </div>
                    </div>

                    {/* ══ CUSTOMER ROW ════════════════════════════════════════════ */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2.4fr 0.9fr 2fr 0.65fr', borderBottom: '1px solid #aaa', fontSize: '0.57rem' }}>
                        <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'baseline' }}>
                            <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>Buyer:</strong>
                            <span style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.name || '—'}</span>
                        </div>
                        <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'baseline' }}>
                            <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>Ph:</strong>
                            <span>{customer.phone || '—'}</span>
                        </div>
                        <div style={{ borderRight: '1px solid #ccc', padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'baseline' }}>
                            <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>Addr:</strong>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{customer.address || '—'}</span>
                        </div>
                        <div style={{ padding: '2px 6px', display: 'flex', gap: '3px', alignItems: 'baseline' }}>
                            <strong style={{ color: '#666', whiteSpace: 'nowrap', flexShrink: 0 }}>PIN:</strong>
                            <span>{customer.pin || '—'}</span>
                        </div>
                    </div>

                    {/* ══ ITEMS TABLE ══════════════════════════════════════════════ */}
                    {/* Column widths in % so they scale identically on screen and print.
                        Product is left as auto so it absorbs all remaining space (~38%). */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.62rem', tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: '2.5%' }} />   {/* # */}
                            <col />                              {/* Product — auto (~38%) */}
                            <col style={{ width: '11%' }} />    {/* Company */}
                            <col style={{ width: '9.5%' }} />   {/* Batch */}
                            <col style={{ width: '6%' }} />     {/* Exp */}
                            <col style={{ width: '4.5%' }} />   {/* Per */}
                            <col style={{ width: '5%' }} />     {/* Qty */}
                            <col style={{ width: '8.5%' }} />   {/* Rate */}
                            <col style={{ width: '5%' }} />     {/* GST% */}
                            <col style={{ width: '10%' }} />    {/* Amount */}
                        </colgroup>
                        <thead>
                            <tr style={{ background: '#f5f5f5', borderBottom: '1.5px solid #333' }}>
                                {([
                                    ['#', 'center', '2px 1px'],
                                    ['Product', 'left', '2px 4px'],
                                    ['Company', 'center', '2px 2px'],
                                    ['Batch No.', 'center', '2px 2px'],
                                    ['Exp', 'center', '2px 1px'],
                                    ['Per', 'center', '2px 1px'],
                                    ['Qty', 'center', '2px 1px'],
                                    ['Rate', 'right', '2px 3px'],
                                    ['GST%', 'center', '2px 1px'],
                                    ['Amount', 'right', '2px 3px'],
                                ] as const).map(([label, align, pad]) => (
                                    <th key={label} style={{ border: '1px solid #ccc', padding: pad, textAlign: align as const, fontWeight: 700, fontSize: '0.60rem', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {cart.map((item, i) => (
                                <tr key={i}>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 1px', textAlign: 'center' as const }}>{i + 1}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>{item.name}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 2px', textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.mfgCompany || ''}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 2px', textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.batchNo || ''}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 1px', textAlign: 'center' as const, whiteSpace: 'nowrap' }}>{toMonthYear(item.expDate || '')}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 1px', textAlign: 'center' as const, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.unit || item.baseUnit || ''}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 1px', textAlign: 'center' as const, fontWeight: 700 }}>{item.cartQuantity}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 3px', textAlign: 'right' as const }}>{rate(item)}</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 1px', textAlign: 'center' as const }}>{lineGst(item)}%</td>
                                    <td style={{ border: '1px solid #e0e0e0', padding: '1.5px 3px', textAlign: 'right' as const, fontWeight: 700 }}>{fmt(item.cartTotal)}</td>
                                </tr>
                            ))}
                            {Array.from({ length: Math.max(0, 5 - cart.length) }).map((_, i) => (
                                <tr key={`e-${i}`} style={{ height: '13px' }}>
                                    {Array.from({ length: 10 }).map((_, j) => <td key={j} style={{ border: '1px solid #e0e0e0' }}></td>)}
                                </tr>
                            ))}
                            <tr style={{ background: '#f5f5f5', borderTop: '1.5px solid #333' }}>
                                <td colSpan={9} style={{ border: '1px solid #ccc', padding: '2px 6px', textAlign: 'right' as const, fontWeight: 800, fontSize: '0.62rem', textTransform: 'uppercase' as const }}>Total</td>
                                <td style={{ border: '1px solid #ccc', padding: '2px 3px', textAlign: 'right' as const, fontWeight: 900, fontSize: '0.62rem' }}>{fmt(taxable + tax)}</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* ══ FOOTER ══════════════════════════════════════════════════ */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1.1fr 0.68fr', borderTop: '1.5px solid #333' }}>

                        {/* Col 1: GST Summary + Declaration */}
                        <div style={{ borderRight: '1px solid #aaa', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ background: '#f5f5f5', padding: '1.5px 5px', borderBottom: '1px solid #ccc', fontSize: '0.52rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.05em', textAlign: 'center' as const }}>GST Summary</div>
                            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.52rem' }}>
                                <thead>
                                    <tr>
                                        {['Taxable', 'CGST 2.5%', 'SGST 2.5%', 'Total Tax'].map(h => (
                                            <th key={h} style={{ border: '1px solid #ddd', padding: '1.5px 2px', textAlign: 'center' as const, background: '#fafafa', fontWeight: 700 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        {[taxable, cgst, sgst, tax].map((v, vi) => (
                                            <td key={vi} style={{ border: '1px solid #ddd', padding: '1.5px 2px', textAlign: 'center' as const }}>{fmt(v)}</td>
                                        ))}
                                    </tr>
                                </tbody>
                            </table>
                            <div style={{ padding: '3px 5px', fontSize: '0.46rem', color: '#555', lineHeight: 1.35, flex: 1 }}>
                                <strong>{L('declaration')}:</strong> {L('declaration_text')}
                            </div>
                        </div>

                        {/* Col 2: Net Amount + Words + Categories */}
                        <div style={{ borderRight: '1px solid #aaa', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ padding: '3px 6px', flex: 1, fontSize: '0.56rem', display: 'flex', flexDirection: 'column', gap: '1.5px' }}>
                                {discount > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E7D32' }}>
                                        <span>{L('discount')}</span><span>-{fmt(discount)}</span>
                                    </div>
                                )}
                                {transportCharges > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('transport_charges')}</span><span>+{fmt(transportCharges)}</span></div>
                                )}
                                {laborCharges > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('labor_charges')}</span><span>+{fmt(laborCharges)}</span></div>
                                )}
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>{L('round_off')}</span><span>{fmt(roundOff)}</span>
                                </div>
                                <div style={{ borderTop: '1.5px solid #333', paddingTop: '1.5px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '0.70rem' }}>
                                    <span>{L('net_amount')}</span><span>₹{net.toLocaleString('en-IN')}</span>
                                </div>
                                {(modeOfPayment === 'Khata' || modeOfPayment === 'Credit') && (<>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E7D32' }}>
                                        <span>{L('amount_paid')}</span><span>₹{Number(creditPaidNow).toLocaleString('en-IN')}</span>
                                    </div>
                                    <div style={{ borderTop: '1px solid #555', paddingTop: '1px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, color: creditAmount > 0 ? '#c62828' : '#2E7D32' }}>
                                        <span>{L('credit_amount')}</span><span>₹{Number(creditAmount).toLocaleString('en-IN')}</span>
                                    </div>
                                </>)}
                                {previousOutstanding > 0 && (<>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#c62828' }}>
                                        <span>{L('previous_outstanding')} (Dr)</span><span>₹{Number(previousOutstanding).toLocaleString('en-IN')}</span>
                                    </div>
                                    <div style={{ borderTop: '1.5px solid #333', paddingTop: '1.5px', display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                                        <span>{L('total_payable')}</span><span>₹{(net + Number(previousOutstanding)).toLocaleString('en-IN')}</span>
                                    </div>
                                </>)}
                            </div>
                            <div style={{ borderTop: '1px solid #ddd', padding: '2px 6px', fontSize: '0.48rem', lineHeight: 1.3 }}>
                                <strong>{L('amount_in_words')}:</strong> <span style={{ fontStyle: 'italic' }}>INR {numberToWords(net)}</span>
                            </div>
                            <div style={{ borderTop: '1px solid #ddd', padding: '2px 6px' }}>
                                <span style={{ fontSize: '0.46rem', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '0.04em' }}>Category: </span>
                                {activeCats.map(cat => (
                                    <span key={cat} style={{ fontSize: '0.46rem', border: '1px solid #777', padding: '0px 3px', fontWeight: 600, marginLeft: '2px', background: '#e8f5e9' }}>✓ {cat}</span>
                                ))}
                            </div>
                        </div>

                        {/* Col 3: Signatures + optional QR */}
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ flex: 1, borderBottom: '1px solid #ccc', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '3px 6px', alignItems: 'center', minHeight: '42px' }}>
                                <div style={{ borderTop: '1px solid #555', paddingTop: '2px', fontSize: '0.50rem', fontWeight: 700, textAlign: 'center' as const, width: '100%' }}>Customer Signature</div>
                            </div>
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '3px 6px', alignItems: 'center', minHeight: '42px' }}>
                                {branding?.signatureUrl && (
                                    <img src={branding.signatureUrl} alt="" style={{ height: '22px', maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto 2px' }} />
                                )}
                                <div style={{ borderTop: '1px solid #555', paddingTop: '2px', fontSize: '0.50rem', fontWeight: 700, textAlign: 'center' as const, width: '100%' }}>Authorized Signature</div>
                            </div>
                            {branding?.upiId && (
                                <div style={{ borderTop: '1px solid #ddd', textAlign: 'center' as const, padding: '2px 5px' }}>
                                    <UpiQrCode upiId={branding.upiId} payeeName={sellerName} amount={net} transactionNote={billNumber} size={38} />
                                    <div style={{ fontSize: '6px' }}>{L('scan_to_pay')}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : (
                // ── A4 PORTRAIT ───────────────────────────────────────────────
                <>
                    <div style={{ textAlign: 'center', fontWeight: 700, letterSpacing: '0.15em', marginBottom: '2px' }}>{L('gst_invoice')}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #111', paddingBottom: '6px', marginBottom: '8px', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {branding?.logoUrl && <img src={branding.logoUrl} alt="Logo" style={{ height: '44px', objectFit: 'contain' }} />}
                            <div>
                                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 900 }}>{sellerName}</h1>
                                <div style={{ fontSize: '0.78rem', color: '#333', marginTop: '2px' }}>
                                    {branding?.address || ''}<br />
                                    {branding?.gstin && <><strong>GSTIN:</strong> {branding.gstin} &nbsp;</>}
                                    {branding?.contact && <>Contact: {branding.contact}</>}
                                </div>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', fontWeight: 700, border: '2px solid #111', padding: '3px 10px', borderRadius: '6px', whiteSpace: 'nowrap' }}>
                            {modeOfPayment === 'Khata' || modeOfPayment === 'Credit' ? L('credit_bill') : L('cash_bill')}
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #222', marginBottom: '8px' }}>
                        <div style={{ borderRight: '1px solid #222', padding: '6px' }}>
                            <div style={{ fontWeight: 700, marginBottom: '3px' }}>{L('buyer_title')}</div>
                            <div style={{ fontWeight: 700 }}>{customer.name}</div>
                            {customer.address && <div>{customer.address}{customer.pin ? ` - ${customer.pin}` : ''}</div>}
                            {customer.phone && <div>{L('contact')}: {customer.phone}</div>}
                        </div>
                        <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{L('bill_no')} :</strong><span>{billNumber}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{L('bill_date')} :</strong><span>{dateLabel}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{L('mode_of_payment')} :</strong><span>{modeOfPayment}</span></div>
                        </div>
                    </div>

                    <table className="kaprint-table" style={{ marginBottom: '8px' }}>
                        <thead>
                            <tr>
                                <th style={{ width: '30px' }}>{L('sno')}</th>
                                <th style={{ textAlign: 'left' as const }}>{L('item_description')}</th>
                                <th>{L('company')}</th><th>{L('batch_no')}</th><th>{L('exp_date')}</th>
                                <th>{L('gst_pct')}</th><th>{L('per')}</th><th>{L('qty')}</th>
                                <th>{L('rate')}</th><th>{L('gross_amount')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cart.map((item, i) => (
                                <tr key={i}>
                                    <td style={{ textAlign: 'center' as const }}>{i + 1}</td>
                                    <td>{item.name}</td>
                                    <td>{item.mfgCompany || ''}</td>
                                    <td style={{ textAlign: 'center' as const }}>{item.batchNo || ''}</td>
                                    <td style={{ textAlign: 'center' as const }}>{toMonthYear(item.expDate || '')}</td>
                                    <td style={{ textAlign: 'center' as const }}>{lineGst(item)}</td>
                                    <td style={{ textAlign: 'center' as const }}>{item.unit || item.baseUnit || ''}</td>
                                    <td style={{ textAlign: 'center' as const }}>{item.cartQuantity}</td>
                                    <td style={{ textAlign: 'center' as const }}>{rate(item)}</td>
                                    <td style={{ textAlign: 'center' as const }}>{fmt(item.cartTotal)}</td>
                                </tr>
                            ))}
                            {Array.from({ length: Math.max(0, 6 - cart.length) }).map((_, i) => (
                                <tr key={`e-${i}`} style={{ height: '20px' }}>
                                    <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                                </tr>
                            ))}
                            <tr style={{ fontWeight: 700, background: '#f9f9f9' }}>
                                <td colSpan={9} style={{ textAlign: 'right', paddingRight: '8px' }}>{L('total')}</td>
                                <td style={{ textAlign: 'center' as const }}>{fmt(taxable + tax)}</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid #222', marginBottom: '8px' }}>
                        <div style={{ borderRight: '1px solid #222', padding: '6px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' as const, fontSize: '0.78rem' }}>
                                <thead>
                                    <tr>{[L('taxable'), `${L('cgst')}%`, L('gross_amount'), `${L('sgst')}%`, L('gross_amount'), L('total_tax')].map((h, hi) => <th key={hi} style={{ border: '1px solid #ccc', padding: '2px 4px', background: '#f2f2f2' }}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' as const }}>{fmt(taxable)}</td>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' as const }}>2.5%</td>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' as const }}>{fmt(cgst)}</td>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' as const }}>2.5%</td>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' as const }}>{fmt(sgst)}</td>
                                        <td style={{ border: '1px solid #ccc', padding: '2px 4px', textAlign: 'center' as const }}>{fmt(tax)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        <div style={{ padding: '6px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('output_cgst')}@2.5%</span><span>{fmt(cgst)}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('output_sgst')}@2.5%</span><span>{fmt(sgst)}</span></div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('round_off')}</span><span>{fmt(roundOff)}</span></div>
                            {discount > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', color: '#2E7D32' }}><span>{L('discount')}</span><span>-{fmt(discount)}</span></div>}
                            {transportCharges > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('transport_charges')}</span><span>+{fmt(transportCharges)}</span></div>}
                            {laborCharges > 0 && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>{L('labor_charges')}</span><span>+{fmt(laborCharges)}</span></div>}
                            <div style={{ borderTop: '2px solid #111', marginTop: '3px', paddingTop: '3px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, fontSize: '1rem' }}>
                                <span>{L('net_amount')}</span><span>₹{net.toLocaleString('en-IN')}</span>
                            </div>
                            {(modeOfPayment === 'Khata' || modeOfPayment === 'Credit') && (<>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px', color: '#2E7D32' }}>
                                    <span>{L('amount_paid')}</span><span>₹{Number(creditPaidNow).toLocaleString('en-IN')}</span>
                                </div>
                                <div style={{ borderTop: '1px solid #555', paddingTop: '2px', display: 'flex', justifyContent: 'space-between', fontWeight: 900, color: creditAmount > 0 ? '#c62828' : '#2E7D32' }}>
                                    <span>{L('credit_amount')}</span><span>₹{Number(creditAmount).toLocaleString('en-IN')}</span>
                                </div>
                            </>)}
                            {previousOutstanding > 0 && (<>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '2px' }}>
                                    <span>{L('previous_outstanding')} (Dr)</span><span>₹{Number(previousOutstanding).toLocaleString('en-IN')}</span>
                                </div>
                                <div style={{ borderTop: '1px solid #111', paddingTop: '2px', display: 'flex', justifyContent: 'space-between', fontWeight: 900 }}>
                                    <span>{L('total_payable')}</span><span>₹{(net + Number(previousOutstanding)).toLocaleString('en-IN')}</span>
                                </div>
                            </>)}
                        </div>
                    </div>

                    <div style={{ border: '1px solid #222', marginBottom: '8px', display: 'grid', gridTemplateColumns: '90px 1fr' }}>
                        <div style={{ borderRight: '1px solid #222', padding: '5px', fontWeight: 700, display: 'flex', alignItems: 'center' }}>{L('amount_in_words')}</div>
                        <div style={{ padding: '5px', fontWeight: 600, fontStyle: 'italic' }}>INR {numberToWords(net)}</div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '10px', marginTop: '6px' }}>
                        <div style={{ fontSize: '0.72rem', color: '#444', maxWidth: '60%' }}>
                            <strong>{L('declaration')} :</strong> {L('declaration_text')}
                        </div>
                        {branding?.upiId && (
                            <div style={{ textAlign: 'center' as const }}>
                                <UpiQrCode upiId={branding.upiId} payeeName={sellerName} amount={net} transactionNote={billNumber} size={80} />
                                <div style={{ fontSize: '9px' }}>{L('scan_to_pay')}</div>
                            </div>
                        )}
                        <div style={{ textAlign: 'center' as const, minWidth: '130px' }}>
                            <div style={{ fontWeight: 700 }}>{L('for_business')} {sellerName}</div>
                            {branding?.signatureUrl ? (
                                <img src={branding.signatureUrl} alt="" style={{ height: '46px', maxWidth: '150px', objectFit: 'contain', margin: '2px auto' }} />
                            ) : (
                                <div style={{ height: '30px' }} />
                            )}
                            <div style={{ borderTop: '1px solid #555', paddingTop: '3px' }}>{branding?.signatureName || L('authorised_signatory')}</div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
