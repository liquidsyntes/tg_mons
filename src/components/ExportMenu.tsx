'use client';

import { useRef } from 'react';
import { Download } from 'lucide-react';

export interface ExportMenuItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

export function ExportMenu({ items }: { items: ExportMenuItem[] }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const close = () => { if (detailsRef.current) detailsRef.current.open = false; };
  return (
    <details ref={detailsRef} className="relative" data-pdf-hide>
      <summary className="list-none cursor-pointer inline-flex min-h-9 items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-border hover:border-slate-600">
        <Download className="w-3.5 h-3.5 text-accent" />
        Экспорт CSV / JSON
      </summary>
      <div className="absolute right-0 z-30 mt-1 min-w-52 bg-slate-900 border border-border rounded-lg shadow-xl p-1">
        {items.map(item => item.href ? (
          <a key={item.label} href={item.href} onClick={close} className="block px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-lg">
            {item.label}
          </a>
        ) : (
          <button key={item.label} type="button" onClick={() => { item.onClick?.(); close(); }} className="block w-full text-left px-3 py-2 text-xs text-slate-200 hover:bg-slate-800 rounded-lg">
            {item.label}
          </button>
        ))}
      </div>
    </details>
  );
}
