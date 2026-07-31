import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';
import { usePageSeo } from '../hooks/usePageSeo';
import { useResourcesData } from '../hooks/useResourcesData';

/** FAQs — /resources/faqs. Accordion layout, mirrors CropDetailPage.tsx's FAQ section (<details>/<summary>), with FAQPage JSON-LD for rich results. */
export default function FaqsPage() {
  const { faqs, isLoading } = useResourcesData();

  usePageSeo({
    title: 'FAQs | Resources | Karan Arjun Pvt. Ltd.',
    description: 'Answers to common questions about our products and services.',
    structuredData: faqs.length > 0
      ? [{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: faqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer },
          })),
        }]
      : [],
  });

  return (
    <div className="flex flex-col relative min-h-screen">
      <section className="relative bg-primary py-20 md:py-28">
        <div className="max-w-4xl mx-auto px-8">
          <nav className="flex items-center gap-2 mb-6 text-xs font-sans font-bold text-white/60 uppercase tracking-widest">
            <Link to="/resources" className="hover:text-white transition-colors">Resources</Link>
            <Icons.ChevronRight className="w-3 h-3" />
            <span className="text-white">FAQs</span>
          </nav>
          <h1 className="font-sans text-[28px] md:text-[42px] font-extrabold text-white mb-4">Frequently Asked Questions</h1>
        </div>
      </section>

      <div className="bg-white py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-8">
          {isLoading && <p className="font-sans text-sm text-primary/60">Loading FAQs...</p>}
          {!isLoading && faqs.length === 0 && <p className="font-sans text-sm text-primary/60">No FAQs published yet.</p>}

          <div className="flex flex-col gap-4">
            {faqs.map((faq) => (
              <details key={faq.id} className="group bg-white rounded-lg border border-slate-200 p-6">
                <summary className="font-sans font-bold text-primary cursor-pointer list-none flex items-center justify-between gap-4">
                  {faq.question}
                  <Icons.ChevronRight className="w-4 h-4 text-primary/40 shrink-0 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="text-on-surface-variant font-serif text-sm mt-4 leading-relaxed">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
