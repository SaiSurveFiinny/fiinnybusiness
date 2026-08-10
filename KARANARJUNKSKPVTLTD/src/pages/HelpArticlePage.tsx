import { useMemo } from 'react';
import { Link, useParams, Navigate } from 'react-router-dom';
import { ChevronRight, BookOpen, CheckCircle2, AlertTriangle, Link2, ArrowLeft } from 'lucide-react';
import { HELP_ARTICLES, SECTIONS, type HelpSection } from '../data/helpArticles';

const SECTION_LABEL: Record<HelpSection, string> = Object.fromEntries(
  SECTIONS.map(s => [s.id, s.label])
) as Record<HelpSection, string>;

export default function HelpArticlePage() {
  const { articleId } = useParams<{ articleId: string }>();

  const article = useMemo(
    () => HELP_ARTICLES.find(a => a.id === articleId),
    [articleId]
  );

  if (!article) return <Navigate to="/help" replace />;

  return (
    <div style={{ maxWidth: '740px', margin: '0 auto', padding: '2rem 1.25rem 5rem' }}>

      {/* Breadcrumb */}
      <nav style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        <Link
          to="/help"
          style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--primary-light)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          <ArrowLeft size={13} /> Help Center
        </Link>
        <ChevronRight size={12} style={{ color: 'var(--text-tertiary)', opacity: 0.5 }} />
        <Link
          to="/help"
          style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', textDecoration: 'none' }}
        >
          {SECTION_LABEL[article.section]}
        </Link>
        <ChevronRight size={12} style={{ color: 'var(--text-tertiary)', opacity: 0.5 }} />
        <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 500 }}>{article.title}</span>
      </nav>

      {/* Module badge */}
      <span style={{
        display: 'inline-block',
        marginBottom: '0.75rem',
        fontSize: '0.75rem',
        fontWeight: 700,
        color: 'var(--primary-light)',
        background: 'hsla(152,60%,40%,0.1)',
        padding: '0.2rem 0.65rem',
        borderRadius: '6px',
        letterSpacing: '0.02em',
      }}>
        {article.module}
      </span>

      {/* Title */}
      <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.65rem', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.25 }}>
        {article.title}
      </h1>
      <p style={{ margin: '0 0 2rem', color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.6 }}>
        {article.summary}
      </p>

      {/* Article body */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {/* Purpose */}
        <Section
          icon={<BookOpen size={18} />}
          title="Purpose"
          accent="var(--primary-light)"
          accentBg="hsla(152,60%,40%,0.08)"
        >
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.65, fontSize: '0.93rem' }}>
            {article.purpose}
          </p>
        </Section>

        {/* When to Use */}
        <Section
          icon={<CheckCircle2 size={18} />}
          title="When to Use"
          accent="#4a90d9"
          accentBg="hsla(220,70%,50%,0.08)"
        >
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.65, fontSize: '0.93rem' }}>
            {article.whenToUse}
          </p>
        </Section>

        {/* Step-by-Step */}
        <Section
          icon={<CheckCircle2 size={18} />}
          title="Step-by-Step Instructions"
          accent="var(--secondary-dark)"
          accentBg="hsla(45,93%,47%,0.08)"
        >
          <ol style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {article.steps.map((step, i) => (
              <li key={i} style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.93rem', paddingLeft: '0.25rem' }}>
                {step}
              </li>
            ))}
          </ol>
        </Section>

        {/* Common Mistakes */}
        {article.commonMistakes.length > 0 && (
          <Section
            icon={<AlertTriangle size={18} />}
            title="Common Mistakes"
            accent="#e05c5c"
            accentBg="hsla(0,72%,51%,0.07)"
          >
            <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {article.commonMistakes.map((m, i) => (
                <li key={i} style={{ color: 'var(--text-secondary)', lineHeight: 1.6, fontSize: '0.93rem', paddingLeft: '0.25rem' }}>
                  {m}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* Related Modules */}
        {article.relatedModules.length > 0 && (
          <Section
            icon={<Link2 size={18} />}
            title="Related Modules"
            accent="#9b6dd6"
            accentBg="hsla(280,60%,55%,0.07)"
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {article.relatedModules.map(m => (
                <span
                  key={m}
                  style={{
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#9b6dd6',
                    background: 'hsla(280,60%,55%,0.1)',
                    padding: '0.3rem 0.75rem',
                    borderRadius: '8px',
                    border: '1px solid hsla(280,60%,55%,0.2)',
                  }}
                >
                  {m}
                </span>
              ))}
            </div>
          </Section>
        )}
      </div>

      {/* Back link */}
      <div style={{ marginTop: '3rem', paddingTop: '1.5rem', borderTop: '1px solid var(--surface-border)' }}>
        <Link
          to="/help"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', color: 'var(--primary-light)', textDecoration: 'none', fontWeight: 600 }}
        >
          <ArrowLeft size={15} /> Back to Help Center
        </Link>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  accent,
  accentBg,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  accentBg: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      border: '1px solid var(--surface-border)',
      borderRadius: '12px',
      overflow: 'hidden',
      background: 'var(--surface-raised)',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.625rem',
        padding: '0.875rem 1.1rem',
        background: accentBg,
        borderBottom: '1px solid var(--surface-border)',
      }}>
        <span style={{ color: accent, display: 'flex' }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.01em' }}>
          {title}
        </h2>
      </div>
      <div style={{ padding: '1rem 1.1rem' }}>
        {children}
      </div>
    </div>
  );
}
