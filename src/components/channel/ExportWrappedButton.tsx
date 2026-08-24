'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import html2canvas from 'html2canvas-pro';

export function ExportWrappedButton({ filename = 'tgmon-wrapped.png' }: { filename?: string }) {
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    const el = document.getElementById('wrapped-card-export');
    if (!el) return;

    setLoading(true);
    try {
      // Temporarily make it visible in the viewport but positioned absolutely off-screen
      // It's already fixed at top: 200vh
      const canvas = await html2canvas(el, {
        scale: 1, // 1 is enough since element is 1080x1920
        useCORS: true,
        backgroundColor: '#0f172a',
      });

      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to export wrapped card', err);
      alert('Не удалось сгенерировать карточку');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-pink-500 hover:bg-pink-600 text-white transition-colors border border-pink-400 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      Wrapped Сторис
    </button>
  );
}
