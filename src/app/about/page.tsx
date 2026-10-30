import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowDownRight, ArrowRight, BarChart3, Bell, BookOpenText,
  CalendarDays, ChartNoAxesCombined, GitCompareArrows, Network,
  Search, ShieldCheck, TrendingUp,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'О TgMon | Аналитика Telegram-каналов',
  description: 'TgMon сохраняет наблюдения за Telegram-каналами: динамику, публикации и связи. Сравнивайте каналы, изучайте контент и сигналы риска.',
};

const tasks = [
  { icon: TrendingUp, title: 'Следить за динамикой', text: 'Видеть, как меняются аудитория и активность канала по мере накопления наблюдений.' },
  { icon: GitCompareArrows, title: 'Сравнивать каналы', text: 'Сопоставлять каналы за один период и замечать различия в публикациях и отклике.' },
  { icon: BookOpenText, title: 'Разбирать публикации', text: 'Находить посты, изучать доступные просмотры и реакции, сравнивать форматы.' },
  { icon: ShieldCheck, title: 'Замечать необычное', text: 'Получать объяснимые сигналы риска и самостоятельно оценивать их в контексте.' },
];

const features = [
  { icon: ChartNoAxesCombined, title: 'Мониторинг и сравнение', text: 'История наблюдений, динамика каналов и сравнение по выбранным периодам.' },
  { icon: Search, title: 'Публикации и контент', text: 'Поиск по собранным постам, отклик аудитории, форматы и заметные публикации.' },
  { icon: Network, title: 'Сигналы и связи', text: 'Объяснимые признаки риска, наблюдаемые упоминания и пересылки между доступными каналами.' },
  { icon: Bell, title: 'Отчёты и уведомления', text: 'Сохранённые отчёты, выгрузки и персональные правила для важных изменений.' },
  { icon: CalendarDays, title: 'Афиша событий', text: 'Анонсы мероприятий из отслеживаемых каналов в отдельной афише.' },
];

const audiences = [
  { title: 'Владельцу канала', text: 'Понять, как меняются собственные публикации и отклик на них.' },
  { title: 'Редактору или аналитику', text: 'Сравнить форматы, найти посты и подготовить выводы на основе наблюдений.' },
  { title: 'Команде коммуникаций', text: 'Следить за темами, упоминаниями и важными изменениями в выбранных каналах.' },
  { title: 'Исследователю рынка и размещений', text: 'Сопоставить площадки и изучить доступные признаки рекламной активности.' },
];

const primaryLink = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent';
const sectionLabel = 'text-xs font-bold uppercase tracking-[0.22em] text-accent';

export default function AboutPage() {
  return (
    <div className="about-page min-h-screen overflow-hidden bg-background text-slate-100">
      <header className="border-b border-border/80">
        <div className="site-shell mx-auto flex min-h-20 items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/about" className="inline-flex items-center gap-3 text-lg font-bold tracking-tight text-white" aria-label="TgMon, о сервисе">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl border border-accent/40 bg-accent/10 text-accent"><BarChart3 size={19} /></span>
            TgMon
          </Link>
          <nav aria-label="Основная навигация" className="flex items-center gap-3 sm:gap-7">
            <a href="#features" className="hidden text-sm font-medium text-slate-300 hover:text-white sm:inline">Возможности</a>
            <Link href="/login" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold text-white hover:border-accent/60 hover:text-accent sm:px-4">Ко входу <ArrowRight size={15} aria-hidden="true" /></Link>
          </nav>
        </div>
      </header>

      <main>
        <section aria-labelledby="hero-title" className="relative border-b border-border/80">
          <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-sky-500/[0.07] blur-3xl" />
          <div className="site-shell relative mx-auto grid gap-12 px-5 py-20 sm:px-8 sm:py-28 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-14 lg:py-36">
            <div className="max-w-2xl">
              <p className={sectionLabel}>Аналитика Telegram-каналов</p>
              <h1 id="hero-title" className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-6xl">Понимайте каналы через <span className="text-accent">данные и историю</span></h1>
              <p className="mt-7 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">TgMon собирает и сохраняет доступные данные Telegram-каналов. Изучайте динамику, публикации и наблюдаемые связи во времени, чтобы принимать решения с опорой на факты.</p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/login" className={primaryLink}>Перейти ко входу <ArrowRight size={18} aria-hidden="true" /></Link>
                <a href="#features" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-accent hover:text-accent">Узнать о возможностях <ArrowDownRight size={18} aria-hidden="true" /></a>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-400">Вход через Telegram. Новым пользователям может потребоваться одобрение администратора.</p>
            </div>

            <div className="relative mx-auto w-full max-w-lg" aria-label="Иллюстрация процесса наблюдения за каналами">
              <div className="rounded-2xl border border-slate-700 bg-surface/95 p-5 shadow-2xl shadow-black/30 sm:p-7">
                <div className="flex items-center justify-between border-b border-border pb-5">
                  <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">Наблюдение</p><p className="mt-1 text-sm text-slate-300">От каналов к выводам</p></div>
                  <span className="rounded-full bg-accent/15 px-3 py-1 text-xs font-semibold text-accent">Схема</span>
                </div>
                <div className="relative mt-7 space-y-3 before:absolute before:bottom-9 before:left-[17px] before:top-8 before:w-px before:bg-slate-600">
                  {[
                    ['01', 'Каналы', 'Выбранные источники'],
                    ['02', 'Наблюдения', 'Публикации и изменения'],
                    ['03', 'Анализ', 'Сравнение, связи, отчёты'],
                  ].map(([number, title, detail]) => (
                    <div key={number} className="relative flex items-center gap-4 rounded-xl border border-border bg-background px-4 py-4">
                      <span className="z-10 grid size-9 shrink-0 place-items-center rounded-full border border-accent/50 bg-slate-900 font-mono text-xs font-bold text-accent">{number}</span>
                      <div><p className="text-sm font-bold text-white">{title}</p><p className="mt-1 text-xs text-slate-400">{detail}</p></div>
                      <ArrowRight size={16} className="ml-auto text-slate-500" aria-hidden="true" />
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-xs leading-5 text-slate-400">Иллюстрация процесса, без данных реальных каналов.</p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="tasks-title" className="site-shell mx-auto px-5 py-20 sm:px-8 sm:py-24">
          <p className={sectionLabel}>Какие задачи решает</p>
          <h2 id="tasks-title" className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Вопросы, на которые помогают ответить наблюдения</h2>
          <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tasks.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-border bg-surface p-6">
                <Icon size={23} className="text-accent" aria-hidden="true" />
                <h3 className="mt-7 text-lg font-bold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="features" aria-labelledby="features-title" className="scroll-mt-8 border-y border-border bg-surface/40">
          <div className="site-shell mx-auto px-5 py-20 sm:px-8 sm:py-24">
            <p className={sectionLabel}>Возможности</p>
            <h2 id="features-title" className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">От общей картины до конкретной публикации</h2>
            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2 lg:grid-cols-3">
              {features.map(({ icon: Icon, title, text }) => (
                <article key={title} className="bg-background p-6 sm:p-8">
                  <Icon size={22} className="text-accent" aria-hidden="true" />
                  <h3 className="mt-5 text-lg font-bold text-white">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="process-title" className="site-shell mx-auto grid gap-10 px-5 py-20 sm:px-8 sm:py-24 lg:grid-cols-[0.7fr_1.3fr] lg:gap-20">
          <div><p className={sectionLabel}>Как это работает</p><h2 id="process-title" className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">История появляется по мере сбора</h2><p className="mt-5 text-sm leading-7 text-slate-300">Полнота истории и отдельных показателей зависит от доступности данных и периода, в течение которого ведётся сбор.</p></div>
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              ['01', 'Добавить каналы', 'Выберите доступные для наблюдения каналы.'],
              ['02', 'Накопить наблюдения', 'Сервис сохраняет доступные публикации и изменения.'],
              ['03', 'Изучать результаты', 'Смотрите динамику, сравнения и отчёты.'],
            ].map(([number, title, text]) => (
              <li key={number} className="rounded-2xl border border-border bg-surface p-6"><span className="font-mono text-xs font-bold text-accent">{number}</span><h3 className="mt-8 text-base font-bold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-300">{text}</p></li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="audience-title" className="border-y border-border bg-surface/40">
          <div className="site-shell mx-auto px-5 py-20 sm:px-8 sm:py-24">
            <p className={sectionLabel}>Для кого</p><h2 id="audience-title" className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">Для работы с каналами в разных ролях</h2>
            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              {audiences.map(({ title, text }) => <article key={title} className="rounded-2xl border border-border bg-background p-6 sm:p-7"><h3 className="text-base font-bold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-300">{text}</p></article>)}
            </div>
          </div>
        </section>

        <section aria-labelledby="access-title" className="site-shell mx-auto px-5 py-20 sm:px-8 sm:py-24">
          <div className="rounded-2xl border border-accent/25 bg-gradient-to-br from-slate-900 to-slate-950 px-6 py-12 text-center sm:px-12 sm:py-16">
            <p className={sectionLabel}>Начните с входа</p>
            <h2 id="access-title" className="mx-auto mt-4 max-w-2xl text-3xl font-bold tracking-tight text-white sm:text-4xl">Перейдите к аналитике своих каналов</h2>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-slate-300">На странице входа можно продолжить через Telegram. Для нового аккаунта отправляется заявка, доступ к рабочей части появляется после одобрения администратором.</p>
            <Link href="/login" className={`${primaryLink} mt-8`}>Перейти ко входу <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="site-shell mx-auto flex flex-col gap-4 px-5 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="font-bold text-slate-200">TgMon</span>
          <nav aria-label="Ссылки в подвале" className="flex gap-6"><a href="#features" className="hover:text-white">Возможности</a><Link href="/login" className="hover:text-white">Вход</Link></nav>
        </div>
      </footer>
    </div>
  );
}
