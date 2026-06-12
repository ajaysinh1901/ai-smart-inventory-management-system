import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, ArrowLeft } from 'lucide-react';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full bg-app flex items-center justify-center p-6">
      <div className="bg-paper-card dark:bg-ink-card rounded-xl border border-paper-rule dark:border-ink-rule shadow-card p-10 max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/8 dark:bg-primary/15 text-primary flex items-center justify-center mx-auto mb-5 border border-primary/10 dark:border-primary/20">
          <Compass size={28} />
        </div>
        <p className="text-[10px] uppercase tracking-widest text-primary font-semibold mb-2">Error 404</p>
        <h1 className="text-xl font-bold text-ink dark:text-paper mb-2 tracking-tight">Page not found</h1>
        <p className="text-sm text-ink/50 dark:text-paper/50 leading-relaxed mb-8">
          The page you tried to open doesn't exist or has been moved.
        </p>
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 h-10 bg-primary text-white px-5 rounded-xl font-semibold text-sm hover:bg-primary-deep transition-colors shadow-sm shadow-primary/15"
        >
          <ArrowLeft size={15} /> Go to Dashboard
        </button>
      </div>
    </div>
  );
}
