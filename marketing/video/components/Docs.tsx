import { Easing, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { FONT_STACK } from '@shared/brand';
import { C, MONO, ROUTE } from '../brand';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** A document that slides up over the browser and leaves before the beat ends. */
const Sheet: React.FC<{ local: number; dur: number; style: React.CSSProperties; rotate?: number; children: React.ReactNode }> = ({ local, dur, style, rotate = -1, children }) => {
  const inP = interpolate(local, [0, 22], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  const out = interpolate(local, [dur - 12, dur], [1, 0], clamp);
  return (
    <div style={{ position: 'absolute', ...style, opacity: Math.min(inP, out), transform: `translateY(${(1 - inP) * 70}px) rotate(${rotate}deg)` }}>{children}</div>
  );
};

/**
 * The real printed checklist (Print checklist, captured with print media): the top left of the first
 * page, `zoom` times the box width so the step text reads, cropped at the reading column.
 */
export const PrintedSheet: React.FC<{ local: number; dur: number; style: React.CSSProperties; width: number; zoom?: number }> = ({ local, dur, style, width, zoom = 1 }) => (
  <Sheet local={local} dur={dur} style={style}>
    <div style={{ width, height: width * 0.88, overflow: 'hidden', background: '#fff', borderRadius: 4, boxShadow: '0 2px 4px rgba(0,0,0,0.3), 0 30px 80px rgba(0,0,0,0.55)' }}>
      <Img src={staticFile('screens/print-sheet.png')} style={{ width: width * zoom, display: 'block' }} />
    </div>
  </Sheet>
);

type Source = 'run' | 'ship' | 'sailor';
const TAG: Record<Source, string> = { run: 'From the signed run', ship: 'Ship setting', sailor: "Sailor's call" };
const TAG_STYLE: Record<Source, React.CSSProperties> = {
  run: { color: C.ok, background: C.okBg },
  ship: { color: C.muted },
  sailor: { color: C.warn, background: C.warnBg },
};

// Word for word from ui/app/showcase/casrep-sheet.tsx: a real draft of the LLOP demo run.
const HEAD: { k: string; v: string; src: Source; wide?: boolean }[] = [
  { k: 'Serial', v: 'N99999/0001', src: 'run' },
  { k: 'Unit', v: 'USS EXAMPLE (DDG 999)', src: 'ship' },
  { k: 'Report', v: 'INITIAL', src: 'run' },
  { k: 'DTG', v: '050200Z NOV 26', src: 'run' },
  { k: 'Equipment', v: 'Ship service gas turbine generators (501-K34 SSGTG): Low Lube Oil Pressure, Ship Service Gas Turbine Generator', src: 'run', wide: true },
  { k: 'Category', v: '2', src: 'sailor' },
  { k: 'Assistance', v: 'None', src: 'sailor' },
  { k: 'Parts, ETR', v: 'Added later in an UPDATE', src: 'sailor' },
  { k: 'POC', v: 'EOOW-02, Main Control', src: 'run' },
];

const DONE = [
  ['01', 'Verify low lube oil pressure on the SSGTG at the LOCOP and compare it with the EPCC indication.', 2],
  ['02', 'Report the casualty to the EOOW, the bridge, and the Chief Engineer.', 3],
  ['03', 'Start the standby SSGTG and parallel it to the bus.', 5],
  ['04', 'Shift the electrical load to the standby SSGTG; shed non-vital loads if the remaining generators cannot carry the full load.', 6],
] as const;

const Tag: React.FC<{ src: Source; on: number; fs: number }> = ({ src, on, fs }) => (
  <span
    style={{
      display: 'inline-block',
      padding: `${fs * 0.08}px ${fs * 0.55}px`,
      border: '1px solid currentColor',
      borderRadius: 999,
      fontSize: fs,
      fontWeight: 700,
      whiteSpace: 'nowrap',
      opacity: on,
      transform: `scale(${0.85 + 0.15 * on})`,
      ...TAG_STYLE[src],
    }}
  >
    {TAG[src]}
  </span>
);

/**
 * The showcase's CASREP sheet, drawn at video size. The fields land first, then each tag says who
 * fills it, one after another: that split is the point of the beat.
 */
export const CasrepSheet: React.FC<{ local: number; dur: number; style: React.CSSProperties; width: number; scale?: number }> = ({ local, dur, style, width, scale = 1 }) => {
  const fs = 15 * scale;
  const tagAt = (i: number) => interpolate(local, [26 + i * 5, 34 + i * 5], [0, 1], clamp);
  return (
    <Sheet local={local} dur={dur} style={style} rotate={0}>
      <div
        style={{
          width,
          padding: `${20 * scale}px ${22 * scale}px`,
          border: `1px solid ${C.borderStrong}`,
          borderRadius: 10,
          background: C.surface,
          color: C.text,
          fontFamily: FONT_STACK,
          fontSize: fs,
          lineHeight: 1.45,
          boxShadow: '0 30px 90px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontSize: fs * 0.8, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.muted, marginBottom: 10 * scale }}>
          CASREP · simplified training form
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 18 * scale, borderTop: `1px solid ${C.border}` }}>
          {HEAD.map((f, i) => (
            <div key={f.k} style={{ gridColumn: f.wide ? '1 / -1' : undefined, padding: `${6 * scale}px 0`, borderBottom: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: `${2 * scale}px ${8 * scale}px` }}>
              <div style={{ flex: '0 0 100%', fontSize: fs * 0.72, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>{f.k}</div>
              <span style={{ fontFamily: MONO, fontWeight: 600 }}>{f.v}</span>
              <Tag src={f.src} on={tagAt(i)} fs={fs * 0.72} />
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 * scale }}>
          <div style={{ fontWeight: 800, marginBottom: 4 * scale, display: 'flex', gap: 8 * scale, alignItems: 'center' }}>
            Actions taken (4 of 10 steps) <Tag src="run" on={tagAt(HEAD.length)} fs={fs * 0.72} />
          </div>
          {DONE.map(([n, text, seq]) => (
            <div key={n} style={{ color: C.muted, fontSize: fs * 0.92 }}>
              <b style={{ color: C.text, fontFamily: MONO }}>{n}</b> {text} <span style={{ fontFamily: MONO, color: C.accent }}>audit #{seq}</span>
            </div>
          ))}
          <div style={{ marginTop: 8 * scale, color: C.muted, fontSize: fs * 0.92 }}>
            Blocked by the policy engine: #4, step 05: step 05 requires step 04 first. Audit chain verified: 6 entries.
          </div>
        </div>
      </div>
    </Sheet>
  );
};

/** The board's approval route, lit one stop at a time (showcase flow-diagram.tsx). */
export const RouteChips: React.FC<{ at: number; size?: number }> = ({ at, size = 1 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 * size, alignItems: 'center' }}>
      {ROUTE.map((r, k) => {
        const on = interpolate(frame, [at + k * 6, at + k * 6 + 8], [0, 1], clamp);
        const end = k === ROUTE.length - 1;
        return (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 8 * size, opacity: 0.25 + 0.75 * on }}>
            {k > 0 && <span style={{ color: C.borderStrong, fontSize: 18 * size }}>›</span>}
            <span
              style={{
                padding: `${6 * size}px ${12 * size}px`,
                borderRadius: 8,
                fontSize: 17 * size,
                fontWeight: 700,
                background: end ? C.accent : C.surface2,
                color: end ? C.accentText : C.text,
                border: `1px solid ${end ? C.accent : C.borderStrong}`,
              }}
            >
              {r}
            </span>
          </div>
        );
      })}
    </div>
  );
};
