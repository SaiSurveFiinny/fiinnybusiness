import { useState, useEffect, useMemo } from 'react';
import { getDocs, query } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection } from '../utils/tenantPath';
import { fmtINR, round2 } from '../utils/gstCalculator';
import { FileText, Download, Loader2, Calendar, TrendingUp, AlertCircle, CheckCircle2, BarChart3, ChevronRight } from 'lucide-react';

interface SalesOrder {
  id: string; invoiceDate: string; retailerName: string; buyerGstin: string;
  taxableValue: number; cgst: number; sgst: number; igst?: number;
  totalTax: number; netAmount: number; lineItems?: any[];
  orderNumber?: string;
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function GSTReportsPage() {
  const { tenantId } = useAuth();
  const today = new Date();
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth());
  const [activeTab, setActiveTab] = useState<'gstr1'|'gstr3b'>('gstr1');
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(false);

  const years = [today.getFullYear(), today.getFullYear()-1, today.getFullYear()-2];

  useEffect(() => {
    if (!tenantId) return;
    const start = new Date(selectedYear, selectedMonth, 1).toISOString().split('T')[0];
    const end = new Date(selectedYear, selectedMonth+1, 0).toISOString().split('T')[0];
    setLoading(true);
    getDocs(query(getTenantCollection(db, tenantId, 'salesOrders'))).then(snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as SalesOrder));
      setOrders(all.filter(o => o.invoiceDate >= start && o.invoiceDate <= end));
    }).catch(console.error).finally(() => setLoading(false));
  }, [tenantId, selectedYear, selectedMonth]);

  const summary = useMemo(() => {
    const b2b: SalesOrder[] = [], b2c: SalesOrder[] = [];
    const byRate: Record<number, {taxable:number;cgst:number;sgst:number;igst:number}> = {};
    let totalTaxableValue=0, totalCGST=0, totalSGST=0, totalIGST=0, totalTax=0, totalGrossValue=0;
    for (const o of orders) {
      const taxable=Number(o.taxableValue||0), cgst=Number(o.cgst||0), sgst=Number(o.sgst||0);
      const igst=Number(o.igst||0), tax=Number(o.totalTax||cgst+sgst+igst), gross=Number(o.netAmount||taxable+tax);
      totalTaxableValue+=taxable; totalCGST+=cgst; totalSGST+=sgst; totalIGST+=igst; totalTax+=tax; totalGrossValue+=gross;
      (o.buyerGstin && o.buyerGstin.length > 5 ? b2b : b2c).push(o);
      const rate = tax>0&&taxable>0 ? round2(tax/taxable*100) : 5;
      if (!byRate[rate]) byRate[rate]={taxable:0,cgst:0,sgst:0,igst:0};
      byRate[rate].taxable+=taxable; byRate[rate].cgst+=cgst; byRate[rate].sgst+=sgst; byRate[rate].igst+=igst;
    }
    return { totalTaxableValue, totalCGST, totalSGST, totalIGST, totalTax, totalGrossValue, invoiceCount: orders.length, byRate, b2bInvoices: b2b, b2cInvoices: b2c };
  }, [orders]);

  const exportCSV = () => {
    const rows: string[][] = activeTab === 'gstr1'
      ? [['Invoice No','Date','Buyer','GSTIN','Taxable Value','CGST','SGST','IGST','Total'],
         ...summary.b2bInvoices.map(o=>[o.orderNumber||o.id,o.invoiceDate,o.retailerName,o.buyerGstin,String(round2(o.taxableValue||0)),String(round2(o.cgst||0)),String(round2(o.sgst||0)),String(round2(o.igst||0)),String(round2(o.netAmount||0))])]
      : [['Description','Taxable','CGST','SGST','IGST','Total Tax'],
         ['Outward Supplies',String(round2(summary.totalTaxableValue)),String(round2(summary.totalCGST)),String(round2(summary.totalSGST)),String(round2(summary.totalIGST)),String(round2(summary.totalTax))]];
    const blob = new Blob(['\uFEFF'+rows.map(r=>r.join(',')).join('\n')], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob);
    a.download=`${activeTab.toUpperCase()}_${MONTHS[selectedMonth]}_${selectedYear}.csv`; a.click();
  };

  const card = { background:'var(--surface-raised)', border:'1px solid var(--surface-border)', borderRadius:'14px', padding:'1.5rem' };
  const tab = (a:boolean) => ({ padding:'0.6rem 1.5rem', borderRadius:'8px', border:'none', cursor:'pointer' as const, fontWeight:a?700:400, background:a?'var(--primary-light)':'transparent', color:a?'#fff':'var(--text-secondary)', font:'inherit', fontSize:'0.9rem' });

  return (
    <div className="animate-fade-in" style={{ width:'100%' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'2rem', flexWrap:'wrap', gap:'1rem' }}>
        <div>
          <h1 className="primary-gradient-text" style={{ fontSize:'2rem', display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <FileText size={32} /> GST Reports
          </h1>
          <p style={{ color:'var(--text-secondary)', marginTop:'0.25rem' }}>GSTR-1 & GSTR-3B monthly reports for filing</p>
        </div>
        <button onClick={exportCSV} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.75rem 1.5rem', background:'var(--primary-light)', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontWeight:600, font:'inherit' }}>
          <Download size={17} /> Export CSV
        </button>
      </div>

      <div style={{ ...card, marginBottom:'1.5rem', display:'flex', gap:'1rem', alignItems:'center', flexWrap:'wrap' }}>
        <Calendar size={20} style={{ color:'var(--primary-light)' }} />
        <select value={selectedMonth} onChange={e=>setSelectedMonth(Number(e.target.value))} className="input-field" style={{ width:'auto', minWidth:'140px' }}>
          {MONTHS.map((m,i)=><option key={m} value={i}>{m}</option>)}
        </select>
        <select value={selectedYear} onChange={e=>setSelectedYear(Number(e.target.value))} className="input-field" style={{ width:'auto' }}>
          {years.map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ marginLeft:'auto', display:'flex', gap:'0.5rem' }}>
          <button style={tab(activeTab==='gstr1')} onClick={()=>setActiveTab('gstr1')}>GSTR-1</button>
          <button style={tab(activeTab==='gstr3b')} onClick={()=>setActiveTab('gstr3b')}>GSTR-3B</button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:'4rem', color:'var(--text-secondary)' }}>
          <Loader2 className="animate-spin" style={{ margin:'0 auto 1rem' }} size={36} />
          <p>Loading invoice data...</p>
        </div>
      ) : (
        <>
          {/* Stat Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(175px, 1fr))', gap:'1rem', marginBottom:'1.5rem' }}>
            {[
              { label:'Total Invoices', value:summary.invoiceCount, color:'#6366f1', icon:<FileText size={18}/> },
              { label:'Taxable Value', value:`₹${fmtINR(summary.totalTaxableValue)}`, color:'#10b981', icon:<BarChart3 size={18}/> },
              { label:'CGST', value:`₹${fmtINR(summary.totalCGST)}`, color:'#f59e0b', icon:<TrendingUp size={18}/> },
              { label:'SGST', value:`₹${fmtINR(summary.totalSGST)}`, color:'#f59e0b', icon:<TrendingUp size={18}/> },
              { label:'IGST', value:`₹${fmtINR(summary.totalIGST)}`, color:'#3b82f6', icon:<TrendingUp size={18}/> },
              { label:'Total Tax', value:`₹${fmtINR(summary.totalTax)}`, color:'#ef4444', icon:<CheckCircle2 size={18}/> },
            ].map(s=>(
              <div key={s.label} style={{ background:'var(--surface-raised)', border:'1px solid var(--surface-border)', borderLeft:`4px solid ${s.color}`, borderRadius:'14px', padding:'1.25rem' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', color:s.color, marginBottom:'0.4rem', fontSize:'0.78rem', fontWeight:700, textTransform:'uppercase' as const, letterSpacing:'0.05em' }}>{s.icon}{s.label}</div>
                <div style={{ fontSize:'1.25rem', fontWeight:800 }}>{s.value}</div>
              </div>
            ))}
          </div>

          {/* GSTR-1 */}
          {activeTab==='gstr1' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'1.5rem' }}>
              <div style={card}>
                <h3 style={{ marginBottom:'1rem', fontSize:'1rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <BarChart3 size={18} style={{ color:'var(--primary-light)' }}/> Tax Summary by GST Rate
                </h3>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.88rem' }}>
                    <thead><tr style={{ background:'var(--surface-base)' }}>
                      {['GST Rate','Taxable Value','CGST','SGST','IGST','Total Tax'].map(h=>(
                        <th key={h} style={{ padding:'0.75rem 1rem', textAlign:h==='GST Rate'?'left':'right', fontWeight:700, color:'var(--text-secondary)', fontSize:'0.78rem', textTransform:'uppercase' as const, borderBottom:'2px solid var(--surface-border)' }}>{h}</th>
                      ))}</tr></thead>
                    <tbody>
                      {Object.entries(summary.byRate).sort(([a],[b])=>Number(a)-Number(b)).map(([rate,v])=>(
                        <tr key={rate} style={{ borderBottom:'1px solid var(--surface-border)' }}>
                          <td style={{ padding:'0.75rem 1rem', fontWeight:600 }}>{rate}%</td>
                          <td style={{ padding:'0.75rem 1rem', textAlign:'right' }}>₹{fmtINR(v.taxable)}</td>
                          <td style={{ padding:'0.75rem 1rem', textAlign:'right', color:'#f59e0b' }}>₹{fmtINR(v.cgst)}</td>
                          <td style={{ padding:'0.75rem 1rem', textAlign:'right', color:'#f59e0b' }}>₹{fmtINR(v.sgst)}</td>
                          <td style={{ padding:'0.75rem 1rem', textAlign:'right', color:'#3b82f6' }}>₹{fmtINR(v.igst)}</td>
                          <td style={{ padding:'0.75rem 1rem', textAlign:'right', fontWeight:700, color:'#ef4444' }}>₹{fmtINR(v.cgst+v.sgst+v.igst)}</td>
                        </tr>
                      ))}
                      <tr style={{ background:'var(--surface-base)', fontWeight:800 }}>
                        <td style={{ padding:'0.75rem 1rem' }}>TOTAL</td>
                        <td style={{ padding:'0.75rem 1rem', textAlign:'right' }}>₹{fmtINR(summary.totalTaxableValue)}</td>
                        <td style={{ padding:'0.75rem 1rem', textAlign:'right', color:'#f59e0b' }}>₹{fmtINR(summary.totalCGST)}</td>
                        <td style={{ padding:'0.75rem 1rem', textAlign:'right', color:'#f59e0b' }}>₹{fmtINR(summary.totalSGST)}</td>
                        <td style={{ padding:'0.75rem 1rem', textAlign:'right', color:'#3b82f6' }}>₹{fmtINR(summary.totalIGST)}</td>
                        <td style={{ padding:'0.75rem 1rem', textAlign:'right', color:'#ef4444' }}>₹{fmtINR(summary.totalTax)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div style={card}>
                <h3 style={{ marginBottom:'1rem', fontSize:'1rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <CheckCircle2 size={18} style={{ color:'#10b981' }}/> B2B Invoices ({summary.b2bInvoices.length})
                </h3>
                {summary.b2bInvoices.length===0 ? (
                  <div style={{ textAlign:'center', padding:'2rem', color:'var(--text-secondary)' }}>
                    <AlertCircle size={32} style={{ margin:'0 auto 0.5rem', opacity:0.4 }} />
                    <p>No B2B invoices this month</p>
                  </div>
                ) : (
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.84rem' }}>
                      <thead><tr style={{ background:'var(--surface-base)' }}>
                        {['Invoice No','Date','Buyer','GSTIN','Taxable','CGST','SGST','IGST','Total'].map(h=>(
                          <th key={h} style={{ padding:'0.65rem 0.85rem', textAlign:'left', fontWeight:700, color:'var(--text-secondary)', fontSize:'0.75rem', textTransform:'uppercase' as const, borderBottom:'1px solid var(--surface-border)', whiteSpace:'nowrap' as const }}>{h}</th>
                        ))}</tr></thead>
                      <tbody>
                        {summary.b2bInvoices.map(o=>(
                          <tr key={o.id} style={{ borderBottom:'1px solid var(--surface-border)' }}>
                            <td style={{ padding:'0.65rem 0.85rem', fontWeight:600, color:'var(--primary-light)' }}>{o.orderNumber||o.id.slice(0,8)}</td>
                            <td style={{ padding:'0.65rem 0.85rem' }}>{o.invoiceDate}</td>
                            <td style={{ padding:'0.65rem 0.85rem', fontWeight:600 }}>{o.retailerName}</td>
                            <td style={{ padding:'0.65rem 0.85rem', fontSize:'0.76rem', fontFamily:'monospace' }}>{o.buyerGstin}</td>
                            <td style={{ padding:'0.65rem 0.85rem', textAlign:'right' }}>₹{fmtINR(o.taxableValue||0)}</td>
                            <td style={{ padding:'0.65rem 0.85rem', textAlign:'right', color:'#f59e0b' }}>₹{fmtINR(o.cgst||0)}</td>
                            <td style={{ padding:'0.65rem 0.85rem', textAlign:'right', color:'#f59e0b' }}>₹{fmtINR(o.sgst||0)}</td>
                            <td style={{ padding:'0.65rem 0.85rem', textAlign:'right', color:'#3b82f6' }}>₹{fmtINR(o.igst||0)}</td>
                            <td style={{ padding:'0.65rem 0.85rem', textAlign:'right', fontWeight:700 }}>₹{fmtINR(o.netAmount||0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div style={card}>
                <h3 style={{ marginBottom:'1rem', fontSize:'1rem', display:'flex', alignItems:'center', gap:'0.5rem' }}>
                  <ChevronRight size={18}/> B2C Summary ({summary.b2cInvoices.length} invoices)
                </h3>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(140px, 1fr))', gap:'1rem' }}>
                  {[
                    { label:'Count', value:summary.b2cInvoices.length },
                    { label:'Total Value', value:`₹${fmtINR(summary.b2cInvoices.reduce((s,o)=>s+(o.netAmount||0),0))}` },
                    { label:'Taxable', value:`₹${fmtINR(summary.b2cInvoices.reduce((s,o)=>s+(o.taxableValue||0),0))}` },
                    { label:'Tax', value:`₹${fmtINR(summary.b2cInvoices.reduce((s,o)=>s+(o.totalTax||0),0))}` },
                  ].map(s=>(
                    <div key={s.label} style={{ padding:'1rem', background:'var(--surface-base)', borderRadius:'10px' }}>
                      <div style={{ fontSize:'0.78rem', color:'var(--text-secondary)', marginBottom:'0.25rem' }}>{s.label}</div>
                      <div style={{ fontWeight:700, fontSize:'1.1rem' }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* GSTR-3B */}
          {activeTab==='gstr3b' && (
            <div style={card}>
              <h3 style={{ marginBottom:'1.5rem', fontSize:'1.1rem', fontWeight:700 }}>GSTR-3B — {MONTHS[selectedMonth]} {selectedYear}</h3>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.9rem' }}>
                  <thead><tr style={{ background:'var(--surface-base)' }}>
                    {['Description','Taxable Value','CGST','SGST','IGST','Total Tax'].map(h=>(
                      <th key={h} style={{ padding:'1rem', textAlign:h==='Description'?'left':'right', fontWeight:700, color:'var(--text-secondary)', fontSize:'0.78rem', textTransform:'uppercase' as const, borderBottom:'2px solid var(--surface-border)' }}>{h}</th>
                    ))}</tr></thead>
                  <tbody>
                    {[
                      { desc:'3.1(a) Outward taxable supplies', taxable:summary.totalTaxableValue, cgst:summary.totalCGST, sgst:summary.totalSGST, igst:summary.totalIGST, tax:summary.totalTax },
                      { desc:'3.1(b) Zero rated supplies', taxable:0, cgst:0, sgst:0, igst:0, tax:0 },
                      { desc:'3.1(c) Nil rated / Exempted', taxable:0, cgst:0, sgst:0, igst:0, tax:0 },
                      { desc:'4(A) ITC Available', taxable:0, cgst:0, sgst:0, igst:0, tax:0 },
                    ].map((row,i)=>(
                      <tr key={i} style={{ borderBottom:'1px solid var(--surface-border)', background:i===0?'hsla(152,60%,40%,0.04)':'transparent' }}>
                        <td style={{ padding:'1rem', maxWidth:'350px', lineHeight:'1.4' }}>{row.desc}</td>
                        <td style={{ padding:'1rem', textAlign:'right', fontWeight:600 }}>₹{fmtINR(row.taxable)}</td>
                        <td style={{ padding:'1rem', textAlign:'right', color:'#f59e0b' }}>₹{fmtINR(row.cgst)}</td>
                        <td style={{ padding:'1rem', textAlign:'right', color:'#f59e0b' }}>₹{fmtINR(row.sgst)}</td>
                        <td style={{ padding:'1rem', textAlign:'right', color:'#3b82f6' }}>₹{fmtINR(row.igst)}</td>
                        <td style={{ padding:'1rem', textAlign:'right', fontWeight:800, color:'#ef4444' }}>₹{fmtINR(row.tax)}</td>
                      </tr>
                    ))}
                    <tr style={{ background:'hsla(0,84%,60%,0.06)', fontWeight:800, borderTop:'2px solid var(--surface-border)' }}>
                      <td style={{ padding:'1rem' }}>6.1 Net GST Payable</td>
                      <td style={{ padding:'1rem', textAlign:'right' }}>₹{fmtINR(summary.totalTaxableValue)}</td>
                      <td style={{ padding:'1rem', textAlign:'right', color:'#f59e0b' }}>₹{fmtINR(summary.totalCGST)}</td>
                      <td style={{ padding:'1rem', textAlign:'right', color:'#f59e0b' }}>₹{fmtINR(summary.totalSGST)}</td>
                      <td style={{ padding:'1rem', textAlign:'right', color:'#3b82f6' }}>₹{fmtINR(summary.totalIGST)}</td>
                      <td style={{ padding:'1rem', textAlign:'right', color:'#ef4444', fontSize:'1.1rem' }}>₹{fmtINR(summary.totalTax)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop:'1.5rem', padding:'1rem', background:'hsla(45,93%,47%,0.08)', borderRadius:'10px', border:'1px solid hsla(45,93%,47%,0.2)', fontSize:'0.85rem', color:'var(--text-secondary)' }}>
                ⚠️ <strong>Note:</strong> Verify with your CA before filing. Cross-check against GSTR-2B for ITC.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
