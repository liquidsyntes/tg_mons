'use client';

import React, { useState, useEffect } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { ChannelDetailStats } from '@/lib/types';
import { ChannelPdfTemplate } from '@/components/pdf/ChannelPdfTemplate';

interface ExportPdfButtonProps {
  reportContainerId?: string;
  channelTitle: string;
  period: '24h' | '7d' | '30d' | string;
  channelId?: number | string;
  stats?: ChannelDetailStats | null;
}

export function ExportPdfButton({
  reportContainerId = 'report-content',
  channelTitle,
  period,
  channelId,
  stats,
}: ExportPdfButtonProps) {
  const [exporting, setExporting] = useState(false);
  const [activeStats, setActiveStats] = useState<ChannelDetailStats | null>(stats || null);

  useEffect(() => {
    if (stats) {
      setActiveStats(stats);
    }
  }, [stats]);

  const handleExport = async () => {
    setExporting(true);
    try {
      let dataToRender = activeStats;

      // Если данные еще не переданы, пробуем подгрузить их по API
      if (!dataToRender && channelId) {
        const res = await fetch(`/api/stats/channel/${channelId}?period=${period}`);
        if (res.ok) {
          dataToRender = await res.json();
          setActiveStats(dataToRender);
        }
      }

      if (!dataToRender) {
        alert('Данные для формирования отчёта пока недоступны. Попробуйте через пару секунд.');
        return;
      }

      // Небольшая задержка для гарантированного рендеринга шаблона
      await new Promise((resolve) => setTimeout(resolve, 150));

      const html2canvas = (await import('html2canvas-pro')).default;
      const { jsPDF } = await import('jspdf');

      const pages = Array.from(document.querySelectorAll<HTMLElement>('#pdf-render-root [data-pdf-page]'));
      if (pages.length === 0) throw new Error('Печатные страницы отчёта не найдены');
      const pageCanvases: HTMLCanvasElement[] = [];

      for (const pageEl of pages) {
        const canvas = await html2canvas(pageEl, {
          backgroundColor: '#ffffff',
          scale: 2,
          useCORS: true,
          logging: false,
          onclone: (clonedDoc) => {
            const root = clonedDoc.getElementById('pdf-render-root');
            if (root) {
              root.style.position = 'static';
              root.style.left = '0';
              root.style.top = '0';
            }
          },
        });

        pageCanvases.push(canvas);
      }

      // Формируем PDF из всех печатных страниц формата А4 Portrait (210 x 297 мм)
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      pageCanvases.forEach((canvas, index) => {
        if (index > 0) {
          pdf.addPage();
        }
        const imgData = canvas.toDataURL('image/png');
        pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, undefined, 'FAST');
      });

      const safeTitle = (channelTitle || 'channel').replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g, '_');
      pdf.save(`report_${safeTitle}_${period}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Ошибка при генерации PDF. Попробуйте ещё раз.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <button
        onClick={handleExport}
        disabled={exporting}
        className="inline-flex min-h-9 items-center justify-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all bg-slate-800 border border-border hover:border-accent hover:bg-slate-700 text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
        data-pdf-hide
      >
        {exporting ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />
            Генерация PDF...
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            Скачать PDF
          </>
        )}
      </button>

      {/* 
        Скрытый контейнер для гарантированного рендеринга и подготовки 
        векторного макета печати А4 без визуального вмешательства в интерфейс
      */}
      <div
        id="pdf-render-root"
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: '794px',
          overflow: 'hidden',
          pointerEvents: 'none',
          zIndex: -9999,
        }}
        aria-hidden="true"
      >
        {activeStats && <ChannelPdfTemplate stats={activeStats} period={period} />}
      </div>
    </>
  );
}
