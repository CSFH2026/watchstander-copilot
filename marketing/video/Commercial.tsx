import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { CANVAS, seconds } from '@shared/brand';
import { C } from './brand';
import { CasrepSheet, PrintedSheet, RouteChips } from './components/Docs';
import { Fade } from '@shared/components/Fade';
import { Stat } from './components/Type';
import { type Beat, type Copy, Walkthrough, beatsLength } from './components/Walkthrough';
import { LoopScene } from './scenes/LoopScene';
import { Backdrop, ChatbotScene, HoodScene, HookScene, OfflineScene } from './scenes/Story';
import { CloseScene, TraceScene } from './scenes/TraceScene';

/*
 * The landscape cut: a projector backup for the live demo, in the showcase's order.
 * Every claim and number is the showcase's (ui/app/showcase/page.tsx); every app screen is captured.
 */

/** Seconds per beat: the copy and the board route time themselves from these. */
const D = {
  home: 2,
  typed: 1.4,
  result: 4,
  ranked: 3.2,
  blocked: 4.6,
  verify: 2.4,
  log: 3,
  broken: 3.8,
  print: 3.6,
  paper: 3,
  casrep: 5.6,
  draft: 2.4,
  sent: 3.6,
  known: 3.6,
  chips: 3,
};

const SPEED: Copy = {
  kicker: 'Speed',
  title: 'Symptom in. Cited steps out. About 10 ms.',
  lead: 'Cited to COMSCINST 3541.6A exercise D-15. 10 steps, 01 next.',
  // Lands as the answer does: the copy block is shared by the first three beats.
  extra: (
    <Fade inAt={seconds(D.home + D.typed) + 24} inDuration={12} rise={12}>
      <Stat value={7} suffix=" ms" label="server time per question, p50, 200 questions" at={seconds(D.home + D.typed) + 30} size={64} />
    </Fade>
  ),
};
const RANKED: Copy = {
  kicker: 'Ranked candidates',
  title: 'Other matches, ranked by strength.',
  lead: 'Ranked by keyword and meaning match. Strength compares each to the top match; it is not a probability.',
};
const POLICY: Copy = {
  kicker: 'Policy engine',
  title: 'Steps unlock in order. Rules decide, never a model.',
  lead: '01 and 02 are done, and 03 is next. The watch tries 05 early. The engine names the missing step, 04, and shows the danger note. The refusal is signed too.',
};
const LOG: Copy = {
  kicker: 'Signed audit log',
  title: 'Every action signed. The log proves itself.',
  lead: 'Ed25519 signatures and a SHA-256 hash chain. Allowed and blocked actions, and every query, become one entry each.',
};
const TAMPER: Copy = {
  kicker: 'Tamper check',
  title: 'Change one word and Verify names the entry.',
  lead: 'One "allowed": false, edited to true in the log file. Verify log: chain broken, payload hash does not match.',
  alarm: true,
};
const PAPER: Copy = {
  kicker: 'Paper checklist',
  title: 'Gloves on, laptop out of reach? Print it.',
  lead: 'Each ticked step is signed into the log, marked from paper. The policy engine still blocks one out of order.',
};
const CASREP: Copy = {
  kicker: 'CASREP, standardized',
  title: 'Every CASREP in the same shape, from what the watch actually did.',
  lead: 'Drafted from the signed run. Each field says who fills it, so a person supplies only the judgment calls.',
};
const KNOWN: Copy = {
  kicker: 'CASREP Board, both ways',
  title: 'Open CASREPs come back to the watch.',
  lead: 'The next watch that meets the same casualty sees that it is already reported. The steps stay live under the banner.',
};
const CHIPS: Copy = {
  kicker: 'Smart example chips',
  title: 'The chips follow this ship.',
  lead: "An open CASREP's procedure first, then what this laptop asked often, then the fixed examples.",
};


const BEATS: Beat[] = [
  { screen: 'home-chips', dur: seconds(D.home), from: { x: 0, y: 0, w: 1440 }, to: { x: 140, y: 90, w: 1160 }, copy: SPEED },
  { screen: 'ask-typed', dur: seconds(D.typed), to: { x: 140, y: 90, w: 1160 }, ring: [{ x: 172, y: 202, w: 1092, h: 54 }], copy: SPEED },
  {
    screen: 'result-top',
    dur: seconds(D.result),
    to: { x: 170, y: 230, w: 1100 },
    ring: [
      { x: 1012, y: 298, w: 248, h: 22 },
      { x: 186, y: 334, w: 540, h: 22 },
    ],
    copy: SPEED,
  },
  { screen: 'result-candidates', dur: seconds(D.ranked), to: { x: 150, y: 170, w: 1150 }, ring: [{ x: 172, y: 408, w: 1086, h: 385 }], copy: RANKED },
  { screen: 'blocked-05', dur: seconds(D.blocked), to: { x: 160, y: 220, w: 1110 }, ring: [{ x: 172, y: 668, w: 1098, h: 128 }], copy: POLICY },
  { screen: 'verify-ok', dur: seconds(D.verify), to: { x: 150, y: 60, w: 1000 }, ring: [{ x: 186, y: 134, w: 128, h: 28 }], copy: LOG },
  { screen: 'log-drawer', dur: seconds(D.log), to: { x: 700, y: 110, w: 740 }, ring: [{ x: 1002, y: 440, w: 426, h: 58 }], copy: LOG },
  { screen: 'verify-broken', dur: seconds(D.broken), from: { x: 150, y: 60, w: 1000 }, to: { x: 150, y: 60, w: 1000 }, ring: [{ x: 186, y: 128, w: 444, h: 34 }], copy: TAMPER },
  {
    screen: 'result-top',
    dur: seconds(D.print),
    from: { x: 150, y: 190, w: 1150 },
    to: { x: 150, y: 190, w: 1150 },
    ring: [{ x: 794, y: 730, w: 140, h: 40 }],
    doc: (local) => <PrintedSheet local={local} dur={seconds(D.print)} width={860} zoom={1.5} style={{ left: 330, top: 150 }} />,
    copy: PAPER,
  },
  { screen: 'paper-saved', dur: seconds(D.paper), to: { x: 250, y: 150, w: 950 }, ring: [{ x: 418, y: 362, w: 604, h: 132 }], copy: PAPER },
  {
    screen: 'steps-04-done',
    dur: seconds(D.casrep),
    to: { x: 0, y: 0, w: 1440 },
    doc: (local) => <CasrepSheet local={local} dur={seconds(D.casrep)} width={1020} scale={1.3} style={{ left: 170, top: 190 }} />,
    copy: CASREP,
  },
  { screen: 'casrep-draft', dur: seconds(D.draft), to: { x: 300, y: 20, w: 860 }, ring: [{ x: 356, y: 226, w: 728, h: 62 }], copy: { kicker: 'CASREP Board', title: 'Sends to the CASREP Board only after a yes.' } },
  {
    screen: 'casrep-sent',
    dur: seconds(D.sent),
    to: { x: 300, y: 200, w: 900 },
    ring: [{ x: 362, y: 388, w: 716, h: 44 }],
    copy: { kicker: 'CASREP Board', title: 'Sends to the CASREP Board only after a yes.' },
  },
  { screen: 'known-banner', dur: seconds(D.known), to: { x: 150, y: 150, w: 1150 }, ring: [{ x: 170, y: 290, w: 1100, h: 124 }], copy: KNOWN },
  { screen: 'home-chips-known', dur: seconds(D.chips), from: { x: 0, y: 0, w: 1440 }, to: { x: 140, y: 120, w: 1000 }, ring: [{ x: 168, y: 272, w: 334, h: 44 }], copy: CHIPS },
];

// The board beats share one copy block; its route chips light up once the send lands.
const draftStart = BEATS.slice(0, BEATS.findIndex((b) => b.screen === 'casrep-draft')).reduce((a, b) => a + b.dur, 0);
for (const b of BEATS) {
  if (b.copy.kicker === 'CASREP Board') {
    b.copy = {
      ...b.copy,
      lead: 'Verifies every hash and signature first, and refuses to draft from a broken log. On the board it routes up the chain:',
      extra: <RouteChips at={draftStart + seconds(D.draft) + 10} />,
    };
  }
}

const T = 15;
const SCENES: [number, React.ReactNode][] = [
  [seconds(5.5), <HookScene key="hook" />],
  [seconds(6), <ChatbotScene key="chat" />],
  [seconds(6), <OfflineScene key="off" />],
  [beatsLength(BEATS), <Walkthrough key="walk" beats={BEATS} background={<Backdrop />} />],
  [seconds(7), <LoopScene key="loop" />],
  [seconds(5), <HoodScene key="hood" />],
  [seconds(6.5), <TraceScene key="trace" />],
  [seconds(4.5), <CloseScene key="close" />],
];
const TOTAL = SCENES.reduce((a, [d]) => a + d, 0) - (SCENES.length - 1) * T;

const EndFade: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [TOTAL - 20, TOTAL], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ backgroundColor: '#000', opacity, pointerEvents: 'none' }} />;
};

type Cut = React.FC & { durationInFrames: number; fps: number };

/** The Walkthrough is one sequence on purpose: the browser stays in frame from Speed to the chips. */
export const Commercial: Cut = () => (
  <AbsoluteFill style={{ backgroundColor: C.bg }}>
    <TransitionSeries>
      {SCENES.flatMap(([d, node], i) => [
        ...(i > 0 ? [<TransitionSeries.Transition key={`t${i}`} timing={linearTiming({ durationInFrames: T })} presentation={fade()} />] : []),
        <TransitionSeries.Sequence key={`s${i}`} durationInFrames={d}>
          {node}
        </TransitionSeries.Sequence>,
      ])}
    </TransitionSeries>
    <EndFade />
  </AbsoluteFill>
);

Commercial.durationInFrames = TOTAL;
Commercial.fps = CANVAS.fps;
