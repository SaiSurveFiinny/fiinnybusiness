import { motion } from 'framer-motion';
import { Zap, ShieldCheck, ClipboardCheck } from 'lucide-react';
import { home, container, eyebrow } from './tokens';

// "Real businesses, real results" — kept as a proof section, but with NO
// fabricated customers, quotes, logos or traction numbers. Instead it states
// the concrete, honest difference the product is built to make. Swap in genuine
// testimonials/metrics here once they are available.
const results = [
    {
        icon: Zap,
        title: 'Bill in seconds, not minutes',
        desc: 'Ring up a sale at the counter or raise a GST invoice for a client, then send it on WhatsApp — without leaving the screen you started on.',
    },
    {
        icon: ClipboardCheck,
        title: 'Nothing slips through',
        desc: 'Every udhaar balance, stock batch and payment lands in one ledger, so the numbers still add up at the end of the month.',
    },
    {
        icon: ShieldCheck,
        title: 'Ready when the taxman is',
        desc: 'HSN-coded invoices and GSTR-1 / GSTR-3B summaries stay filing-ready, so compliance is a download — not a scramble.',
    },
];

export default function HomeTestimonials() {
    return (
        <section id="testimonials" style={{ background: home.color.cream, padding: '6.5rem 2rem' }}>
            <div style={container}>
                <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
                    <span style={eyebrow}>Real businesses, real results</span>
                    <h2 style={{
                        fontFamily: home.font.heading, fontWeight: 800, color: home.color.ink,
                        fontSize: '2.9rem', letterSpacing: '-0.03em', margin: '0.9rem 0 0.75rem',
                    }}>
                        The difference FIINNY is built to make
                    </h2>
                    <p style={{ fontFamily: home.font.body, color: home.color.body, fontSize: '1.15rem', maxWidth: '640px', margin: '0 auto', lineHeight: 1.6 }}>
                        Built around the day-to-day reality of Indian shopfloors, warehouses and
                        billing counters — not a generic template.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    {results.map((r, i) => (
                        <motion.div
                            key={r.title}
                            initial={{ opacity: 0, y: 26 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.1, duration: 0.55 }}
                            style={{
                                background: home.color.surface, border: `1px solid ${home.color.line}`,
                                borderRadius: home.radius.lg, padding: '2.1rem 2rem',
                                boxShadow: home.shadow.card,
                            }}
                        >
                            <div style={{
                                width: 52, height: 52, borderRadius: home.radius.sm, marginBottom: '1.2rem',
                                background: home.color.emeraldSoft, color: home.color.forest,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <r.icon size={26} />
                            </div>
                            <h3 style={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: '1.25rem', color: home.color.ink, margin: '0 0 0.5rem' }}>
                                {r.title}
                            </h3>
                            <p style={{ fontFamily: home.font.body, fontSize: '0.96rem', color: home.color.body, lineHeight: 1.6, margin: 0 }}>
                                {r.desc}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
