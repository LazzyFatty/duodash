import { memo, useCallback, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode, KeyboardEvent } from 'react';
import type { UserData } from '../../types';
import { BigStatTile } from './BigStatTile';
import {
  AccountAgeIcon,
  CourseIcon,
  GemsIcon,
  LeagueIcon,
  StreakIcon,
  SuperIcon,
  TimeIcon,
  TotalXpIcon,
  TrendIcon,
  SnowflakeIcon,
} from '../icons';

interface KioskViewProps {
  userData: UserData | null;
  viewData: UserData;
}

interface KioskTile {
  key: string;
  label: string;
  value: string | number;
  icon: ReactNode;
  accentClass: string;
}

interface KioskPage {
  title: string;
  tiles: KioskTile[];
}

const ICON_CLASS = 'w-7 h-7 sm:w-9 sm:h-9';

function sumBy<K extends string>(list: Array<Record<K, number>> | undefined, key: K): number {
  return (list ?? []).reduce((acc, item) => acc + (item[key] ?? 0), 0);
}

/** 数字格式化：非有限数字返回 null，用于过滤掉缺失的可选指标瓦片。 */
function fmt(n: number | undefined | null): string | null {
  return typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString() : null;
}

function leagueLabel(league: string): string {
  return league.replace(/\s*\([^)]*\)\s*$/, '').trim() || '—';
}

function tile(
  key: string,
  label: string,
  value: string | number | null | undefined,
  icon: ReactNode,
  accentClass: string,
): KioskTile | null {
  return value === null || value === undefined || value === '' ? null : { key, label, value, icon, accentClass };
}

/**
 * 构建大屏页面。value 为 null 的瓦片会被过滤，保证每页整洁；
 * 核心指标（连胜/经验/宝石/段位…）始终存在，可选指标缺失时自动省略。
 */
function buildPages(data: UserData, hasUserData: boolean): KioskPage[] {
  const dash = '—';
  const g = <T,>(real: T): T | string => (hasUserData ? real : dash);
  const todayMinutes = data.dailyTimeHistory?.[data.dailyTimeHistory.length - 1]?.time;

  const rawPages: Array<{ title: string; tiles: Array<KioskTile | null> }> = [
    {
      title: '核心成就',
      tiles: [
        tile('streak', '连胜天数', g(data.streak), <StreakIcon className={ICON_CLASS} />, 'text-orange-500'),
        tile('xp', '总经验', g(fmt(data.totalXp)), <TotalXpIcon className={ICON_CLASS} />, 'text-yellow-500'),
        tile('gems', '宝石', g(fmt(data.gems)), <GemsIcon className={ICON_CLASS} />, 'text-blue-500'),
        tile('league', '当前段位', g(leagueLabel(data.league)), <LeagueIcon className={ICON_CLASS} />, 'text-purple-500'),
        tile('sessions', '累计课次', g(fmt(data.sessionCount)), <CourseIcon className={ICON_CLASS} />, 'text-brand-500'),
        tile('age', '账号天数', g(fmt(data.accountAgeDays)), <AccountAgeIcon className={ICON_CLASS} />, 'text-purple-500'),
      ],
    },
    {
      title: '今日 · 本周',
      tiles: [
        tile('todayXp', '今日经验', g(fmt(data.xpToday) ?? '0'), <TrendIcon className={ICON_CLASS} />, 'text-brand-500'),
        tile('todayLessons', '今日课程', g(fmt(data.lessonsToday) ?? '0'), <CourseIcon className={ICON_CLASS} />, 'text-blue-500'),
        tile('todayMin', '今日分钟', g(fmt(todayMinutes) ?? '0'), <TimeIcon className={ICON_CLASS} />, 'text-purple-500'),
        tile('weekXp', '本周经验', g(fmt(data.weeklyXp) ?? '0'), <TotalXpIcon className={ICON_CLASS} />, 'text-yellow-500'),
        tile('sevenXp', '近 7 天经验', g(fmt(sumBy(data.dailyXpHistory, 'xp'))), <TrendIcon className={ICON_CLASS} />, 'text-brand-500'),
        tile('sevenMin', '近 7 天分钟', g(fmt(sumBy(data.dailyTimeHistory, 'time'))), <TimeIcon className={ICON_CLASS} />, 'text-status-info'),
      ],
    },
    {
      title: '学习概况',
      tiles: [
        tile('lang', '当前语言', g(data.learningLanguage), <LeagueIcon className={ICON_CLASS} />, 'text-brand-500'),
        tile('courses', '课程数', g(fmt(data.courses?.length)), <CourseIcon className={ICON_CLASS} />, 'text-blue-500'),
        tile('goal', '每日目标', g(fmt(data.dailyGoal)), <TotalXpIcon className={ICON_CLASS} />, 'text-yellow-500'),
        tile('estTime', '预估投入', g(data.estimatedLearningTime), <TimeIcon className={ICON_CLASS} />, 'text-status-info'),
        tile('freeze', '连胜冻结', g(fmt(data.streakFreezeCount)), <SnowflakeIcon className={ICON_CLASS} />, 'text-blue-500'),
        tile('member', '会员状态', g(data.isPlus ? 'Super' : '免费'), <SuperIcon className={ICON_CLASS} />, 'text-purple-500'),
      ],
    },
  ];

  return rawPages
    .map((page) => ({ title: page.title, tiles: page.tiles.filter((t): t is KioskTile => t !== null) }))
    .filter((page) => page.tiles.length > 0);
}

export const KioskView = memo(function KioskView({ userData, viewData }: KioskViewProps): ReactElement {
  const hasUserData = userData !== null;
  const pages = useMemo(() => buildPages(viewData, hasUserData), [viewData, hasUserData]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const goTo = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const clamped = Math.max(0, Math.min(index, pages.length - 1));
      el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
    },
    [pages.length],
  );

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActive((prev) => (prev === index ? prev : index));
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(active + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(active - 1);
      }
    },
    [active, goTo],
  );

  return (
    <section
      className="mx-auto w-full max-w-6xl px-3 pb-4 sm:px-4 sm:pb-6 md:px-6"
      aria-roledescription="carousel"
      aria-label="学习数据大屏"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="hide-scrollbar flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
      >
        {pages.map((page, pageIdx) => (
          <div
            key={page.title}
            className="flex min-h-[60vh] w-full shrink-0 snap-center flex-col justify-center py-4 sm:min-h-[64vh] sm:py-6"
            role="group"
            aria-roledescription="slide"
            aria-label={`${page.title}（${pageIdx + 1} / ${pages.length}）`}
          >
            <h2 className="mb-3 text-center text-xs font-black uppercase tracking-[0.2em] text-neutral-500 sm:mb-5 sm:text-sm">
              {page.title}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
              {page.tiles.map((t) => (
                <BigStatTile key={t.key} icon={t.icon} label={t.label} value={t.value} accentClass={t.accentClass} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {pages.length > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 sm:mt-6">
          <button
            type="button"
            onClick={() => goTo(active - 1)}
            disabled={active === 0}
            className="surface-button hidden h-9 w-9 disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex"
            aria-label="上一页"
          >
            <span className="text-lg leading-none text-neutral-800">‹</span>
          </button>

          <div className="flex items-center gap-2" role="tablist" aria-label="页面导航">
            {pages.map((page, i) => (
              <button
                key={page.title}
                type="button"
                onClick={() => goTo(i)}
                className={`h-2.5 rounded-pill transition-all ${
                  i === active ? 'w-6 bg-brand-500' : 'w-2.5 bg-neutral-400 hover:bg-neutral-500'
                }`}
                aria-label={`第 ${i + 1} 页：${page.title}`}
                aria-current={i === active}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={() => goTo(active + 1)}
            disabled={active === pages.length - 1}
            className="surface-button hidden h-9 w-9 disabled:cursor-not-allowed disabled:opacity-40 sm:inline-flex"
            aria-label="下一页"
          >
            <span className="text-lg leading-none text-neutral-800">›</span>
          </button>
        </div>
      )}
    </section>
  );
});
