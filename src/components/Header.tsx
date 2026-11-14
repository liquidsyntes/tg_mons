'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  AlertCircle,
  Bookmark,
  Calendar,
  Check,
  ChevronDown,
  FileText,
  GitCompareArrows,
  ListTodo,
  LogOut,
  Megaphone,
  Plus,
  Radio,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/utils';
import { AddChannelModal } from '@/components/AddChannelModal';

interface HeaderProps {
  lastGlobalUpdate?: string | null;
  totalChannels?: number;
  activeChannels?: number;
  onRefresh?: () => Promise<void>;
}

type HeaderMenuKey = 'posts' | 'analytics' | 'manage';

interface NavMenuItem {
  href: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const POSTS_MENU_ITEMS: NavMenuItem[] = [
  {
    href: '/posts',
    label: 'Поиск постов',
    description: 'Общая лента, теги и вирусность',
    icon: Search,
  },
  {
    href: '/posts?saved=1&view=board',
    label: 'Контент-план (Доска)',
    description: 'Доска идей, черновики и слоты',
    icon: ListTodo,
  },
  {
    href: '/posts?saved=1',
    label: 'Закладки (Список)',
    description: 'Сохранённые посты списком',
    icon: Bookmark,
  },
  {
    href: '/posts?onlyAds=true',
    label: 'Реклама и креативы (Ad Spy)',
    description: 'Рекламодатели и кластеры креативов',
    icon: Megaphone,
  },
];

const ANALYTICS_MENU_ITEMS: NavMenuItem[] = [
  {
    href: '/reports',
    label: 'AI Отчёты',
    description: 'Архив AI-разборов и стратегий',
    icon: FileText,
  },
  {
    href: '/events',
    label: 'Афиша событий',
    description: 'Ивенты и упоминания по датам',
    icon: Calendar,
  },
  {
    href: '/compare',
    label: 'Сравнение каналов',
    description: 'Сравнение охватов и динамики',
    icon: GitCompareArrows,
  },
];

function notifyPostsPageNavigation(href: string) {
  if (
    typeof window !== 'undefined' &&
    window.location.pathname === '/posts' &&
    href.startsWith('/posts')
  ) {
    window.dispatchEvent(new CustomEvent('tgmon:posts-navigate', { detail: href }));
  }
}

export function Header({
  lastGlobalUpdate = null,
  totalChannels = 0,
  activeChannels = 0,
  onRefresh,
}: HeaderProps) {
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectMessage, setCollectMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [version, setVersion] = useState('…');
  const [openMenu, setOpenMenu] = useState<HeaderMenuKey | null>(null);
  const [localStats, setLocalStats] = useState<{
    total: number;
    active: number;
    lastUpdate: string | null;
  } | null>(null);
  const headerRef = useRef<HTMLElement>(null);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/stats/overview');
      if (res.ok) {
        const data = await res.json();
        setLocalStats({
          total: data.totalChannels,
          active: data.activeChannels,
          lastUpdate: data.lastGlobalUpdate,
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (totalChannels === 0 && activeChannels === 0) {
      fetchStats();
    }
  }, [totalChannels, activeChannels]);

  useEffect(() => {
    let active = true;
    fetch('/api/version', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (!active) return;
        setVersion(
          data &&
            typeof data === 'object' &&
            'version' in data &&
            typeof data.version === 'string' &&
            /^[0-9a-f]{7}$/.test(data.version)
            ? data.version
            : 'н/д',
        );
      })
      .catch(() => {
        if (active) setVersion('н/д');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!openMenu) return;

    const handleMouseDown = (event: MouseEvent) => {
      if (headerRef.current && !headerRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenMenu(null);
      }
    };

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenu]);

  const displayTotal = totalChannels || localStats?.total || 0;
  const displayActive = activeChannels || localStats?.active || 0;
  const displayUpdate = lastGlobalUpdate || localStats?.lastUpdate || null;
  const updatedLabel = formatRelativeTime(displayUpdate);

  const toggleMenu = (menu: HeaderMenuKey) => {
    setOpenMenu((current) => (current === menu ? null : menu));
  };

  const handleLinkClick = (href: string) => {
    setOpenMenu(null);
    notifyPostsPageNavigation(href);
  };

  const handleTriggerCollect = async () => {
    setOpenMenu(null);
    setIsCollecting(true);
    setCollectMessage(null);
    try {
      const res = await fetch('/api/collect/run', {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Ошибка запуска сбора');
      }
      setCollectMessage({ text: 'Сбор завершен успешно!' });
      if (onRefresh) {
        await onRefresh();
      } else {
        await fetchStats();
        window.location.reload();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка сбора';
      setCollectMessage({ text: message, isError: true });
    } finally {
      setIsCollecting(false);
      setTimeout(() => setCollectMessage(null), 4000);
    }
  };

  return (
    <>
      <header
        ref={headerRef}
        className="border-b border-border bg-surface/85 backdrop-blur sticky top-0 z-30"
      >
        <div className="site-shell mx-auto px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
          {/* Левая часть хедера: логотип и компактная навигация с выпадающими списками */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link
              href="/"
              onClick={() => setOpenMenu(null)}
              className="flex items-center gap-2.5 group shrink-0"
            >
              <div className="w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center">
                <Image
                  src="/tg_mon_logo.png"
                  alt="TG Monitor Logo"
                  width={36}
                  height={36}
                  className="w-full h-full object-contain"
                />
              </div>

              <div>
                <span className="font-bold text-sm sm:text-lg tracking-tight text-white flex items-center gap-2.5">
                  TG Monitor
                  <img
                    src="/ef.png"
                    alt="Live Badge"
                    className="hidden xl:block h-[22px] w-auto object-contain"
                  />
                </span>
                <span className="block mt-0.5 text-[10px] leading-none font-mono text-slate-500">
                  v. {version}
                </span>
              </div>
            </Link>

            <div className="hidden md:block w-px h-5 bg-border ml-1 mr-1" />

            <nav aria-label="Основная навигация" className="hidden md:flex items-center gap-1">
              <Link
                href="/"
                onClick={() => setOpenMenu(null)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <Radio className="w-3.5 h-3.5 text-accent" />
                <span>Каналы</span>
              </Link>

              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={openMenu === 'posts'}
                  onClick={() => toggleMenu('posts')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    openMenu === 'posts'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <Search className="w-3.5 h-3.5 text-slate-400" />
                  <span>Публикации</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                      openMenu === 'posts' ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {openMenu === 'posts' && (
                  <div
                    role="menu"
                    aria-label="Раздел публикаций"
                    className="absolute left-0 mt-2 w-72 rounded-xl border border-border bg-slate-900/95 backdrop-blur shadow-2xl p-1.5 z-50 space-y-0.5"
                  >
                    {POSTS_MENU_ITEMS.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          role="menuitem"
                          href={item.href}
                          onClick={() => handleLinkClick(item.href)}
                          className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-800 transition-colors"
                        >
                          <Icon className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-white">
                              {item.label}
                            </span>
                            <span className="block text-[11px] text-slate-400">
                              {item.description}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="relative">
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={openMenu === 'analytics'}
                  onClick={() => toggleMenu('analytics')}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    openMenu === 'analytics'
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Аналитика</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                      openMenu === 'analytics' ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {openMenu === 'analytics' && (
                  <div
                    role="menu"
                    aria-label="Раздел аналитики"
                    className="absolute left-0 mt-2 w-72 rounded-xl border border-border bg-slate-900/95 backdrop-blur shadow-2xl p-1.5 z-50 space-y-0.5"
                  >
                    {ANALYTICS_MENU_ITEMS.map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          role="menuitem"
                          href={item.href}
                          onClick={() => handleLinkClick(item.href)}
                          className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-slate-800 transition-colors"
                        >
                          <Icon className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                          <span className="min-w-0">
                            <span className="block text-xs font-medium text-white">
                              {item.label}
                            </span>
                            <span className="block text-[11px] text-slate-400">
                              {item.description}
                            </span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            </nav>
          </div>

          {/* Правая часть хедера: компактный статус, главное действие и меню управления */}
          <div className="flex items-center gap-2 shrink-0">
            <div
              title={`Активны ${displayActive} из ${displayTotal} · Обновлено: ${updatedLabel}`}
              className="hidden lg:inline-flex items-center gap-1.5 rounded-lg border border-border bg-slate-900/70 px-2.5 py-1.5 text-xs font-mono text-slate-300"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                {displayActive}/{displayTotal}
              </span>
              <span className="text-slate-500">активны</span>
            </div>

            {collectMessage && (
              <div
                role="status"
                className={`hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${
                  collectMessage.isError
                    ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {collectMessage.isError ? (
                  <AlertCircle className="w-3.5 h-3.5" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{collectMessage.text}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setOpenMenu(null);
                setIsAddModalOpen(true);
              }}
              aria-label="Добавить канал"
              className="inline-flex min-h-9 items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-accent hover:bg-accent-hover text-slate-950 transition-colors shadow-sm shadow-accent/20"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">Добавить канал</span>
            </button>

            <div className="relative">
              <button
                type="button"
                aria-label="Управление"
                aria-haspopup="menu"
                aria-expanded={openMenu === 'manage'}
                onClick={() => toggleMenu('manage')}
                className={`inline-flex min-h-9 items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  openMenu === 'manage'
                    ? 'bg-slate-700 text-white border-slate-500'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-border'
                }`}
              >
                <Settings className={`w-4 h-4 ${isCollecting ? 'animate-spin text-accent' : ''}`} />
                <span className="hidden sm:inline">Управление</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                    openMenu === 'manage' ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {openMenu === 'manage' && (
                <div
                  role="menu"
                  aria-label="Меню управления"
                  className="absolute right-0 mt-2 w-72 rounded-xl border border-border bg-slate-900/95 backdrop-blur shadow-2xl p-2 z-50 space-y-2"
                >
                  <div className="rounded-lg border border-border/80 bg-slate-950/60 px-2.5 py-2 text-[11px] font-mono text-slate-400 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-slate-200">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>
                        {displayActive} из {displayTotal} активны
                      </span>
                    </div>
                    <div>Обновлено: {updatedLabel}</div>
                  </div>

                  {/* Навигация для компактных экранов (< md) */}
                  <div className="md:hidden border-t border-border/80 pt-1.5 space-y-0.5">
                    <Link
                      role="menuitem"
                      href="/"
                      onClick={() => handleLinkClick('/')}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                    >
                      <Radio className="w-3.5 h-3.5 text-accent" />
                      <span>Каналы</span>
                    </Link>
                    {[...POSTS_MENU_ITEMS, ...ANALYTICS_MENU_ITEMS].map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.href}
                          role="menuitem"
                          href={item.href}
                          onClick={() => handleLinkClick(item.href)}
                          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
                        >
                          <Icon className="w-3.5 h-3.5 text-accent" />
                          <span>{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>

                  <div className="border-t border-border/80 pt-1.5 space-y-1">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleTriggerCollect}
                      disabled={isCollecting}
                      title="Запустить цикл сбора данных вручную"
                      className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 text-accent ${isCollecting ? 'animate-spin' : ''}`}
                      />
                      <span>{isCollecting ? 'Сбор...' : 'Собрать сейчас'}</span>
                    </button>

                    <Link
                      role="menuitem"
                      href="/settings"
                      onClick={() => setOpenMenu(null)}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 transition-colors"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                      <span>Настройки</span>
                    </Link>

                    <form action="/api/auth/logout" method="post">
                      <button
                        type="submit"
                        role="menuitem"
                        aria-label="Выйти"
                        className="w-full flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-300 hover:bg-rose-500/10 transition-colors"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Выйти</span>
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <AddChannelModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={async () => {
          setIsAddModalOpen(false);
          await fetchStats();
          if (onRefresh) {
            await onRefresh();
          } else {
            window.location.reload();
          }
        }}
      />
    </>
  );
}
