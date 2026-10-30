import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Activity, ArrowDown, ArrowRight, Bell, BookOpenText, CalendarDays,
  ChartNoAxesCombined, Clock3, FileText, GitCompareArrows, Layers3,
  Network, Radio, Search, ShieldCheck, TrendingUp,
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'О TgMon | Аналитика Telegram-каналов',
  description: 'TgMon сохраняет наблюдения за Telegram-каналами: динамику, публикации и связи. Сравнивайте каналы, изучайте контент и объяснимые сигналы риска.',
};

const primaryLink = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-sky-300 motion-reduce:transition-none';
const secondaryLink = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-slate-500/70 bg-slate-950/30 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-accent hover:text-accent motion-reduce:transition-none';
const eyebrow = 'text-xs font-bold uppercase tracking-[0.2em] text-accent';

const outcomes = [
  { icon: TrendingUp, title: 'Понимать динамику', text: 'Следите за изменением аудитории и активности, когда накопилось достаточно наблюдений.' },
  { icon: GitCompareArrows, title: 'Сравнивать площадки', text: 'Сопоставляйте каналы за одинаковый период, чтобы увидеть различия в контенте и отклике.' },
  { icon: BookOpenText, title: 'Разбирать публикации', text: 'Находите собранные посты и изучайте доступные просмотры, реакции и форматы.' },
  { icon: ShieldCheck, title: 'Замечать сигналы', text: 'Проверяйте необычные изменения и объяснимые признаки риска в контексте канала.' },
];

const capabilities = [
  { icon: Search, title: 'Поиск по публикациям', text: 'Ищите посты в выбранных каналах, фильтруйте их по периоду и признакам, сохраняйте важное в закладки с заметками.' },
  { icon: Network, title: 'Наблюдаемые связи', text: 'Смотрите упоминания и пересылки, найденные в сохранённых постах доступных каналов. Карта не охватывает весь Telegram.' },
  { icon: FileText, title: 'Отчёты', text: 'Собирайте доступные показатели в отчёт канала, обращайтесь к истории сохранённых AI-отчётов и экспортируйте результат.' },
  { icon: Bell, title: 'Уведомления', text: 'Настраивайте правила для важных изменений и персональный Telegram-дайджест по своему списку каналов.' },
  { icon: CalendarDays, title: 'Афиша', text: 'Просматривайте анонсы мероприятий, найденные в отслеживаемых каналах, с переходом к исходным публикациям.' },
  { icon: Layers3, title: 'Контент в контексте', text: 'Сравнивайте форматы, отклик и отдельные публикации с историей самого канала, когда данных достаточно.' },
];

const audiences = [
  { title: 'Владелец канала', text: 'Следит за ростом, публикационной активностью и откликом на собственный контент.' },
  { title: 'Редактор и аналитик', text: 'Ищет удачные форматы, сравнивает периоды и готовит обоснованные выводы.' },
  { title: 'Команда коммуникаций', text: 'Наблюдает за темами, упоминаниями и изменениями в выбранном круге каналов.' },
  { title: 'Исследователь рынка и размещений', text: 'Сравнивает площадки и изучает доступные признаки рекламной активности.' },
];

function SectionHeading({ id, label, title, text, centered = false }: { id: string; label: string; title: string; text: string; centered?: boolean }) {
  return (
    <div className={centered ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className={eyebrow}>{label}</p>
      <h2 id={id} className="mt-4 text-3xl font-bold leading-tight tracking-tight text-white sm:text-4xl">{title}</h2>
      <p className="mt-5 text-base leading-7 text-slate-300">{text}</p>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="about-page min-h-screen overflow-hidden bg-background text-slate-100">
      <header className="relative z-10 border-b border-white/5">
        <div className="site-shell mx-auto flex min-h-20 items-center justify-between gap-4 px-5 sm:px-8">
          <Link href="/about" className="inline-flex items-center gap-3 text-lg font-bold tracking-tight text-white" aria-label="TgMon, о сервисе">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl border border-accent/40 bg-accent/10 text-accent"><Activity size={19} /></span>
            TgMon
          </Link>
          <nav aria-label="Основная навигация" className="flex items-center gap-4 sm:gap-7">
            <a href="#features" className="hidden text-sm font-medium text-slate-300 hover:text-white sm:inline">Возможности</a>
            <a href="#how-it-works" className="hidden text-sm font-medium text-slate-300 hover:text-white md:inline">Как работает</a>
            <Link href="/login" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-600 px-3 text-sm font-semibold text-white hover:border-accent hover:text-accent sm:px-4">Войти <ArrowRight size={15} aria-hidden="true" /></Link>
          </nav>
        </div>
      </header>

      <main>
        <section aria-labelledby="hero-title" className="about-hero relative isolate">
          <div className="site-shell relative z-10 mx-auto px-5 pb-24 pt-24 text-center sm:px-8 sm:pb-32 sm:pt-32 lg:pt-36">
            <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-bold tracking-wide text-accent"><Radio size={14} aria-hidden="true" /> TgMon · аналитика Telegram-каналов</p>
            <h1 id="hero-title" className="mx-auto mt-7 max-w-4xl text-4xl font-bold leading-[1.1] tracking-tight text-white sm:text-6xl lg:text-7xl">Увидеть, как живут каналы. <span className="text-accent">Понять, что меняется.</span></h1>
            <p className="mx-auto mt-7 max-w-2xl text-base leading-8 text-slate-200 sm:text-lg">TgMon собирает доступные данные Telegram-каналов и сохраняет историю наблюдений. Сравнивайте динамику, разбирайте публикации и замечайте связи, которые трудно увидеть по отдельным постам.</p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/login" className={primaryLink}>Перейти ко входу <ArrowRight size={18} aria-hidden="true" /></Link>
              <a href="#features" className={secondaryLink}>Узнать о возможностях <ArrowDown size={17} aria-hidden="true" /></a>
            </div>
            <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-slate-300">Вход через Telegram. Новому пользователю может потребоваться одобрение администратора.</p>

            <div className="about-observation mx-auto mt-16 max-w-4xl rounded-2xl border border-accent/25 p-5 text-left shadow-2xl shadow-black/30 sm:p-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
                <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">Внутри TgMon</p><p className="mt-1 text-sm text-slate-200">От собранных наблюдений к решениям</p></div>
                <span className="rounded-full border border-white/15 bg-slate-950/40 px-3 py-1 text-xs text-slate-300">Схема, без реальных данных</span>
              </div>
              <div className="grid gap-3 pt-5 md:grid-cols-3">
                {[
                  { icon: Radio, title: 'Каналы', text: 'Выбранные источники' },
                  { icon: Clock3, title: 'История', text: 'Посты и изменения со временем' },
                  { icon: ChartNoAxesCombined, title: 'Анализ', text: 'Сравнение, связи, отчёты' },
                ].map(({ icon: Icon, title, text }) => (
                  <div key={title} className="rounded-xl border border-white/10 bg-slate-950/55 p-5">
                    <Icon size={21} className="text-accent" aria-hidden="true" />
                    <h2 className="mt-5 text-base font-bold text-white">{title}</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="outcomes-title" className="site-shell mx-auto px-5 py-20 sm:px-8 sm:py-28">
          <SectionHeading id="outcomes-title" label="Что становится понятнее" title="Важен не один показатель, а его контекст" text="TgMon помогает перейти от разрозненных публикаций и снимков статистики к наблюдению за каналами во времени." centered />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {outcomes.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-border bg-surface p-6">
                <Icon size={24} className="text-accent" aria-hidden="true" />
                <h3 className="mt-7 text-lg font-bold text-white">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-300">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="features" aria-labelledby="features-title" className="about-section-glow scroll-mt-8 border-y border-white/5">
          <div className="site-shell mx-auto px-5 py-20 sm:px-8 sm:py-28">
            <SectionHeading id="features-title" label="Возможности" title="Исследуйте каналы с разных сторон" text="Один рабочий список связывает наблюдения за аудиторией, публикациями и связями. Можно перейти от общей картины к конкретному посту и вернуться к истории канала." centered />
            <div className="about-featured mt-12 grid gap-10 rounded-2xl border border-accent/20 p-7 sm:p-10 lg:grid-cols-2 lg:items-center lg:p-14">
              <div>
                <span className="inline-flex size-11 items-center justify-center rounded-xl border border-accent/30 bg-accent/10 text-accent"><ChartNoAxesCombined size={22} aria-hidden="true" /></span>
                <h3 className="mt-6 text-2xl font-bold text-white sm:text-3xl">Мониторинг, который помнит историю</h3>
                <p className="mt-5 text-base leading-7 text-slate-200">Добавьте доступные каналы в свой список. TgMon сохраняет наблюдаемые публикации, аудиторию и доступные показатели отклика, чтобы со временем было видно направление изменений.</p>
                <p className="mt-4 text-sm leading-7 text-slate-300">На главной можно следить за общей динамикой, а в сравнении сопоставлять два канала за выбранный период. Детальная страница помогает понять, какие публикации и форматы стоят за цифрами.</p>
              </div>
              <div className="space-y-3" aria-label="Пример разделов аналитики без показателей реальных каналов">
                {[
                  { icon: Activity, title: 'Обзор', text: 'Динамика и состояние наблюдений' },
                  { icon: GitCompareArrows, title: 'Сравнение', text: 'Два канала, один период' },
                  { icon: BookOpenText, title: 'Публикации', text: 'Содержание и доступный отклик' },
                ].map(({ icon: Icon, title, text }) => <div key={title} className="flex items-center gap-4 rounded-xl border border-white/10 bg-slate-950/65 p-4 sm:p-5"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent"><Icon size={20} aria-hidden="true" /></span><div><p className="font-bold text-white">{title}</p><p className="mt-1 text-sm text-slate-300">{text}</p></div><ArrowRight size={17} className="ml-auto shrink-0 text-slate-400" aria-hidden="true" /></div>)}
                <p className="pt-2 text-xs text-slate-300">Иллюстрация структуры сервиса. Числа и данные каналов не показаны.</p>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {capabilities.map(({ icon: Icon, title, text }) => <article key={title} className="rounded-2xl border border-border bg-surface/85 p-7"><Icon size={22} className="text-accent" aria-hidden="true" /><h3 className="mt-6 text-lg font-bold text-white">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-300">{text}</p></article>)}
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="process-title" className="site-shell mx-auto scroll-mt-8 px-5 py-20 sm:px-8 sm:py-28">
          <SectionHeading id="process-title" label="Как это работает" title="История складывается постепенно" text="Работа начинается с доступных каналов, затем сервис накапливает наблюдения и помогает изучать изменения. Полнота истории и отдельных показателей зависит от доступности данных и периода сбора." centered />
          <ol className="mt-12 grid gap-4 md:grid-cols-3">
            {[
              { number: '01', title: 'Выберите каналы', text: 'После получения доступа добавьте каналы, за которыми хотите наблюдать. У каждого пользователя свой рабочий список.' },
              { number: '02', title: 'Накопите наблюдения', text: 'Сбор сохраняет доступные публикации и показатели. Прошлую статистику, которой нет у источника, восстановить нельзя.' },
              { number: '03', title: 'Изучайте изменения', text: 'Сравнивайте каналы и периоды, смотрите посты, сигналы, связи и отчёты с учётом полноты данных.' },
            ].map(({ number, title, text }) => <li key={number} className="rounded-2xl border border-border bg-surface p-7"><span className="font-mono text-xs font-bold text-accent">{number}</span><h3 className="mt-10 text-lg font-bold text-white">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-300">{text}</p></li>)}
          </ol>
        </section>

        <section aria-labelledby="audience-title" className="border-y border-white/5 bg-surface/30">
          <div className="site-shell mx-auto px-5 py-20 sm:px-8 sm:py-28">
            <SectionHeading id="audience-title" label="Для кого" title="Один набор наблюдений, разные задачи" text="TgMon полезен тем, кто ведёт канал, работает с контентом, отслеживает инфополе или оценивает площадки для размещения." centered />
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {audiences.map(({ title, text }) => <article key={title} className="rounded-2xl border border-border bg-background p-7"><h3 className="text-lg font-bold text-white">{title}</h3><p className="mt-3 text-sm leading-7 text-slate-300">{text}</p></article>)}
            </div>
          </div>
        </section>

        <section aria-labelledby="access-title" className="site-shell mx-auto px-5 py-20 sm:px-8 sm:py-28">
          <div className="about-access rounded-2xl border border-accent/20 px-6 py-14 text-center sm:px-12 sm:py-20">
            <p className={eyebrow}>Доступ к рабочей части</p>
            <h2 id="access-title" className="mx-auto mt-5 max-w-2xl text-3xl font-bold leading-tight text-white sm:text-4xl">Начните с входа через Telegram</h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-200">Новый пользователь отправляет заявку. После одобрения администратором становятся доступны его список каналов, аналитика и рабочие инструменты.</p>
            <Link href="/login" className={`${primaryLink} mt-8`}>Перейти ко входу <ArrowRight size={18} aria-hidden="true" /></Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="site-shell mx-auto flex flex-col gap-4 px-5 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <span className="font-bold text-slate-200">TgMon</span>
          <nav aria-label="Ссылки в подвале" className="flex flex-wrap gap-6"><a href="#features" className="hover:text-white">Возможности</a><a href="#how-it-works" className="hover:text-white">Как работает</a><Link href="/login" className="hover:text-white">Вход</Link></nav>
        </div>
      </footer>
    </div>
  );
}
