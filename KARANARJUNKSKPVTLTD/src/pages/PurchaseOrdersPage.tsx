import { useState, useEffect } from 'react';
import { addDoc, getDocs, query, orderBy, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { getTenantCollection, getTenantDoc } from '../utils/tenantPath';
import { logAudit } from '../utils/auditLog';
import { fmtINR } from '../utils/gstCalculator';
import { ShoppingCart, Plus, CheckCircle2, Package, Loader2, Trash2, AlertCircle } from 'lucide-react';

interface POLine { description: string; hsnCode: string; quantity: number; receivedQty: number; rate: number; gstPct: number; amount: number; }
interface PurchaseOrder {
  id: string; poNumber: string; poDate: string; expectedDate: string;
  supplierName: string; supplierContact: string; supplierGstin: string; supplierAddress: string;
  lines: POLine[]; totalAmount: number; taxableValue: number; cgst: number; sgst: number; totalTax: number;
  notes: string; status: 'draft'|'sent'|'partial'|'received'|'cancelled'; createdAt?: any;
}

const STATUS_CFG = {
  draft:    { label:'Draft',    color:'#6366f1', bg:'hsla(238,83%,67%,0.1)' },
  sent:     { label:'Sent',     color:'#3b82f6', bg:'hsla(217,91%,60%,0.1)' },
  partial:  { label:'Partial',  color:'#f59e0b', bg:'hsla(38,92%,50%,0.1)' },
  received: { label:'Received', color:'#10b981', bg:'hsla(160,84%,39%,0.1)' },
  cancelled:{ label:'Cancelled',color:'#ef4444', bg:'hsla(0,84%,60%,0.1)' },
};

const EMPTY_LINE = (): POLine => ({ description:'', hsnCode:'', quantity:1, receivedQty:0, rate:0, gstPct:5, amount:0 });
const TODAY = () => new Date().toISOString().split('T')[0];
const PLUS7 = () => { const d=new Date(); d.setDate(d.getDate()+7); return d.toISOString().split('T')[0]; };

export default function PurchaseOrdersPage() {
  const { tenantId, currentUser, userName, userRole } = useAuth();
  const [view, setView] = useState<'list'|'new'>('list');
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ supplierName:'', supplierContact:'', supplierGstin:'', supplierAddress:'', expectedDate:PLUS7(), notes:'' });
  const [lines, setLines] = useState<POLine[]>([EMPTY_LINE()]);

  const fetch = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const snap = await getDocs(query(getTenantCollection(db, tenantId, 'purchaseOrders'), orderBy('createdAt','desc')));
      setOrders(snap.docs.map(d=>({ id:d.id, ...d.data() } as PurchaseOrder)));
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  useEffect(() => { fetch(); }, [tenantId]);

  const recalc = (l: POLine): POLine => ({ ...l, amount: l.quantity * l.rate * (1 + l.gstPct/100) });
  const totalAmt = lines.reduce((s,l)=>s+l.amount, 0);
  const taxable = lines.reduce((s,l)=>s+l.quantity*l.rate, 0);

  const handleSave = async (status: 'draft'|'sent') => {
    if (!tenantId || !form.supplierName) return;
    setSaving(true);
    try {
      const snap = await getDocs(getTenantCollection(db, tenantId, 'purchaseOrders'));
      const seq = snap.size + 1;
      const y = new Date().getFullYear();
      const cgst = taxable * 0.025; // simplified — use gstCalculator for per-line in full impl
      const poNumber = `PO/${y.toString().slice(-2)}-${(y+1).toString().slice(-2)}/${String(seq).padStart(3,'0')}`;
      await addDoc(getTenantCollection(db, tenantId, 'purchaseOrders'), {
        poNumber,
        poDate: TODAY(), expectedDate: form.expectedDate,
        supplierName: form.supplierName, supplierContact: form.supplierContact,
        supplierGstin: form.supplierGstin, supplierAddress: form.supplierAddress,
        lines: lines.filter(l=>l.description||l.rate), totalAmount: totalAmt,
        taxableValue: taxable, cgst, sgst: cgst, totalTax: cgst*2,
        notes: form.notes, status, createdAt: serverTimestamp(),
      });
      logAudit({ db, tenantId, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'Purchase Orders', action: 'Create', entityName: poNumber, description: `PO created for ${form.supplierName} · Status: ${status} · ₹${totalAmt.toLocaleString('en-IN')}`, after: { supplierName: form.supplierName, totalAmount: totalAmt, status } });
      setView('list'); fetch();
      setForm({ supplierName:'', supplierContact:'', supplierGstin:'', supplierAddress:'', expectedDate:PLUS7(), notes:'' });
      setLines([EMPTY_LINE()]);
    } catch(e){ console.error(e); } finally { setSaving(false); }
  };

  const markReceived = async (po: PurchaseOrder) => {
    if (!tenantId) return;
    await updateDoc(getTenantDoc(db, tenantId, 'purchaseOrders', po.id) as any, { status:'received' });
    logAudit({ db, tenantId, userId: currentUser?.uid || '', userName: userName || currentUser?.email || 'Unknown', userRole: userRole || 'unknown', module: 'Purchase Orders', action: 'Status Change', entityName: po.poNumber, entityId: po.id, description: `PO marked as received · ${po.poNumber} · ${po.supplierName}`, before: { status: po.status }, after: { status: 'received' } });
    fetch();
  };

  const card = { background:'var(--surface-raised)', border:'1px solid var(--surface-border)', borderRadius:'14px', padding:'1.5rem' };

  return (
    <div className="animate-fade-in" style={{ maxWidth:'1100px', margin:'0 auto' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:'2rem', flexWrap:'wrap', gap:'1rem' }}>
        <div>
          <h1 className="primary-gradient-text" style={{ fontSize:'2rem', display:'flex', alignItems:'center', gap:'0.75rem' }}>
            <ShoppingCart size={32}/> Purchase Orders
          </h1>
          <p style={{ color:'var(--text-secondary)', marginTop:'0.25rem' }}>Manage inward purchase orders from suppliers</p>
        </div>
        <div style={{ display:'flex', gap:'0.75rem' }}>
          {view==='new' && <button onClick={()=>setView('list')} style={{ padding:'0.75rem 1.5rem', background:'transparent', border:'1px solid var(--surface-border)', borderRadius:'10px', cursor:'pointer', color:'var(--text-secondary)', font:'inherit' }}>Cancel</button>}
          <button onClick={()=>setView(view==='list'?'new':'list')} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.75rem 1.5rem', background:'var(--primary-light)', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontWeight:600, font:'inherit' }}>
            <Plus size={17}/> New Purchase Order
          </button>
        </div>
      </div>

      {/* New PO Form */}
      {view==='new' && (
        <div style={{ ...card, marginBottom:'2rem' }}>
          <h3 style={{ marginBottom:'1.5rem', fontWeight:700 }}>Create Purchase Order</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1.5rem' }}>
            {[
              { key:'supplierName', label:'Supplier / Vendor Name', required:true },
              { key:'supplierContact', label:'Contact Number', placeholder:'Mobile number' },
              { key:'supplierGstin', label:'Supplier GSTIN', placeholder:'Optional' },
              { key:'expectedDate', label:'Expected Delivery Date', type:'date' },
            ].map(f=>(
              <div key={f.key} className="input-group">
                <label style={{ fontWeight:600, fontSize:'0.85rem' }}>{f.label}{(f as any).required&&' *'}</label>
                <input className="input-field" type={(f as any).type||'text'} placeholder={(f as any).placeholder||''} value={(form as any)[f.key]} onChange={e=>setForm(p=>({...p,[f.key]:e.target.value}))} />
              </div>
            ))}
          </div>
          <div className="input-group" style={{ marginBottom:'1.5rem' }}>
            <label style={{ fontWeight:600, fontSize:'0.85rem' }}>Supplier Address</label>
            <textarea className="input-field" style={{ minHeight:'60px' }} value={form.supplierAddress} onChange={e=>setForm(p=>({...p,supplierAddress:e.target.value}))} />
          </div>

          <h4 style={{ marginBottom:'0.75rem', fontWeight:700 }}>Items to Purchase</h4>
          <div style={{ overflowX:'auto', marginBottom:'1rem' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'0.88rem' }}>
              <thead><tr style={{ background:'var(--surface-base)' }}>
                {['Description','HSN/SAC','Qty','Rate (₹)','GST%','Amount'].map(h=>(
                  <th key={h} style={{ padding:'0.6rem 0.75rem', textAlign:'left', fontWeight:700, color:'var(--text-secondary)', fontSize:'0.78rem', borderBottom:'1px solid var(--surface-border)' }}>{h}</th>
                ))}
                <th style={{ width:36 }}/>
              </tr></thead>
              <tbody>
                {lines.map((l,i)=>(
                  <tr key={i} style={{ borderBottom:'1px solid var(--surface-border)' }}>
                    <td style={{ padding:'0.4rem 0.5rem' }}><input className="input-field" style={{ margin:0 }} placeholder="Item description" value={l.description} onChange={e=>{const nl=[...lines]; nl[i]=recalc({...nl[i],description:e.target.value}); setLines(nl);}}/></td>
                    <td style={{ padding:'0.4rem 0.5rem', width:90 }}><input className="input-field" style={{ margin:0 }} placeholder="HSN" value={l.hsnCode} onChange={e=>{const nl=[...lines]; nl[i]={...nl[i],hsnCode:e.target.value}; setLines(nl);}}/></td>
                    <td style={{ padding:'0.4rem 0.5rem', width:70 }}><input type="number" className="input-field" style={{ margin:0 }} value={l.quantity} onChange={e=>{const nl=[...lines]; nl[i]=recalc({...nl[i],quantity:Number(e.target.value)}); setLines(nl);}}/></td>
                    <td style={{ padding:'0.4rem 0.5rem', width:110 }}><input type="number" className="input-field" style={{ margin:0 }} value={l.rate} onChange={e=>{const nl=[...lines]; nl[i]=recalc({...nl[i],rate:Number(e.target.value)}); setLines(nl);}}/></td>
                    <td style={{ padding:'0.4rem 0.5rem', width:80 }}>
                      <select className="input-field" style={{ margin:0 }} value={l.gstPct} onChange={e=>{const nl=[...lines]; nl[i]=recalc({...nl[i],gstPct:Number(e.target.value)}); setLines(nl);}}>
                        {[0,5,12,18,28].map(r=><option key={r} value={r}>{r}%</option>)}
                      </select>
                    </td>
                    <td style={{ padding:'0.4rem 0.5rem', width:100, fontWeight:600, textAlign:'right' }}>₹{fmtINR(l.amount)}</td>
                    <td style={{ textAlign:'center', padding:'0.4rem 0.25rem' }}>
                      <button onClick={()=>setLines(ls=>ls.filter((_,j)=>j!==i))} style={{ border:'none', background:'transparent', cursor:'pointer', color:'#ef4444', padding:'4px' }}><Trash2 size={14}/></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1.5rem' }}>
            <button onClick={()=>setLines(l=>[...l,EMPTY_LINE()])} style={{ display:'flex', alignItems:'center', gap:'0.4rem', padding:'0.5rem 1rem', background:'transparent', border:'1px dashed var(--surface-border)', borderRadius:'8px', cursor:'pointer', color:'var(--text-secondary)', font:'inherit', fontSize:'0.85rem' }}>
              <Plus size={14}/> Add Item
            </button>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:'0.85rem', color:'var(--text-secondary)' }}>Total (incl. GST)</div>
              <div style={{ fontSize:'1.5rem', fontWeight:800, color:'var(--primary-light)' }}>₹{fmtINR(totalAmt)}</div>
            </div>
          </div>
          <div className="input-group" style={{ marginBottom:'1.5rem' }}>
            <label style={{ fontWeight:600, fontSize:'0.85rem' }}>Notes</label>
            <textarea className="input-field" style={{ minHeight:'50px' }} placeholder="Delivery instructions, special requirements..." value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} />
          </div>
          <div style={{ display:'flex', gap:'1rem', justifyContent:'flex-end' }}>
            <button onClick={()=>handleSave('draft')} disabled={saving} style={{ padding:'0.75rem 1.5rem', background:'transparent', border:'1px solid var(--surface-border)', borderRadius:'10px', cursor:'pointer', fontWeight:600, color:'var(--text-secondary)', font:'inherit', display:'flex', alignItems:'center', gap:'0.5rem' }}>
              {saving?<Loader2 className="animate-spin" size={16}/>:<Package size={16}/>} Save as Draft
            </button>
            <button onClick={()=>handleSave('sent')} disabled={saving} style={{ padding:'0.75rem 2rem', background:'var(--primary-light)', color:'#fff', border:'none', borderRadius:'10px', cursor:'pointer', fontWeight:700, font:'inherit', display:'flex', alignItems:'center', gap:'0.5rem' }}>
              {saving?<Loader2 className="animate-spin" size={16}/>:<CheckCircle2 size={16}/>} Send to Supplier
            </button>
          </div>
        </div>
      )}

      {/* Orders List */}
      {loading ? (
        <div style={{ textAlign:'center', padding:'4rem' }}><Loader2 className="animate-spin" size={36} style={{ margin:'0 auto' }}/></div>
      ) : orders.length===0 ? (
        <div style={{ ...card, textAlign:'center', padding:'4rem' }}>
          <AlertCircle size={48} style={{ color:'var(--text-tertiary)', margin:'0 auto 1rem', opacity:0.4 }}/>
          <h3>No Purchase Orders</h3>
          <p style={{ color:'var(--text-secondary)', marginTop:'0.5rem' }}>Create your first purchase order from a supplier</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:'0.75rem' }}>
          {orders.map(po=>{
            const sc = STATUS_CFG[po.status]||STATUS_CFG.draft;
            return (
              <div key={po.id} style={{ ...card, padding:'1.25rem', display:'grid', gridTemplateColumns:'1fr auto', gap:'1rem', alignItems:'center' }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:'0.75rem', marginBottom:'0.4rem', flexWrap:'wrap' }}>
                    <span style={{ fontWeight:800, color:'var(--primary-light)' }}>{po.poNumber}</span>
                    <span style={{ padding:'0.15rem 0.65rem', borderRadius:'999px', background:sc.bg, color:sc.color, fontSize:'0.76rem', fontWeight:700 }}>{sc.label}</span>
                    <span style={{ fontSize:'0.8rem', color:'var(--text-secondary)' }}>Expected: {po.expectedDate}</span>
                  </div>
                  <div style={{ fontWeight:700, fontSize:'1rem', marginBottom:'0.2rem' }}>{po.supplierName}</div>
                  <div style={{ fontSize:'0.83rem', color:'var(--text-secondary)' }}>
                    {po.lines.length} item(s) • PO Date: {po.poDate}
                    {po.supplierContact && ` • 📞 ${po.supplierContact}`}
                  </div>
                  <div style={{ fontSize:'0.8rem', color:'var(--text-secondary)', marginTop:'0.2rem' }}>
                    Taxable: ₹{fmtINR(po.taxableValue||0)} | GST: ₹{fmtINR(po.totalTax||0)}
                  </div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.5rem', alignItems:'flex-end' }}>
                  <div style={{ fontSize:'1.35rem', fontWeight:900, color:'var(--primary-light)' }}>₹{fmtINR(po.totalAmount)}</div>
                  {po.status !== 'received' && po.status !== 'cancelled' && (
                    <button onClick={()=>markReceived(po)} style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.5rem 0.9rem', background:'#10b981', color:'#fff', border:'none', borderRadius:'8px', cursor:'pointer', fontWeight:700, font:'inherit', fontSize:'0.82rem' }}>
                      <CheckCircle2 size={14}/> Mark Received
                    </button>
                  )}
                  {po.status === 'received' && (
                    <span style={{ color:'#10b981', fontSize:'0.82rem', fontWeight:700 }}>✓ Stock Updated</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
