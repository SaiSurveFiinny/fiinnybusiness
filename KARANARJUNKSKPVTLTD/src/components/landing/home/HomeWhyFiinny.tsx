import { motion } from 'framer-motion';
import { Layers, RefreshCw, Flag, TrendingUp } from 'lucide-react';
import { home, container, eyebrow } from './tokens';

// Positioning, not features. Each point explains why FIINNY is different from
// the alternatives (stitched-together tools, spreadsheets, legacy desktop
// accounting apps) — it does not re-list the capabilities section.
const points = [
    {
        icon: Layers,
        title: 'One system, one source of truth',
        desc: 'Billing, inventory, khata, payments and analytics run on the same live data — so there is nothing to re-key, reconcile or export between five different apps.',
    },
    {
        icon: RefreshCw,
        title: 'A modern alternative to legacy tools',
        desc: 'Web-native and multi-device, without Tally-style complexity or the single-device limits of older billing apps. Your team works from the counter, the office or the phone.',
    },
    {
        icon: Flag,
        title: 'India-first, not bolted on',
        desc: 'GST rules, HSN codes, offline-first billing and full English / हिन्दी / मराठी are built into the core — designed for real shopfloors and patchy networks, not adapted from a Western template.',
    },
    {
        icon: TrendingUp,
        title: 'Grows with your business',
        desc: 'Start as a single shop and expand into distribution or manufacturing on the very same platform — your data, workflows and history come with you.',
    },
];

export default function HomeWhyFiinny() {
    return (
        <section style={{ background: home.color.surface, padding: '6.5rem 2rem' }}>
            <div style={container}>
                <div style={{ maxWidth: '720px', marginBottom: '3.25rem' }}>
                    <span style={eyebrow}>Why FIINNY</span>
                    <h2 style={{
                        fontFamily: home.font.heading, fontWeight: 800, color: home.color.ink,
                        fontSize: '2.9rem', letterSpacing: '-0.03em', margin: '0.9rem 0 0.75rem',
                    }}>
                        Not another generic SaaS tool
                    </h2>
                    <p style={{ fontFamily: home.font.body, color: home.color.body, fontSize: '1.15rem', lineHeight: 1.6, margin: 0 }}>
                        Plenty of software can print an invoice. FIINNY is built to run the whole
                        business behind it — here's what sets it apart.
                    </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '1.5rem' }}>
                    {points.map((p, i) => (
                        <motion.div
                            key={p.title}
                            initial={{ opacity: 0, y: 24 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            viewport={{ once: true }}
                            transition={{ delay: (i % 2) * 0.1, duration: 0.55 }}
                            style={{
                                position: 'relative',
                                background: home.color.cream, border: `1px solid ${home.color.line}`,
                                borderRadius: home.radius.lg, padding: '2.1rem 2rem 2.1rem',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{
                                    width: 52, height: 52, borderRadius: home.radius.sm, flexShrink: 0,
                                    background: home.color.emeraldSoft, color: home.color.forest,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <p.icon size={26} />
                                </div>
                                <span style={{
                                    fontFamily: home.font.heading, fontWeight: 800, fontSize: '2rem',
                                    color: home.color.line, lineHeight: 1, marginLeft: 'auto',
                                }}>
                                    0{i + 1}
                                </span>
                            </div>
                            <h3 style={{ fontFamily: home.font.heading, fontWeight: 700, fontSize: '1.3rem', color: home.color.ink, margin: '0 0 0.6rem' }}>
                                {p.title}
                            </h3>
                            <p style={{ fontFamily: home.font.body, fontSize: '0.98rem', color: home.color.body, lineHeight: 1.6, margin: 0 }}>
                                {p.desc}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
}
