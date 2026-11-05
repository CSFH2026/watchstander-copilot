import type { CSSProperties, ReactNode } from 'react';

// Two drawings of one flow: wide for a projector, tall for a phone. CSS shows one and drops the
// other from the accessibility tree. Every colour is currentColor or a theme token, so light,
// dark, and red light all read; the future loop is also dashed, so it reads without colour.

const ROUTE = ['Originator', 'DIVO', 'DH', 'CHENG', 'XO', 'CO', 'Released'];

const LABEL =
  'Flow of one casualty. 1, an alarm or symptom at the watch station. 2, the watchstander types the symptom text into the offline copilot: ' +
  'it finds the cited procedure in the doctrine index, the policy engine holds the steps in order, and each action is signed into the audit ' +
  'log, on screen or from the printed checklist. 3, make casrep turns the signed run into a CASREP INITIAL. 4, the CASREP Board routes it ' +
  'Originator, DIVO, DH, CHENG, XO, CO, Released. The board\'s open CASREPs come back to the copilot as a known casualty banner on the matching procedure. ' +
  'Future work, not built: released CASREPs feed lessons learned back into the doctrine index.';

/** Animation order: each step waits var(--i) beats once the diagram scrolls in. */
const at = (i: number) => ({ '--i': i }) as CSSProperties;

type Line = { x: number; y: number; t: string; anchor?: 'start' | 'middle' | 'end' };

function Labels({ lines, className }: { lines: Line[]; className: string }) {
  return lines.map((l) => (
    <text key={`${l.x}-${l.y}`} x={l.x} y={l.y} className={className} textAnchor={l.anchor ?? 'start'}>
      {l.t}
    </text>
  ));
}

function Node({ i, children, className = '' }: { i: number; children: ReactNode; className?: string }) {
  return (
    <g className={`sc-d-node ${className}`} style={at(i)}>
      {children}
    </g>
  );
}

/** A drawn arrow: the line draws in, then its head and label appear. `head` is the tip and its angle. */
function Arrow({ i, d, head, labels }: { i: number; d: string; head: [number, number, number]; labels: Line[] }) {
  return (
    <g className="sc-d-arrow" style={at(i)}>
      <path d={d} pathLength={1} className="sc-d-line sc-d-draw" />
      <polygon points="0,0 -10,-5.5 -10,5.5" className="sc-d-head" transform={`translate(${head[0]} ${head[1]}) rotate(${head[2]})`} />
      <Labels lines={labels} className="sc-d-lab" />
    </g>
  );
}

function Cylinder({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  const rx = w / 2;
  const ry = Math.max(6, w / 10);
  return (
    <>
      <path
        d={`M${x} ${y + ry} V${y + h - ry} A${rx} ${ry} 0 0 0 ${x + w} ${y + h - ry} V${y + ry}`}
        className="sc-d-box sc-d-db"
      />
      <ellipse cx={x + rx} cy={y + ry} rx={rx} ry={ry} className="sc-d-box sc-d-db" />
    </>
  );
}

function FutureTag({ x, y, rotate = 0 }: { x: number; y: number; rotate?: number }) {
  return (
    <g className="sc-d-tag" transform={`translate(${x} ${y}) rotate(${rotate})`}>
      <rect x={-76} y={-12} width={152} height={24} rx={12} />
      <text x={0} y={4} textAnchor="middle">
        FUTURE &middot; NOT BUILT
      </text>
    </g>
  );
}

function Wide() {
  const chipX = (k: number) => 449 + k * 92;
  return (
    <svg viewBox="0 0 1120 510" className="sc-d sc-d-wide" role="img" aria-label={LABEL}>
      <Node i={0}>
        <rect x={20} y={40} width={170} height={150} rx={10} className="sc-d-box sc-d-alarm" />
        <Labels lines={[{ x: 36, y: 66, t: '1 · CASUALTY' }]} className="sc-d-kick sc-d-kick-alarm" />
        <Labels lines={[{ x: 36, y: 96, t: 'Alarm or symptom' }]} className="sc-d-title" />
        <Labels lines={[{ x: 36, y: 118, t: 'at the watch station' }]} className="sc-d-sub" />
        <Labels lines={[{ x: 36, y: 166, t: 'LUBO PRESS LO' }]} className="sc-d-sub sc-d-mono" />
      </Node>

      <Arrow i={1} d="M190 115 H254" head={[262, 115, 0]} labels={[{ x: 226, y: 92, t: 'symptom', anchor: 'middle' }, { x: 226, y: 106, t: 'text', anchor: 'middle' }]} />

      <Node i={2}>
        <rect x={262} y={20} width={520} height={190} rx={12} className="sc-d-box sc-d-main" />
        <Labels lines={[{ x: 282, y: 46, t: '2 · COPILOT, OFFLINE ON THE LAPTOP' }]} className="sc-d-kick" />
        {[
          { x: 282, a: 'Find the', b: 'procedure', s: '~10 ms, cited' },
          { x: 454, a: 'Policy', b: 'engine', s: 'steps in order' },
          { x: 626, a: 'Signed', b: 'audit log', s: 'Ed25519, chained' },
        ].map((m) => (
          <g key={m.x}>
            <rect x={m.x} y={62} width={132} height={84} rx={8} className="sc-d-mini" />
            <Labels lines={[{ x: m.x + 14, y: 86, t: m.a }, { x: m.x + 14, y: 104, t: m.b }]} className="sc-d-title" />
            <Labels lines={[{ x: m.x + 14, y: 130, t: m.s }]} className="sc-d-sub" />
          </g>
        ))}
        <Labels lines={[{ x: 454, y: 184, t: 'on screen or on the printed checklist' }]} className="sc-d-sub" />
      </Node>

      <Arrow i={3} d="M414 104 H446" head={[454, 104, 0]} labels={[{ x: 434, y: 82, t: 'cited', anchor: 'middle' }, { x: 434, y: 94, t: 'steps', anchor: 'middle' }]} />
      <Arrow i={4} d="M586 104 H618" head={[626, 104, 0]} labels={[{ x: 606, y: 82, t: 'each', anchor: 'middle' }, { x: 606, y: 94, t: 'action', anchor: 'middle' }]} />

      <Node i={2.5}>
        <Cylinder x={283} y={300} w={130} h={130} />
        <Labels lines={[{ x: 348, y: 360, t: 'Doctrine index', anchor: 'middle' }]} className="sc-d-title" />
        <Labels lines={[{ x: 348, y: 382, t: '103 procedures', anchor: 'middle' }, { x: 348, y: 402, t: '779 steps', anchor: 'middle' }]} className="sc-d-sub" />
      </Node>
      <Arrow i={3} d="M348 300 V218" head={[348, 210, -90]} labels={[{ x: 338, y: 252, t: 'procedure', anchor: 'end' }, { x: 338, y: 266, t: 'text', anchor: 'end' }]} />

      <Arrow i={5} d="M782 115 H854" head={[862, 115, 0]} labels={[{ x: 822, y: 92, t: 'signed', anchor: 'middle' }, { x: 822, y: 106, t: 'run', anchor: 'middle' }]} />

      <Node i={6}>
        <rect x={862} y={40} width={238} height={150} rx={10} className="sc-d-box" />
        <Labels lines={[{ x: 878, y: 66, t: '3 · EXPORT' }]} className="sc-d-kick" />
        <Labels lines={[{ x: 878, y: 98, t: 'make casrep' }]} className="sc-d-title sc-d-mono" />
        <Labels lines={[{ x: 878, y: 128, t: 'verifies the log, then' }, { x: 878, y: 148, t: 'drafts a standard CASREP' }]} className="sc-d-sub" />
      </Node>

      <Arrow i={7} d="M981 190 V292" head={[981, 300, 90]} labels={[{ x: 992, y: 240, t: 'CASREP' }, { x: 992, y: 254, t: 'INITIAL' }]} />

      <Node i={8}>
        <rect x={430} y={300} width={670} height={130} rx={12} className="sc-d-box sc-d-main" />
        <Labels lines={[{ x: 450, y: 328, t: '4 · CASREP BOARD, ROUTED FOR RELEASE' }]} className="sc-d-kick" />
      </Node>
      {ROUTE.map((r, k) => (
        <Node key={r} i={8.6 + k * 0.45} className={k === ROUTE.length - 1 ? 'sc-d-chip sc-d-chip-end' : 'sc-d-chip'}>
          <rect x={chipX(k)} y={348} width={80} height={40} rx={8} />
          <text x={chipX(k) + 40} y={373} textAnchor="middle">
            {r}
          </text>
          {k > 0 && <path d={`M${chipX(k) - 9} 362 l5 6 l-5 6`} className="sc-d-chev" />}
        </Node>
      ))}

      <Arrow i={12} d="M640 300 V218" head={[640, 210, -90]} labels={[{ x: 652, y: 250, t: 'open CASREPs:' }, { x: 652, y: 264, t: 'known casualty' }]} />

      <Node i={12.5} className="sc-d-future">
        <path d="M1041 430 V470 H348 V440" className="sc-d-line" />
        <polygon points="0,0 -10,-5.5 -10,5.5" className="sc-d-head" transform="translate(348 432) rotate(-90)" />
        <Labels lines={[{ x: 700, y: 460, t: 'lessons learned: the next watch sees what fixed it last time', anchor: 'middle' }]} className="sc-d-lab sc-d-lab-future" />
        <FutureTag x={700} y={490} />
      </Node>
    </svg>
  );
}

function Tall() {
  const chipY = (k: number) => 676 + k * 32;
  return (
    <svg viewBox="0 0 370 920" className="sc-d sc-d-tall" role="img" aria-label={LABEL}>
      <Node i={0}>
        <rect x={16} y={10} width={236} height={104} rx={10} className="sc-d-box sc-d-alarm" />
        <Labels lines={[{ x: 30, y: 34, t: '1 · CASUALTY' }]} className="sc-d-kick sc-d-kick-alarm" />
        <Labels lines={[{ x: 30, y: 58, t: 'Alarm or symptom' }]} className="sc-d-title" />
        <Labels lines={[{ x: 30, y: 78, t: 'at the watch station' }]} className="sc-d-sub" />
        <Labels lines={[{ x: 30, y: 100, t: 'LUBO PRESS LO' }]} className="sc-d-sub sc-d-mono" />
      </Node>

      <Arrow i={1} d="M134 114 V144" head={[134, 152, 90]} labels={[{ x: 144, y: 137, t: 'symptom text' }]} />

      <Node i={2}>
        <rect x={16} y={152} width={236} height={310} rx={12} className="sc-d-box sc-d-main" />
        <Labels lines={[{ x: 30, y: 176, t: '2 · COPILOT, OFFLINE' }]} className="sc-d-kick" />
        {[
          { y: 188, a: 'Find the procedure', s: '~10 ms, cited' },
          { y: 268, a: 'Policy engine', s: 'steps in order' },
          { y: 348, a: 'Signed audit log', s: 'Ed25519, chained' },
        ].map((m) => (
          <g key={m.y}>
            <rect x={30} y={m.y} width={208} height={56} rx={8} className="sc-d-mini" />
            <Labels lines={[{ x: 44, y: m.y + 23, t: m.a }]} className="sc-d-title" />
            <Labels lines={[{ x: 44, y: m.y + 43, t: m.s }]} className="sc-d-sub" />
          </g>
        ))}
        <Labels lines={[{ x: 30, y: 428, t: 'on screen or on the' }, { x: 30, y: 446, t: 'printed checklist' }]} className="sc-d-sub" />
      </Node>

      <Arrow i={3} d="M134 244 V260" head={[134, 268, 90]} labels={[{ x: 144, y: 259, t: 'cited steps' }]} />
      <Arrow i={4} d="M134 324 V340" head={[134, 348, 90]} labels={[{ x: 144, y: 339, t: 'each action' }]} />

      <Node i={2.5}>
        <Cylinder x={282} y={180} w={74} h={84} />
        <Labels lines={[{ x: 319, y: 214, t: 'Doctrine', anchor: 'middle' }, { x: 319, y: 230, t: 'index', anchor: 'middle' }]} className="sc-d-title sc-d-small" />
        <Labels lines={[{ x: 319, y: 250, t: '102', anchor: 'middle' }]} className="sc-d-sub" />
      </Node>
      <Arrow i={3} d="M282 222 H246" head={[238, 222, 180]} labels={[{ x: 267, y: 212, t: 'text', anchor: 'middle' }]} />

      <Arrow i={5} d="M134 462 V504" head={[134, 512, 90]} labels={[{ x: 144, y: 491, t: 'signed run' }]} />

      <Node i={6}>
        <rect x={16} y={512} width={236} height={90} rx={10} className="sc-d-box" />
        <Labels lines={[{ x: 30, y: 536, t: '3 · EXPORT' }]} className="sc-d-kick" />
        <Labels lines={[{ x: 30, y: 562, t: 'make casrep' }]} className="sc-d-title sc-d-mono" />
        <Labels lines={[{ x: 30, y: 586, t: 'drafts a standard CASREP' }]} className="sc-d-sub" />
      </Node>

      <Arrow i={7} d="M134 602 V630" head={[134, 638, 90]} labels={[{ x: 144, y: 623, t: 'CASREP INITIAL' }]} />

      <Node i={8}>
        <rect x={16} y={638} width={236} height={272} rx={12} className="sc-d-box sc-d-main" />
        <Labels lines={[{ x: 30, y: 662, t: '4 · CASREP BOARD' }]} className="sc-d-kick" />
      </Node>
      {ROUTE.map((r, k) => (
        <Node key={r} i={8.6 + k * 0.45} className={k === ROUTE.length - 1 ? 'sc-d-chip sc-d-chip-end' : 'sc-d-chip'}>
          <rect x={30} y={chipY(k)} width={208} height={26} rx={6} />
          <text x={134} y={chipY(k) + 18} textAnchor="middle">
            {r}
          </text>
        </Node>
      ))}

      <Node i={12}>
        <path d="M252 760 H272 V440 H262" className="sc-d-line" />
        <polygon points="0,0 -10,-5.5 -10,5.5" className="sc-d-head" transform="translate(254 440) rotate(180)" />
        <text className="sc-d-lab" textAnchor="middle" transform="translate(290 600) rotate(-90)">
          known casualties
        </text>
      </Node>

      <Node i={12.5} className="sc-d-future">
        <path d="M238 881 H319 V272" className="sc-d-line" />
        <polygon points="0,0 -10,-5.5 -10,5.5" className="sc-d-head" transform="translate(319 266) rotate(-90)" />
        <text className="sc-d-lab sc-d-lab-future" textAnchor="middle" transform="translate(306 560) rotate(-90)">
          lessons learned
        </text>
        <FutureTag x={344} y={560} rotate={-90} />
      </Node>
    </svg>
  );
}

export function FlowDiagram() {
  return (
    <figure className="sc-diagram sc-reveal">
      <Wide />
      <Tall />
      <figcaption>
        Steps 1 to 4 are built and run today, and so is the solid arrow back: the board&apos;s open CASREPs show in the copilot as a known
        casualty banner on the matching procedure. The dashed loop is <strong>future work, not built</strong>: released CASREPs would feed back
        into the doctrine index as lessons learned, so the next watch facing the same casualty sees what fixed it last time.
      </figcaption>
    </figure>
  );
}
