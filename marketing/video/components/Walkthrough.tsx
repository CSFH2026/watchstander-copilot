import { AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FONT_STACK } from '@shared/brand';
import { BrowserFrame, type BrowserTheme } from '@shared/components/BrowserFrame';
import { APP_URL, C } from '../brand';
import { Kicker, Lead, Title } from './Type';

/**
 * A captured screen's viewport in CSS px (capture/capture.spec.ts): 1440x810 at 2x for the landscape
 * cut, 430x760 at 3x for the vertical one. Every rect and focus is in those CSS px.
 */
export type View = { w: number; h: number };
export const DESKTOP: View = { w: 1440, h: 810 };
export const PHONE: View = { w: 430, h: 760 };

export type Rect = { x: number; y: number; w: number; h: number };
/** What the camera shows: the top-left corner and the width; the height follows the viewport's shape. */
export type Focus = { x: number; y: number; w: number };
export const FULL: Focus = { x: 0, y: 0, w: 1e6 };

export type Copy = { kicker: string; title: string; lead?: string; extra?: React.ReactNode; alarm?: boolean };

export type Beat = {
  /** A file in public/screens, without .png. */
  screen: string;
  dur: number;
  to: Focus;
  /** Where the camera starts; the previous beat's focus when left out. */
  from?: Focus;
  /** Rings around the point of the beat; the rest of the screen dims. */
  ring?: Rect[];
  /** A document laid over the browser: the printed sheet, or the drafted CASREP. */
  doc?: (local: number) => React.ReactNode;
  copy: Copy;
};

export type Layout = 'landscape' | 'vertical';

const CROSS = 12;
const MOVE = 40;

const THEME: BrowserTheme = {
  shell: C.bg,
  bar: '#070b10',
  border: C.borderStrong,
  urlBg: C.surface2,
  urlText: C.muted,
  shadow: '0 50px 120px rgba(0,0,0,0.65)',
  radius: 14,
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

function fit(f: Focus, v: View): Focus {
  const w = Math.min(v.w, f.w);
  const h = (w * v.h) / v.w;
  return { w, x: Math.max(0, Math.min(v.w - w, f.x)), y: Math.max(0, Math.min(v.h - h, f.y)) };
}

function mix(a: Focus, b: Focus, t: number): Focus {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t };
}

/** One captured screen with its camera move and rings, inside the frame body. */
const Screen: React.FC<{ beat: Beat; from: Focus; local: number; width: number; view: View }> = ({ beat, from, local, width, view }) => {
  const t = interpolate(local, [0, MOVE], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const f = fit(mix(fit(from, view), fit(beat.to, view), t), view);
  const s = width / f.w;
  const ringOn = interpolate(local, [MOVE - 8, MOVE + 10], [0, 1], clamp);
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: C.bg }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: view.w, height: view.h, transformOrigin: '0 0', transform: `scale(${s}) translate(${-f.x}px, ${-f.y}px)` }}>
        <Img src={staticFile(`screens/${beat.screen}.png`)} style={{ width: view.w, height: view.h, display: 'block' }} />
        {beat.ring?.map((r, i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: r.x - 6,
              top: r.y - 6,
              width: r.w + 12,
              height: r.h + 12,
              borderRadius: 10,
              border: `${3 / s}px solid ${C.accent}`,
              // Only the first ring dims the screen, so two rings do not stack two shades.
              boxShadow: i === 0 ? `0 0 0 3000px rgba(3,6,10,${0.5 * ringOn})` : undefined,
              opacity: ringOn,
            }}
          />
        ))}
      </div>
    </div>
  );
};

/**
 * The anchored browser (house rule): the window stays put while the captured screen, its camera,
 * and the copy beside it cross-fade from beat to beat. Real screens only; nothing here is redrawn.
 */
export const Walkthrough: React.FC<{ beats: Beat[]; layout?: Layout; background?: React.ReactNode }> = ({ beats, layout = 'landscape', background }) => {
  const frame = useCurrentFrame();
  const vertical = layout === 'vertical';
  const view = vertical ? PHONE : DESKTOP;
  const FW = vertical ? 760 : 1220;
  const BODY = Math.round((FW * view.h) / view.w);
  const frameBox = vertical ? { left: 160, top: 490, width: FW } : { left: 70, top: 168, width: FW };

  const starts: number[] = [];
  beats.reduce((acc, b, i) => ((starts[i] = acc), acc + b.dur), 0);
  let active = 0;
  starts.forEach((s, i) => frame >= s && (active = i));

  // Copy groups: consecutive beats with the same title share one block, so it does not re-fade.
  const groups: { start: number; end: number; copy: Copy }[] = [];
  beats.forEach((b, i) => {
    const last = groups[groups.length - 1];
    if (last && last.copy.title === b.copy.title) last.end = starts[i]! + b.dur;
    else groups.push({ start: starts[i]!, end: starts[i]! + b.dur, copy: b.copy });
  });

  const enter = interpolate(frame, [0, 18], [0, 1], clamp);

  return (
    <AbsoluteFill style={{ fontFamily: FONT_STACK, background: C.bg }}>
      {background}

      {groups.map((g, i) => {
        const inOp = i === 0 ? enter : interpolate(frame, [g.start, g.start + CROSS + 4], [0, 1], clamp);
        const outOp = i === groups.length - 1 ? 1 : interpolate(frame, [g.end - 8, g.end + 2], [1, 0], clamp);
        const op = Math.min(inOp, outOp);
        if (op <= 0) return null;
        const rise = (1 - inOp) * 18;
        const box: React.CSSProperties = vertical
          ? { left: 70, top: 70, width: 940, height: 390, justifyContent: 'flex-end' }
          : { left: 1340, top: 150, width: 520, height: 780, justifyContent: 'center' };
        return (
          <div key={i} style={{ position: 'absolute', ...box, display: 'flex', flexDirection: 'column', gap: vertical ? 18 : 22, opacity: op, transform: `translateY(${rise}px)` }}>
            <Kicker alarm={g.copy.alarm} size={vertical ? 28 : 21}>
              {g.copy.kicker}
            </Kicker>
            <Title size={vertical ? 62 : 50}>{g.copy.title}</Title>
            {g.copy.lead && <Lead size={vertical ? 31 : 25}>{g.copy.lead}</Lead>}
            {g.copy.extra}
          </div>
        );
      })}

      <div style={{ position: 'absolute', ...frameBox, opacity: enter, transform: `translateY(${(1 - enter) * 24}px)` }}>
        <BrowserFrame url={APP_URL} theme={THEME} width={FW} height={BODY + 41} pad={0}>
          {beats.map((b, i) => {
            const start = starts[i]!;
            const local = frame - start;
            if (local < 0 || local > b.dur + CROSS) return null;
            if (i < active - 1) return null;
            const op = i === 0 ? 1 : interpolate(local, [0, CROSS], [0, 1], clamp);
            const from = b.from ?? (i > 0 ? beats[i - 1]!.to : FULL);
            return (
              <div key={i} style={{ position: 'absolute', inset: 0, opacity: op }}>
                <Screen beat={b} from={from} local={local} width={FW} view={view} />
              </div>
            );
          })}
        </BrowserFrame>
      </div>

      {beats.map((b, i) => {
        if (!b.doc) return null;
        const local = frame - starts[i]!;
        if (local < -2 || local > b.dur + 2) return null;
        return <div key={`doc-${i}`}>{b.doc(local)}</div>;
      })}
    </AbsoluteFill>
  );
};

export const beatsLength = (beats: Beat[]) => beats.reduce((a, b) => a + b.dur, 0);
