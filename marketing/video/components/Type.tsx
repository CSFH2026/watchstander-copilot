import { interpolate, useCurrentFrame } from 'remotion';
import { FONT_STACK } from '@shared/brand';
import { C, MONO } from '../brand';

/** The showcase's type scale (globals.css .sc-kicker, .sc-head h2, .sc-lead), sized for 1080p. */
export const Kicker: React.FC<{ children: React.ReactNode; alarm?: boolean; size?: number }> = ({ children, alarm, size = 22 }) => (
  <div
    style={{
      fontFamily: alarm ? MONO : FONT_STACK,
      fontSize: size,
      fontWeight: 800,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color: alarm ? C.critical : C.accent,
    }}
  >
    {children}
  </div>
);

export const Title: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 60, style }) => (
  <div style={{ fontFamily: FONT_STACK, fontSize: size, lineHeight: 1.06, fontWeight: 850, letterSpacing: '-0.025em', color: C.text, textWrap: 'balance', ...style }}>
    {children}
  </div>
);

export const Lead: React.FC<{ children: React.ReactNode; size?: number; style?: React.CSSProperties }> = ({ children, size = 27, style }) => (
  <div style={{ fontFamily: FONT_STACK, fontSize: size, lineHeight: 1.45, color: C.muted, textWrap: 'pretty', ...style }}>{children}</div>
);

/** Counts up to `to` like the showcase's motion.tsx (ease-out cubic, about 1.1 s). */
export const CountUp: React.FC<{ to: number; at?: number; frames?: number; decimals?: number }> = ({ to, at = 0, frames = 33, decimals = 0 }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [at, at + frames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const v = to * (1 - Math.pow(1 - p, 3));
  return <>{decimals ? v.toFixed(decimals) : Math.round(v)}</>;
};

/** One showcase stat: big number, unit, label (globals.css .sc-stat). */
export const Stat: React.FC<{ value: number; prefix?: string; suffix?: string; label: string; at?: number; size?: number; width?: number }> = ({
  value,
  prefix,
  suffix,
  label,
  at = 0,
  size = 76,
  width,
}) => (
  <div style={{ width, fontFamily: FONT_STACK }}>
    <div style={{ fontSize: size, lineHeight: 1, fontWeight: 850, letterSpacing: '-0.03em', color: C.text, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
      {prefix && <span style={{ color: C.accent, fontSize: size * 0.6 }}>{prefix}</span>}
      <CountUp to={value} at={at} />
      {suffix && <span style={{ color: C.accent, fontSize: size * 0.6 }}>{suffix}</span>}
    </div>
    <div style={{ fontSize: Math.round(size * 0.32), color: C.muted, marginTop: 12, lineHeight: 1.35 }}>{label}</div>
  </div>
);
