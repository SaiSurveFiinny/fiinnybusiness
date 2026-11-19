import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { requireAdmin, requireSection } from "../../../lib/admin-auth";
import { clearCampaignCache, DELIVERY_CAMPAIGN_DOC } from "../../../lib/delivery-campaign";
import { loadRouteConfig } from "../../../lib/route-server";
import {
  activeCampaign, estimateWalletPaise, summariseLedger, toMillis, validateCampaignInput, type LedgerEntry,
} from "../../../../functions/src/payouts/settlement";

/**
 * Admin → Courier delivery: the money side (docs/delivery-money-architecture.md).
 *
 * GET  (admin, or team with "orders"):
 *   campaign  the free-delivery campaign and whether it is running now
 *   wallets   Shiprocket (from its API, hourly) and Delhivery (estimated)
 *   weeks     delivery money per week: what customers paid, sellers' shares,
 *             campaign spend, courier cost, the platform's net
 *   commissionPercent  the live rate in settings/route
 *
 * POST (full admins only: these change what customers pay or who is alerted)
 *   { action: "saveCampaign", active, name, startsAt, endsAt, maxPerOrder, budget, resetSpent }
 *   { action: "stopCampaign" }
 *   { action: "recordDelhiveryBalance", rupees }
 *   { action: "walletAlerts", alertBelow, alertPhones: string[] }
 */

const db = () => getAdminDb();
const campaignRef = () => db().collection(DELIVERY_CAMPAIGN_DOC.collection).doc(DELIVERY_CAMPAIGN_DOC.doc);
const walletsRef = () => db().collection("_serverConfig").doc("courierWallets");
const REPORT_WEEKS = 10;

async function view() {
  const now = Date.now();
  const since = new Date(now - REPORT_WEEKS * 7 * 24 * 3600 * 1000).toISOString();
  const [campaignSnap, walletsSnap, ledgerSnap, route] = await Promise.all([
    campaignRef().get(),
    walletsRef().get(),
    db().collection("deliveryLedger").where("at", ">=", since).limit(5000).get(),
    loadRouteConfig(),
  ]);
  const c = campaignSnap.data() ?? null;
  const w = walletsSnap.data() ?? {};
  const entries = ledgerSnap.docs.map((d) => d.data() as LedgerEntry);
  const recordedAt = toMillis(w.delhivery?.recordedAt);
  return {
    campaign: c
      ? {
          active: c.active === true,
          running: activeCampaign(c, now) !== null,
          name: String(c.name ?? ""),
          startsAt: String(c.startsAt ?? ""),
          endsAt: String(c.endsAt ?? ""),
          maxPerOrder: Number(c.maxPerOrder) || 0,
          budget: Number(c.budget) || 0,
          spent: (Number(c.spentPaise) || 0) / 100,
          updatedBy: typeof c.updatedBy === "string" ? c.updatedBy : null,
        }
      : null,
    wallets: {
      shiprocket: w.shiprocket
        ? {
            balance: Number.isFinite(Number(w.shiprocket.balancePaise)) ? Number(w.shiprocket.balancePaise) / 100 : null,
            at: w.shiprocket.at ?? null,
            error: w.shiprocket.error ?? null,
          }
        : null,
      delhivery: recordedAt > 0
        ? {
            recorded: (Number(w.delhivery.recordedPaise) || 0) / 100,
            recordedAt: new Date(recordedAt).toISOString(),
            // Fresh from the ledger, not the hourly copy.
            estimate: estimateWalletPaise(Number(w.delhivery.recordedPaise) || 0, recordedAt, entries, "delhivery") / 100,
          }
        : null,
      alertBelow: Number(w.alertBelow) > 0 ? Number(w.alertBelow) : 5000,
      alertPhones: Array.isArray(w.alertPhones) ? w.alertPhones.map(String) : [],
      checkedAt: w.checkedAt ?? null,
    },
    weeks: summariseLedger(entries).map((x) => ({
      weekOf: x.weekOf,
      parcels: x.parcels,
      courierCost: x.courierCostPaise / 100,
      fromCustomers: x.customerPaise / 100,
      fromSellers: x.sellerPaise / 100,
      campaign: x.campaignPaise / 100,
      platform: x.platformPaise / 100,
      toSellers: x.toSellerPaise / 100,
    })),
    commissionPercent: route.commissionPercent,
  };
}

export async function GET(request: Request) {
  const caller = await requireSection(request, "orders");
  if (caller instanceof NextResponse) return caller;
  return NextResponse.json(await view());
}

const PHONE = /^\d{10}$/;

export async function POST(request: Request) {
  const caller = await requireAdmin(request);
  if (caller instanceof NextResponse) return caller;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const who = caller.phone ?? caller.uid;
  const stamp = { updatedBy: who, updatedAt: FieldValue.serverTimestamp() };

  switch (body?.action) {
    case "saveCampaign": {
      const v = validateCampaignInput(body, Date.now());
      if (!v.ok || !v.value) return NextResponse.json({ error: v.error ?? "Check the campaign details." }, { status: 400 });
      await campaignRef().set(
        { ...v.value, ...stamp, ...(body.resetSpent === true ? { spentPaise: 0 } : {}) },
        { merge: true },
      );
      clearCampaignCache();
      break;
    }
    case "stopCampaign": {
      await campaignRef().set({ active: false, ...stamp }, { merge: true });
      clearCampaignCache();
      break;
    }
    case "recordDelhiveryBalance": {
      const rupees = Number(body.rupees);
      if (!Number.isFinite(rupees) || rupees < 0) {
        return NextResponse.json({ error: "Enter the balance shown in Delhivery's panel, in rupees." }, { status: 400 });
      }
      const paise = Math.round(rupees * 100);
      await walletsRef().set({
        delhivery: { recordedPaise: paise, recordedAt: new Date().toISOString(), estimatePaise: paise, at: new Date().toISOString() },
        ...stamp,
      }, { merge: true });
      break;
    }
    case "walletAlerts": {
      const below = Number(body.alertBelow);
      if (!Number.isFinite(below) || below <= 0) {
        return NextResponse.json({ error: "Alert threshold must be more than ₹0." }, { status: 400 });
      }
      const phones = Array.isArray(body.alertPhones)
        ? Array.from(new Set(body.alertPhones.map((p) => String(p).replace(/\D/g, "").slice(-10))))
        : [];
      if (phones.some((p) => !PHONE.test(p))) {
        return NextResponse.json({ error: "Each alert phone must be a 10-digit mobile number." }, { status: 400 });
      }
      await walletsRef().set({ alertBelow: Math.round(below), alertPhones: phones, ...stamp }, { merge: true });
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json(await view());
}
