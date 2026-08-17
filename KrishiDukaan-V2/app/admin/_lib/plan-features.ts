/**
 * Single source of truth for the feature keys a Plan/Subscription can carry.
 * No existing screen in the app gates on any of these yet — this catalog is
 * what admins pick from when defining what a plan "includes", stored as a
 * plain string[] snapshot on both `plans` and `subscriptions` docs. Wiring
 * real enforcement into specific screens is a separate, later effort.
 */
export const PLAN_FEATURE_CATALOG = [
  { key: "advanced_analytics", label: "Advanced Analytics" },
  { key: "reports", label: "Reports" },
  { key: "api_access", label: "API Access" },
  { key: "priority_support", label: "Priority Support" },
  { key: "bulk_discounts", label: "Bulk Discounts" },
  { key: "brand_page", label: "Company / Brand Page" },
] as const;

export type PlanFeatureKey = (typeof PLAN_FEATURE_CATALOG)[number]["key"];

export function featureLabel(key: string): string {
  return PLAN_FEATURE_CATALOG.find((f) => f.key === key)?.label ?? key;
}

export type Plan = {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: "INR";
  durationMonths: number;
  seats: number;
  features: string[];
  limits: Record<string, number>;
  status: "active" | "inactive" | "archived";
  displayOrder: number;
  trialDays: number;
  createdBy: string;
  createdAt: unknown;
  updatedAt: unknown;
};
