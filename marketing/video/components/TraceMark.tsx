import { interpolate, useCurrentFrame } from 'remotion';
import { C } from '../brand';

/**
 * The TRACE mark from ui/app/showcase/trace-mark.tsx, with the globals.css .tm-* colours inlined.
 * `drawAt` draws it in: the line, then the nodes in chain order, then the signed seal and check.
 */
export const TraceMark: React.FC<{ size?: number; drawAt?: number }> = ({ size = 120, drawAt }) => {
  const frame = useCurrentFrame();
  const p = (start: number, len = 10) =>
    drawAt === undefined ? 1 : interpolate(frame, [drawAt + start, drawAt + start + len], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const nodes: [number, number][] = [
    [22, 38],
    [60, 38],
    [98, 38],
    [60, 64],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" style={{ display: 'block' }}>
      <rect width="120" height="120" rx="26" fill={C.markBg} stroke={C.borderStrong} strokeWidth={2} />
      <path d="M22 38H98M60 38V90" fill="none" stroke="#ffffff" strokeWidth={3.5} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p(0, 18)} />
      {nodes.map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={6.5} fill={C.markBg} stroke="#ffffff" strokeWidth={3} opacity={p(6 + i * 4, 6)} />
      ))}
      <circle cx="60" cy="90" r={11 * p(24, 8)} fill={C.seal} />
      <path d="M54.5 90.5L58.5 94.5L66 86" fill="none" stroke={C.markBg} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p(30, 8)} />
    </svg>
  );
};
