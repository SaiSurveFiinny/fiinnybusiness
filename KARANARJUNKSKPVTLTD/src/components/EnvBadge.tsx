import { getEnvBadge } from '../utils/env';

// Small, high-visibility deployment-environment badge shown at the top of the
// app while running a local Vite dev server. Renders nothing on the hosted
// website (see getEnvBadge). No secrets or credentials are read here.
//
// UAT is styled as a loud amber pill and PRODUCTION as a loud red pill, so a
// developer can tell at a glance which backend the local dev server is pointed
// at — and, crucially, be warned when `npm run dev` is talking to production.
export default function EnvBadge() {
  const env = getEnvBadge();
  if (!env) return null;

  const isUat = env === 'UAT';
  const colors = isUat
    ? { bg: 'hsl(38, 92%, 50%)', fg: '#1a1200', border: 'hsl(38, 92%, 40%)', glow: 'hsla(38,92%,50%,0.45)' }
    : { bg: 'hsl(0, 84%, 55%)', fg: '#ffffff', border: 'hsl(0, 84%, 42%)', glow: 'hsla(0,84%,55%,0.45)' };

  return (
    <span
      title={isUat
        ? 'UAT environment — local dev server (npm run dev:uat)'
        : 'PRODUCTION backend — local dev server (npm run dev)'}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
        padding: '0.22rem 0.65rem', borderRadius: '999px',
        fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.07em',
        textTransform: 'uppercase', lineHeight: 1.3, whiteSpace: 'nowrap',
        background: colors.bg, color: colors.fg,
        border: `1px solid ${colors.border}`,
        boxShadow: `0 0 0 3px ${colors.glow}`,
      }}
    >
      <span style={{ fontSize: '0.6rem' }}>●</span>{env}
    </span>
  );
}
