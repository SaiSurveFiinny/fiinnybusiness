/**
 * Re-exports from the canonical source at app/sales/dealers/dealer-status.ts.
 * Both the sales web portal and the admin panel share the same constants so
 * badge colours, labels, and enum values never drift apart.
 */
export {
  PREDEFINED_STATUSES,
  STATUS_LABELS,
  STATUS_COLORS,
  STATUS_NEUTRAL,
  statusLabel,
  statusColor,
  type PredefinedStatus,
} from '../../../sales/dealers/dealer-status';
