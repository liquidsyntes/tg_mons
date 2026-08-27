'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2, AlertTriangle } from 'lucide-react';

interface ChannelDangerZoneProps {
  channelId: string | number;
  channelTitle: string;
}

export function ChannelDangerZone({ channelId, channelTitle }: ChannelDangerZoneProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Отключить мониторинг канала «${channelTitle}»? История будет сохранена.`)) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/channels/${channelId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        router.push('/');
      } else {
        alert('Ошибка при удалении');
      }
    } catch (err) {
      console.error(err);
      alert('Ошибка при удалении');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-6 shadow-sm mt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-rose-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Опасная зона
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Отключить мониторинг этого канала. Он будет удален из списков, но накопленная история сохранится в базе.
          </p>
        </div>
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap border border-rose-500/20"
        >
          <Trash2 className="w-4 h-4" />
          {isDeleting ? 'Удаление...' : 'Отключить мониторинг'}
        </button>
      </div>
    </div>
  );
}
