import { memo } from 'react';
import type { ReactElement, ReactNode } from 'react';

interface BigStatTileProps {
  icon?: ReactNode;
  label: string;
  value: string | number;
  accentClass?: string;
}

/**
 * 大屏模式的单个大数字瓦片：数字用 clamp() 随视口缩放，平板/手机上都醒目。
 * 图标与数字共用 accentClass（图标为 currentColor SVG，自动取色）。
 */
export const BigStatTile = memo(function BigStatTile({
  icon,
  label,
  value,
  accentClass = 'text-neutral-800',
}: BigStatTileProps): ReactElement {
  return (
    <div className="panel-card animate-fade-in-up flex flex-col items-center justify-center gap-1.5 sm:gap-3 p-3 sm:p-6 text-center">
      {icon && <div className={`${accentClass} opacity-90`}>{icon}</div>}
      <div
        className={`font-black tabular-nums leading-none ${accentClass} text-[clamp(1.5rem,7vw,3.75rem)]`}
      >
        {value}
      </div>
      <div className="text-[10px] sm:text-sm font-bold uppercase tracking-wide text-neutral-500">
        {label}
      </div>
    </div>
  );
});
