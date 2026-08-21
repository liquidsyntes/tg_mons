import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TG Monitor — Мониторинг и сравнение Telegram-каналов',
  description: 'Дашборд для отслеживания динамики подписчиков, публикационной активности и сравнения Telegram-каналов с конкурентами.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="dark">
      <body className="bg-background text-slate-100 min-h-screen flex flex-col antialiased selection:bg-accent/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
