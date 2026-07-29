import { Link } from 'react-router-dom';
import { Icons } from '../Icons';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Standalone "Learn & Grow" teaser for Research & Innovation and Resources —
 * previously bundled inside ConnectSection alongside the support ticket
 * form; restored here as its own section now that Support has moved to its
 * own dedicated page. Content/links unchanged from that version.
 */
export function LearnAndGrow() {
  const { t } = useLanguage();

  const links = [
    { icon: Icons.FileText, title: t.learn_grow_research_title, desc: t.learn_grow_research_desc, href: '/research-innovation' },
    { icon: Icons.HelpCircle, title: t.learn_grow_resources_title, desc: t.learn_grow_resources_desc, href: '/resources' },
  ];

  return (
    <section className="relative z-10 bg-surface py-20">
      <div className="max-w-4xl mx-auto px-8">
        <div className="text-center mb-10">
          <h2 className="font-sans text-3xl md:text-4xl font-extrabold text-primary mb-3 tracking-tight">
            {t.learn_grow_title}
          </h2>
          <p className="text-on-surface-variant font-serif text-base md:text-lg">{t.learn_grow_subtitle}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {links.map((link) => (
            <Link
              key={link.title}
              to={link.href}
              className="bg-white rounded-[2rem] p-8 border border-slate-100 shadow-sm hover:shadow-lg transition-shadow flex flex-col gap-3 group"
            >
              <link.icon className="w-8 h-8 text-primary" />
              <h3 className="font-sans font-bold text-primary text-lg">{link.title}</h3>
              <p className="text-sm text-on-surface-variant font-serif flex-grow">{link.desc}</p>
              <span className="font-sans font-bold text-sm text-primary inline-flex items-center gap-1 group-hover:gap-2 transition-all">
                {t.learn_grow_link} <Icons.ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
