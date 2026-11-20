'use client';

import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowRight, HelpCircle, X } from 'lucide-react';
import { getHelpSectionById, type HelpSectionId } from '@/lib/help/help-content';

export interface HelpPopoverProps {
  sectionId: HelpSectionId;
  align?: 'left' | 'right';
  className?: string;
}

interface PopoverCoords {
  top: number;
  left: number;
  width: number;
}

const HOVER_CLOSE_DELAY_MS = 150;
const VIEWPORT_MARGIN_PX = 12;
const POPOVER_GAP_PX = 8;
const POPOVER_MAX_WIDTH_PX = 288;
const POPOVER_MIN_WIDTH_PX = 220;
const POPOVER_FALLBACK_HEIGHT_PX = 210;

const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function HelpPopover({
  sectionId,
  align = 'left',
  className = '',
}: HelpPopoverProps) {
  const section = getHelpSectionById(sectionId);
  const rawId = useId();
  const dialogId = `help-popover-${sectionId}-${rawId.replace(/:/g, '')}`;
  const titleId = `${dialogId}-title`;

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [coords, setCoords] = useState<PopoverCoords>({
    top: VIEWPORT_MARGIN_PX,
    left: VIEWPORT_MARGIN_PX,
    width: POPOVER_MAX_WIDTH_PX,
  });

  useEffect(() => {
    setMounted(true);
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const closeNow = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
    setPinned(false);
  }, [clearCloseTimer]);

  const scheduleHoverClose = useCallback(() => {
    clearCloseTimer();
    if (pinned) return;
    closeTimerRef.current = setTimeout(() => {
      setOpen(false);
      setPinned(false);
      closeTimerRef.current = null;
    }, HOVER_CLOSE_DELAY_MS);
  }, [clearCloseTimer, pinned]);

  const updatePosition = useCallback(() => {
    if (typeof window === 'undefined' || !triggerRef.current) return;

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(
      POPOVER_MAX_WIDTH_PX,
      Math.max(POPOVER_MIN_WIDTH_PX, viewportWidth - VIEWPORT_MARGIN_PX * 2)
    );

    const rawLeft = align === 'right' ? rect.right - width : rect.left;
    const left = Math.max(
      VIEWPORT_MARGIN_PX,
      Math.min(rawLeft, viewportWidth - width - VIEWPORT_MARGIN_PX)
    );

    const measuredHeight = dialogRef.current?.offsetHeight ?? 0;
    const dialogHeight = measuredHeight > 0 ? measuredHeight : POPOVER_FALLBACK_HEIGHT_PX;
    const fitsBelow = rect.bottom + POPOVER_GAP_PX + dialogHeight <= viewportHeight - VIEWPORT_MARGIN_PX;
    const fitsAbove = rect.top - POPOVER_GAP_PX - dialogHeight >= VIEWPORT_MARGIN_PX;

    let top = rect.bottom + POPOVER_GAP_PX;
    if (!fitsBelow && fitsAbove) {
      top = rect.top - POPOVER_GAP_PX - dialogHeight;
    } else if (!fitsBelow) {
      top = Math.max(VIEWPORT_MARGIN_PX, viewportHeight - dialogHeight - VIEWPORT_MARGIN_PX);
    }

    setCoords({ top, left, width });
  }, [align]);

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeNow();
        triggerRef.current?.focus();
      }
    };

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (dialogRef.current?.contains(target)) return;
      closeNow();
    };

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [open, closeNow, updatePosition]);

  if (!section) {
    return null;
  }

  const handleTriggerClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    clearCloseTimer();

    if (open && pinned) {
      setOpen(false);
      setPinned(false);
      return;
    }

    setOpen(true);
    setPinned(true);
  };

  const handleTriggerMouseEnter = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const handleTriggerMouseLeave = () => {
    scheduleHoverClose();
  };

  const handleDialogMouseEnter = () => {
    clearCloseTimer();
  };

  const handleDialogMouseLeave = () => {
    scheduleHoverClose();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Справка: ${section.title}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? dialogId : undefined}
        data-pdf-hide="true"
        onClick={handleTriggerClick}
        onMouseEnter={handleTriggerMouseEnter}
        onMouseLeave={handleTriggerMouseLeave}
        className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-text-muted hover:text-accent hover:bg-accent/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 transition-colors shrink-0 ${
          open ? 'text-accent bg-accent/10' : ''
        } ${className}`}
      >
        <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
      </button>

      {open &&
        mounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dialogRef}
            id={dialogId}
            role="dialog"
            aria-modal="false"
            aria-labelledby={titleId}
            data-pdf-hide="true"
            onMouseEnter={handleDialogMouseEnter}
            onMouseLeave={handleDialogMouseLeave}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: 'fixed',
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: `${coords.width}px`,
              zIndex: 60,
            }}
            className="bg-surface border border-border rounded-xl shadow-2xl p-3.5 text-left space-y-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 space-y-0.5">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-accent">
                  Глава {section.chapterNumber}
                </span>
                <p id={titleId} className="text-xs font-semibold text-white leading-snug">
                  {section.title}
                </p>
              </div>
              <button
                type="button"
                aria-label="Закрыть подсказку"
                onClick={closeNow}
                className="inline-flex items-center justify-center w-5 h-5 rounded-md text-text-muted hover:text-white hover:bg-surface-hover transition-colors shrink-0"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              {section.shortSummary}
            </p>

            <div className="pt-1 border-t border-border/60">
              <Link
                href={`/help#${section.id}`}
                onClick={closeNow}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
              >
                <span>Подробнее в справке</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
