'use client';

import React, { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

interface ExportPdfButtonProps {
  reportContainerId: string;
  channelTitle: string;
  period: string;
}

export function ExportPdfButton({ reportContainerId, channelTitle, period }: ExportPdfButtonProps) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const html2canvas = (await import('html2canvas-pro')).default;
      const { jsPDF } = await import('jspdf');

      const container = document.getElementById(reportContainerId);
      if (!container) {
        alert('Контейнер отчёта не найден');
        return;
      }

      // Temporarily expand the container for full capture
      const originalOverflow = container.style.overflow;
      container.style.overflow = 'visible';

      const canvas = await html2canvas(container, {
        backgroundColor: '#0f172a', // bg-background (slate-950)
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 1280,
        onclone: (clonedDoc) => {
          // Hide interactive elements in the clone
          const buttons = clonedDoc.querySelectorAll('[data-pdf-hide]');
          buttons.forEach((el) => {
            (el as HTMLElement).style.display = 'none';
          });
        },
      });

      container.style.overflow = originalOverflow;

      const imgData = canvas.toDataURL('image/png');
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      // A4 landscape for wider charts
      const pdfWidth = 297;
      const pdfHeight = 210;
      const margin = 10;
      const contentWidth = pdfWidth - margin * 2;

      const scaleFactor = contentWidth / imgWidth;
      const scaledHeight = imgHeight * scaleFactor;

      // Calculate pages
      const pageContentHeight = pdfHeight - margin * 2;
      const totalPages = Math.ceil(scaledHeight / pageContentHeight);

      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4',
      });

      // Header on first page
      pdf.setFontSize(8);
      pdf.setTextColor(150, 150, 150);

      const periodLabel = period === '24h' ? '24 часа' : period === '7d' ? '7 дней' : '30 дней';
      const dateStr = new Date().toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      for (let page = 0; page < totalPages; page++) {
        if (page > 0) {
          pdf.addPage();
        }

        const sourceY = page * pageContentHeight / scaleFactor;
        const sourceH = Math.min(pageContentHeight / scaleFactor, imgHeight - sourceY);

        // Create a temporary canvas for this page slice
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = imgWidth;
        pageCanvas.height = sourceH;
        const ctx = pageCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(canvas, 0, sourceY, imgWidth, sourceH, 0, 0, imgWidth, sourceH);
          const pageImgData = pageCanvas.toDataURL('image/png');
          pdf.addImage(pageImgData, 'PNG', margin, margin, contentWidth, sourceH * scaleFactor);
        }

        // Footer
        pdf.setFontSize(7);
        pdf.setTextColor(120, 120, 120);
        pdf.text(
          `${channelTitle} · ${periodLabel} · ${dateStr}`,
          margin,
          pdfHeight - 4
        );
        pdf.text(
          `Стр. ${page + 1} / ${totalPages}`,
          pdfWidth - margin - 20,
          pdfHeight - 4
        );
      }

      const safeTitle = channelTitle.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g, '_');
      pdf.save(`report_${safeTitle}_${period}_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('PDF export error:', err);
      alert('Ошибка при генерации PDF. Попробуйте ещё раз.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={exporting}
      className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all bg-slate-800 border border-border hover:border-accent hover:bg-slate-700 text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
      data-pdf-hide
    >
      {exporting ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Генерация PDF...
        </>
      ) : (
        <>
          <Download className="w-3.5 h-3.5" />
          Скачать PDF
        </>
      )}
    </button>
  );
}
