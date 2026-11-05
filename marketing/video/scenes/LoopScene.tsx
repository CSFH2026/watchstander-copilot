import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { FONT_STACK } from '@shared/brand';
import { Fade } from '@shared/components/Fade';
import { C, MONO, ROUTE } from '../brand';
import { Kicker, Title } from '../components/Type';
import { Backdrop } from './Story';

/*
 * The whole loop: the Wide drawing from ui/app/showcase/flow-diagram.tsx, same geometry and words.
 * The page animates it with CSS on scroll; here each node and arrow waits its `i` in beats.
 */

const BEAT = 7;
const START = 24;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const CSS = `
.d-box { fill: ${C.surface}; stroke: ${C.borderStrong}; stroke-width: 1.5; }
.d-main { stroke: ${C.accent}; stroke-width: 2; }
.d-alarm { stroke: ${C.critical}; stroke-width: 2; }
.d-db { fill: ${C.surface2}; }
.d-mini { fill: ${C.surface2}; stroke: ${C.border}; stroke-width: 1; }
.d-kick { fill: ${C.accent}; font-size: 11.5px; font-weight: 800; letter-spacing: 0.08em; }
.d-kick-alarm { fill: ${C.critical}; }
.d-title { fill: ${C.text}; font-size: 15px; font-weight: 700; }
.d-sub { fill: ${C.muted}; font-size: 13px; }
.d-mono { font-family: ${MONO}; }
.d-line { fill: none; stroke: ${C.text}; stroke-width: 2; }
.d-head { fill: ${C.text}; }
.d-lab { fill: ${C.muted}; font-size: 11.5px; font-weight: 600; }
.d-chip rect { fill: ${C.surface2}; stroke: ${C.borderStrong}; stroke-width: 1; }
.d-chip text { fill: ${C.text}; font-size: 12.5px; font-weight: 700; }
.d-chev { fill: none; stroke: ${C.muted}; stroke-width: 1.75; }
.d-chip-end rect { fill: ${C.accent}; stroke: ${C.accent}; }
.d-chip-end text { fill: ${C.accentText}; }
.d-future .d-line { stroke: ${C.warn}; stroke-dasharray: 8 6; }
.d-future .d-head { fill: ${C.warn}; }
.d-lab-future { fill: ${C.warn}; font-size: 12.5px; font-weight: 700; }
.d-tag rect { fill: ${C.warnBg}; stroke: ${C.warn}; stroke-width: 1.5; stroke-dasharray: 4 3; }
.d-tag text { fill: ${C.warn}; font-size: 11.5px; font-weight: 800; letter-spacing: 0.08em; }
`;

type Line = { x: number; y: number; t: string; anchor?: 'start' | 'middle' | 'end' };

function useShow(i: number) {
  const frame = useCurrentFrame();
  return interpolate(frame, [START + i * BEAT, START + i * BEAT + 10], [0, 1], clamp);
}

function Labels({ lines, className }: { lines: Line[]; className: string }) {
  return lines.map((l) => (
    <text key={`${l.x}-${l.y}`} x={l.x} y={l.y} className={className} textAnchor={l.anchor ?? 'start'}>
      {l.t}
    </text>
  ));
}

function Node({ i, children, className = '' }: { i: number; children: React.ReactNode; className?: string }) {
  const p = useShow(i);
  return (
    <g className={className} style={{ opacity: p, transform: `translateY(${(1 - p) * 10}px)` }}>
      {children}
    </g>
  );
}

function Arrow({ i, d, head, labels }: { i: number; d: string; head: [number, number, number]; labels: Line[] }) {
  const p = useShow(i);
  const tip = interpolate(p, [0.7, 1], [0, 1], clamp);
  return (
    <g>
      <path d={d} pathLength={1} className="d-line" strokeDasharray="1 1" strokeDashoffset={1 - p} />
      <g style={{ opacity: tip }}>
        <polygon points="0,0 -10,-5.5 -10,5.5" className="d-head" transform={`translate(${head[0]} ${head[1]}) rotate(${head[2]})`} />
        <Labels lines={labels} className="d-lab" />
      </g>
    </g>
  );
}

function Cylinder({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const rx = w / 2;
  const ry = Math.max(6, w / 10);
  return (
    <>
      <path d={`M${x} ${y + ry} V${y + h - ry} A${rx} ${ry} 0 0 0 ${x + w} ${y + h - ry} V${y + ry}`} className="d-box d-db" />
      <ellipse cx={x + rx} cy={y + ry} rx={rx} ry={ry} className="d-box d-db" />
    </>
  );
}

function Wide() {
  const chipX = (k: number) => 449 + k * 92;
  return (
    <svg viewBox="0 0 1120 510" style={{ width: '100%', display: 'block', fontFamily: FONT_STACK }}>
      <style>{CSS}</style>
      <Node i={0}>
        <rect x={20} y={40} width={170} height={150} rx={10} className="d-box d-alarm" />
        <Labels lines={[{ x: 36, y: 66, t: '1 · CASUALTY' }]} className="d-kick d-kick-alarm" />
        <Labels lines={[{ x: 36, y: 96, t: 'Alarm or symptom' }]} className="d-title" />
        <Labels lines={[{ x: 36, y: 118, t: 'at the watch station' }]} className="d-sub" />
        <Labels lines={[{ x: 36, y: 166, t: 'LUBO PRESS LO' }]} className="d-sub d-mono" />
      </Node>

      <Arrow i={1} d="M190 115 H254" head={[262, 115, 0]} labels={[{ x: 226, y: 92, t: 'symptom', anchor: 'middle' }, { x: 226, y: 106, t: 'text', anchor: 'middle' }]} />

      <Node i={2}>
        <rect x={262} y={20} width={520} height={190} rx={12} className="d-box d-main" />
        <Labels lines={[{ x: 282, y: 46, t: '2 · COPILOT, OFFLINE ON THE LAPTOP' }]} className="d-kick" />
        {[
          { x: 282, a: 'Find the', b: 'procedure', s: '~10 ms, cited' },
          { x: 454, a: 'Policy', b: 'engine', s: 'steps in order' },
          { x: 626, a: 'Signed', b: 'audit log', s: 'Ed25519, chained' },
        ].map((m) => (
          <g key={m.x}>
            <rect x={m.x} y={62} width={132} height={84} rx={8} className="d-mini" />
            <Labels lines={[{ x: m.x + 14, y: 86, t: m.a }, { x: m.x + 14, y: 104, t: m.b }]} className="d-title" />
            <Labels lines={[{ x: m.x + 14, y: 130, t: m.s }]} className="d-sub" />
          </g>
        ))}
        <Labels lines={[{ x: 454, y: 184, t: 'on screen or on the printed checklist' }]} className="d-sub" />
      </Node>

      <Arrow i={3} d="M414 104 H446" head={[454, 104, 0]} labels={[{ x: 434, y: 82, t: 'cited', anchor: 'middle' }, { x: 434, y: 94, t: 'steps', anchor: 'middle' }]} />
      <Arrow i={4} d="M586 104 H618" head={[626, 104, 0]} labels={[{ x: 606, y: 82, t: 'each', anchor: 'middle' }, { x: 606, y: 94, t: 'action', anchor: 'middle' }]} />

      <Node i={2.5}>
        <Cylinder x={283} y={300} w={130} h={130} />
        <Labels lines={[{ x: 348, y: 360, t: 'Doctrine index', anchor: 'middle' }]} className="d-title" />
        <Labels lines={[{ x: 348, y: 382, t: '103 procedures', anchor: 'middle' }, { x: 348, y: 402, t: '779 steps', anchor: 'middle' }]} className="d-sub" />
      </Node>
      <Arrow i={3} d="M348 300 V218" head={[348, 210, -90]} labels={[{ x: 338, y: 252, t: 'procedure', anchor: 'end' }, { x: 338, y: 266, t: 'text', anchor: 'end' }]} />

      <Arrow i={5} d="M782 115 H854" head={[862, 115, 0]} labels={[{ x: 822, y: 92, t: 'signed', anchor: 'middle' }, { x: 822, y: 106, t: 'run', anchor: 'middle' }]} />

      <Node i={6}>
        <rect x={862} y={40} width={238} height={150} rx={10} className="d-box" />
        <Labels lines={[{ x: 878, y: 66, t: '3 · EXPORT' }]} className="d-kick" />
        <Labels lines={[{ x: 878, y: 98, t: 'make casrep' }]} className="d-title d-mono" />
        <Labels lines={[{ x: 878, y: 128, t: 'verifies the log, then' }, { x: 878, y: 148, t: 'drafts a standard CASREP' }]} className="d-sub" />
      </Node>

      <Arrow i={7} d="M981 190 V292" head={[981, 300, 90]} labels={[{ x: 992, y: 240, t: 'CASREP' }, { x: 992, y: 254, t: 'INITIAL' }]} />

      <Node i={8}>
        <rect x={430} y={300} width={670} height={130} rx={12} className="d-box d-main" />
        <Labels lines={[{ x: 450, y: 328, t: '4 · CASREP BOARD, ROUTED FOR RELEASE' }]} className="d-kick" />
      </Node>
      {ROUTE.map((r, k) => (
        <Node key={r} i={8.6 + k * 0.45} className={k === ROUTE.length - 1 ? 'd-chip d-chip-end' : 'd-chip'}>
          <rect x={chipX(k)} y={348} width={80} height={40} rx={8} />
          <text x={chipX(k) + 40} y={373} textAnchor="middle">
            {r}
          </text>
          {k > 0 && <path d={`M${chipX(k) - 9} 362 l5 6 l-5 6`} className="d-chev" />}
        </Node>
      ))}

      <Arrow i={12} d="M640 300 V218" head={[640, 210, -90]} labels={[{ x: 652, y: 250, t: 'open CASREPs:' }, { x: 652, y: 264, t: 'known casualty' }]} />

      <Node i={12.5} className="d-future">
        <path d="M1041 430 V470 H348 V440" className="d-line" />
        <polygon points="0,0 -10,-5.5 -10,5.5" className="d-head" transform="translate(348 432) rotate(-90)" />
        <Labels lines={[{ x: 700, y: 460, t: 'lessons learned: the next watch sees what fixed it last time', anchor: 'middle' }]} className="d-lab d-lab-future" />
        <g className="d-tag" transform="translate(700 490)">
          <rect x={-76} y={-12} width={152} height={24} rx={12} />
          <text x={0} y={4} textAnchor="middle">
            FUTURE · NOT BUILT
          </text>
        </g>
      </Node>
    </svg>
  );
}

/** 10. The whole loop, alarm to released CASREP and back. */
export const LoopScene: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT_STACK }}>
    <Backdrop />
    <AbsoluteFill style={{ padding: '70px 110px', display: 'flex', flexDirection: 'column', gap: 18, justifyContent: 'center' }}>
      <Fade inAt={0} inDuration={14} rise={16}>
        <Kicker>The whole loop</Kicker>
      </Fade>
      <Fade inAt={6} inDuration={16} rise={20}>
        <Title size={64}>From alarm to released CASREP, and back.</Title>
      </Fade>
      <div style={{ width: 1640, marginTop: 14, alignSelf: 'center' }}>
        <Wide />
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);
