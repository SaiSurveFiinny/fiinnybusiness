/**
 * Dealer status constants — shared by the sales web portal, the admin panel,
 * and the Flutter mobile app.
 *
 * The mobile app stores status as the Dart enum's `.name` (camelCase), matching
 * the convention used for DealerType and DealerInterest:
 *   DealerStatus.notInterested → stored as "notInterested"
 *
 * Any string outside PREDEFINED_STATUSES is a custom status written by the app;
 * it is displayed verbatim (title-cased) with a neutral badge colour.
 *
 * Firestore field: dealers/{id}.status (string | undefined)
 */

export const PREDEFINED_STATUSES = [
  'pitching',
  'interested',
  'ongoing',
  'pending',
  'completed',
  'closed',
  'notInterested',
] as const;

export type PredefinedStatus = (typeof PREDEFINED_STATUSES)[number];

export const STATUS_LABELS: Record<string, string> = {
  pitching:      'Pitching',
  interested:    'Interested',
  ongoing:       'Ongoing',
  pending:       'Pending',
  completed:     'Completed',
  closed:        'Closed',
  notInterested: 'Not Interested',
};

/** Tailwind classes for each status badge (bg + text). Falls back to neutral. */
export const STATUS_COLORS: Record<string, string> = {
  pitching:      'bg-blue-100 text-blue-700',
  interested:    'bg-green-100 text-green-700',
  ongoing:       'bg-amber-100 text-amber-700',
  pending:       'bg-orange-100 text-orange-700',
  completed:     'bg-emerald-100 text-emerald-700',
  closed:        'bg-slate-100 text-slate-600',
  notInterested: 'bg-red-100 text-red-600',
};

export const STATUS_NEUTRAL = 'bg-purple-100 text-purple-700';

/** Human-readable label for any status value (predefined or custom). */
export function statusLabel(status: string | undefined): string {
  if (!status) return '—';
  return STATUS_LABELS[status] ?? titleCase(status);
}

/** Badge colour classes for any status value. */
export function statusColor(status: string | undefined): string {
  if (!status) return 'bg-surface-container text-on-surface-variant';
  return STATUS_COLORS[status] ?? STATUS_NEUTRAL;
}

function titleCase(s: string): string {
  return s
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
