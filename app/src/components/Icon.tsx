// Line icons from the web (style.css .i-*), and the arch mark. 20px by default, colour = currentColor of the caller.
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useApp } from '../providers/AppProvider';
import { ICONS, type IconName } from './icons';

export type { IconName };

/** <Icon name="door" />. sm = 16, lg = 26. Chevrons point the reading way (flipped in Arabic). */
export function Icon({ name, size = 20, color, sm, lg, flip }: { name: IconName; size?: number; color?: string; sm?: boolean; lg?: boolean; flip?: boolean }) {
  const { c, rtl } = useApp();
  const s = sm ? 16 : lg ? 26 : size;
  const col = color ?? c.ink;
  const ic = ICONS[name];
  const mirrored = flip ?? (name === 'chev' && rtl);
  const common = ic.fill ? { fill: col } : { fill: 'none', stroke: col, strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" style={mirrored ? { transform: [{ scaleX: -1 }] } : undefined} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {ic.shapes.map((sh, i) => {
        const a = sh.a as Record<string, string>;
        if (sh.t === 'circle') return <Circle key={i} cx={a.cx} cy={a.cy} r={a.r} {...common} />;
        if (sh.t === 'rect') return <Rect key={i} x={a.x} y={a.y} width={a.width} height={a.height} rx={a.rx} {...common} />;
        return <Path key={i} d={a.d} {...common} />;
      })}
    </Svg>
  );
}

/** The arch mark from the web top bar (22×28). Not a logo: the name Sina/سنة is set in type. */
export function ArchMark({ size = 28, color }: { size?: number; color?: string }) {
  const { c } = useApp();
  const col = color ?? c.plum;
  return (
    <Svg width={(size * 22) / 28} height={size} viewBox="0 0 22 28" fill="none" stroke={col} strokeWidth={1.6} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d="M2 27V11a9 9 0 0 1 18 0v16z" />
      <Path d="M6 27V12a5 5 0 0 1 10 0v15" />
    </Svg>
  );
}
