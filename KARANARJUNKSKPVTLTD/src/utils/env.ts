// Deployment-environment detection for the dev-only environment badge.
//
// Everything here is derived from Vite's build configuration
// (`import.meta.env`) — there are no hardcoded environment values and no
// secrets/credentials are read or exposed.
//
//   npm run dev         → MODE 'development', DEV=true  → PRODUCTION backend (.env.local)
//   npm run dev:uat     → MODE 'uat',         DEV=true  → UAT backend (.env.uat)
//   npm run build       → DEV=false (hosted production build) → badge hidden
//   npm run build:uat   → DEV=false (hosted UAT build)        → badge hidden
//
// The badge is intentionally shown only while running a local Vite dev server
// (VS Code development), never on the hosted website.

export type AppEnv = 'UAT' | 'PRODUCTION';

/**
 * The environment label to display, or `null` when no badge should be shown.
 *
 * Returns `null` for any built/hosted deployment (`import.meta.env.DEV` is false
 * for `vite build` output), so the badge appears only on a local dev server.
 */
export function getEnvBadge(): AppEnv | null {
  // Dev server only — hosted builds must never show the badge.
  if (!import.meta.env.DEV) return null;
  return import.meta.env.MODE === 'uat' ? 'UAT' : 'PRODUCTION';
}
