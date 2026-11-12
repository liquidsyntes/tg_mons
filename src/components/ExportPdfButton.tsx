'use client';

import React, { useState, useEffect } from 'react';
import { Download, Briefcase, Loader2 } from 'lucide-react';
import type {
  AdPriceResult,
  ChannelDemographicsSummary,
  ChannelDetailStats,
} from '@/lib/types';
import type { ChannelPdfMode } from '@/lib/channel-pdf-report';
import { ChannelPdfTemplate } from '@/components/pdf/ChannelPdfTemplate';

interface ExportPdfButtonProps {
  reportContainerId?: string;
  channelTitle: string;
  period: '24h' | '7d' | '30d' | string;
  channelId?: number | string;
  stats?: ChannelDetailStats | null;
  adPrice?: AdPriceResult | null;
}

export function ExportPdfButton({
  channelTitle,
  period,
  channelId,
  stats,
  adPrice,
}: ExportPdfButtonProps) {
  const [exportingMode, setExportingMode] = useState<ChannelPdfMode | null>(null);
  const [renderMode, setRenderMode] = useState<ChannelPdfMode>('report');
  const [activeStats, setActiveStats] = useState<ChannelDetailStats | null>(
    stats || null
  );

  useEffect(() => {
    if (stats) {
      setActiveStats((prev) => ({
        ...stats,
        adPrice: stats.adPrice ?? adPrice ?? prev?.adPrice ?? null,
        demographics: stats.demographics ?? prev?.demographics ?? null,
      }));
    }
  }, [stats, adPrice]);

  const handleExport = async (mode: ChannelPdfMode) => {
    setExportingMode(mode);
    setRenderMode(mode);
    try {
      let dataToRender = activeStats
        ? {
            ...activeStats,
            adPrice: activeStats.adPrice ?? adPrice ?? null,
          }
        : null;

      if (!dataToRender && channelId) {
        const res = await fetch(
          `/api/stats/channel/${channelId}?period=${period}`
        );
        if (res.ok) {
          const fetched: ChannelDetailStats = await res.json();
          dataToRender = {
            ...fetched,
            adPrice: fetched.adPrice ?? adPrice ?? null,
          };
        }
      }

      if (!dataToRender) {
        alert(
          'Данные для формирования отчёта пока недоступны. Попробуйте через пару секунд.'
        );
        return;
      }

      if (mode === 'mediakit' && channelId) {
        const [priceRes, demoRes] = await Promise.all([
          !dataToRender.adPrice
            ? fetch(`/api/channels/${channelId}/ad-price`).catch(() => null)
            : Promise.resolve(null),
          !dataToRender.demographics
            ? fetch(`/api/stats/demographics/${channelId}`).catch(() => null)
            : Promise.resolve(null),
        ]);

        if (priceRes && priceRes.ok) {
          const priceJson = (await priceRes.json()) as AdPriceResult;
          dataToRender = { ...dataToRender, adPrice: priceJson };
        }
        if (demoRes && demoRes.ok) {
          const demoJson = (await demoRes.json()) as {
            demographics?: ChannelDemographicsSummary | null;
          };
          if (demoJson?.demographics) {
            dataToRender = {
              ...dataToRender,
              demographics: demoJson.demographics,
            };
          }
        }
      }

      setActiveStats(dataToRender);

      // Небольшая задержка для гарантированного рендеринга шаблона выбранного режима
      await new Promise((resolve) => setTimeout(resolve, 150));

      const html2canvas = (await import('html2canvas-pro')).default;
      const { jsPDF } = await import('jspdf');

      const pages = Array.from(
        document.querySelectorAll<HTMLElement>(
          '#pdf-render-root [data-pdf-page]'
        )
      );
      if (pages.length === 0) {
        throw new Error('Печатные страницы отчёта не найдены');
      }
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

      const safeTitle = (channelTitle || 'channel').replace(
        /[^a-zA-Zа-яА-ЯёЁ0-9_-]/g,
        '_'
      );
      const prefix = mode === 'mediakit' ? 'mediakit' : 'report';
      pdf.save(
        `${prefix}_${safeTitle}_${period}_${
          new Date().toISOString().split('T')[0]
        }.pdf`
      );
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Ошибка при генерации PDF. Попробуйте ещё раз.');
    } finally {
      setExportingMode(null);
    }
  };

  const exporting = exportingMode !== null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5" data-pdf-hide>
        <button
          onClick={() => void handleExport('report')}
          disabled={exporting}
          className="inline-flex min-h-9 items-center justify-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all bg-slate-800 border border-border hover:border-accent hover:bg-slate-700 text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
          data-pdf-hide
        >
          {exportingMode === 'report' ? (
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

        <button
          onClick={() => void handleExport('mediakit')}
          disabled={exporting}
          className="inline-flex min-h-9 items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all bg-emerald-500/10 border border-emerald-500/30 hover:border-emerald-400 hover:bg-emerald-500/20 text-emerald-300 disabled:opacity-50 disabled:cursor-not-allowed"
          data-pdf-hide
        >
          {exportingMode === 'mediakit' ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              Медиакит...
            </>
          ) : (
            <>
              <Briefcase className="w-3.5 h-3.5" />
              Медиакит PDF
            </>
          )}
        </button>
      </div>

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
        {activeStats && (
          <ChannelPdfTemplate
            stats={activeStats}
            period={period}
            mode={renderMode}
          />
        )}
      </div>
    </>
  );
}
