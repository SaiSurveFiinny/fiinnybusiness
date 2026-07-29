import { Link } from 'react-router-dom';
import { Icons } from '../components/Icons';

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col py-24 px-8 max-w-4xl mx-auto gap-8 min-h-screen">
      <header className="text-center max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/5 rounded-full text-primary border border-primary/10 mb-6">
          <Icons.Sprout className="w-4 h-4" />
          <span className="font-sans font-bold text-xs uppercase tracking-widest">Coming Soon</span>
        </div>
        <h1 className="font-sans text-[32px] md:text-5xl font-extrabold text-primary mb-4 leading-tight">{title}</h1>
        <p className="text-base md:text-lg text-on-surface-variant font-serif">{description}</p>
      </header>

      <section className="bg-white rounded-[2rem] p-10 border border-slate-100 shadow-sm text-center space-y-6">
        <p className="font-serif text-on-surface-variant leading-relaxed">
          This section is being built as part of our transition into Karan Arjun Pvt. Ltd. Check back soon, or reach
          out to us directly in the meantime.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <a
            href="https://wa.me/919307199040"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-primary text-secondary-container px-6 py-3 rounded-xl font-sans font-bold hover:bg-primary-container transition-colors"
          >
            <Icons.MessageCircle className="w-5 h-5" />
            Contact via WhatsApp
          </a>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-sans font-bold border border-primary/20 text-primary hover:bg-primary/5 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </section>
    </div>
  );
}
