'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2 } from 'lucide-react';

interface AILoadingStatusProps {
  isRunning: boolean;
  success: boolean;
  messages: string[];
  onSuccessClear: () => void;
}

export function AILoadingStatus({ isRunning, success, messages, onSuccessClear }: AILoadingStatusProps) {
  const [msgIndex, setMsgIndex] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      setMsgIndex(0);
      return;
    }
    
    // Cycle messages every 3 seconds
    const interval = setInterval(() => {
      setMsgIndex((prev) => (prev < messages.length - 1 ? prev + 1 : prev));
    }, 3000);
    
    return () => clearInterval(interval);
  }, [isRunning, messages.length]);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        onSuccessClear();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [success, onSuccessClear]);

  if (!isRunning && !success) return null;

  return (
    <div className="mt-4 p-3 rounded-xl bg-slate-900/50 border border-border flex items-center gap-3 animate-in fade-in zoom-in-95 duration-300">
      {isRunning && (
        <>
          <div className="relative flex items-center justify-center w-6 h-6">
            <div className="absolute w-full h-full border-2 border-accent/20 border-t-accent rounded-full animate-spin"></div>
            <Sparkles className="w-3 h-3 text-accent animate-pulse" />
          </div>
          <span className="text-sm text-slate-300 font-medium animate-pulse">{messages[msgIndex]}</span>
        </>
      )}
      {!isRunning && success && (
        <>
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-medium">Отчет успешно сформирован!</span>
        </>
      )}
    </div>
  );
}
