/**
 * Local invoice preview — renders a SAMPLE order straight to a PDF using your
 * installed Chrome (no Firebase, no deploy, no Storage). Fastest way to iterate
 * on the invoice design + verify Marathi/Hindi/Gujarati + ₹ shaping.
 *
 *   npx tsx scripts/invoice-preview.ts
 *   open /tmp/invoice-preview.pdf          # macOS
 *
 * To preview a REAL order instead, pass its id (needs Admin SDK env in .env):
 *   npx tsx scripts/invoice-preview.ts <orderId>
 */
import { renderInvoicePdf } from "../app/lib/invoice-pdf";
import fs from "fs";

const OUT = "/tmp/invoice-preview.pdf";

const SAMPLE: any = {
  id: "PREVIEWORDER1234",
  invoiceNumber: "Retail00042",
  customerName: "श्री धर्मेंद्र कुमार रॉय",
  customerAddress: { address: "चकपहार, ताजपूर", city: "समस्तीपूर", district: "समस्तीपूर", state: "बिहार", pincode: "848122" },
  customerPhone: "9511829723",
  sellerId: "seller1", sellerType: "retailer",
  sellerName: "कारण अर्जुन प्रा. लि.",
  sellerGstNumber: "27ABCDE1234F1Z5",
  items: [
    { productId: "p1", name: "क्रिस्टल ग्रामोक्सोन", variantUnit: "1L", price: 450, originalPrice: 500, qty: 1, lineTotal: 450, gstApplicable: true, gstRate: 18, gstAmount: 68.64, gstIncluded: true },
    { productId: "p2", name: "Urea Fertilizer 50kg", price: 266, qty: 2, lineTotal: 532, gstApplicable: false },
  ],
  subtotal: 982,
  totalGst: 68.64, totalGstAdded: 0,
  deliveryCharge: 150, deliveryBreakdown: { slab: 150, extra: 0, free: false, waived: 0 },
  grandTotal: 1132,
  totalWeightKg: 101,
  tracking: { id: "19041976161711", idType: "awb", addedAt: "", addedBy: "", sends: [] },
  payment: { razorpayPaymentId: "pay_Qabc123XYZ", status: "paid", amount: 1132, mode: "razorpay" },
  status: "dispatched",
  createdAt: new Date(),
};

const SAMPLE_SELLER = {
  name: "कारण अर्जुन प्रा. लि.",
  address: "Road No 1, PAC Sheti Udyog Bhandar, Mhalsakore, Niphad",
  city: "Nashik", state: "Maharashtra", pincode: "422103",
  phone: "9511829723", gstin: "27ABCDE1234F1Z5",
};

(async () => {
  const orderId = process.argv[2];
  let order = SAMPLE;
  let seller: any = SAMPLE_SELLER;

  if (orderId) {
    // Real order — requires Admin SDK env (FIREBASE_CLIENT_EMAIL/PRIVATE_KEY in .env).
    const { getAdminDb } = await import("../app/lib/firebase-admin");
    const snap = await getAdminDb().collection("orders").doc(orderId).get();
    if (!snap.exists) throw new Error(`Order ${orderId} not found.`);
    order = { id: orderId, ...snap.data() };
    seller = undefined; // let it fall back to order.sellerName/GST (or wire loadSellerInfo if needed)
    console.log(`Rendering real order ${orderId}`);
  } else {
    console.log("Rendering SAMPLE order (pass an orderId to preview a real one).");
  }

  const pdf = await renderInvoicePdf(order, seller);
  fs.writeFileSync(OUT, pdf);
  console.log(`✓ Wrote ${OUT} (${pdf.length} bytes) — open it with:  open ${OUT}`);
  process.exit(0);
})().catch((e) => { console.error("Render failed:", e); process.exit(1); });
