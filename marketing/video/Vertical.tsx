import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { CANVAS_PORTRAIT, FONT_STACK, seconds } from '@shared/brand';
import { Fade } from '@shared/components/Fade';
import { C } from './brand';
import { CasrepSheet, RouteChips } from './components/Docs';
import { Kicker, Lead, Title } from './components/Type';
import { type Beat, Walkthrough, beatsLength } from './components/Walkthrough';
import { Backdrop, ChatbotScene, HookScene, OfflineScene } from './scenes/Story';
import { CloseScene, TraceScene } from './scenes/TraceScene';

/*
 * The vertical cut for social use later: the same story, short, one column, and the copilot's real
 * phone-width screens (captured at 430 px wide, 3x). Copy and numbers as in the landscape cut.
 */

const BEATS: Beat[] = [
  {
    screen: 'm-result',
    dur: seconds(4.5),
    to: { x: 0, y: 0, w: 430 },
    ring: [
      { x: 30, y: 56, w: 240, h: 24 },
      { x: 268, y: 22, w: 130, h: 22 },
    ],
    copy: { kicker: 'Speed', title: 'Symptom in. Cited steps out. About 10 ms.', lead: 'Cited to COMSCINST 3541.6A exercise D-15. 10 steps, 01 next.' },
  },
  {
    screen: 'm-blocked-05',
    dur: seconds(5),
    to: { x: 0, y: 0, w: 430 },
    ring: [{ x: 14, y: 420, w: 404, h: 326 }],
    copy: { kicker: 'Policy engine', title: 'Steps unlock in order. Rules decide, never a model.', lead: 'The watch tries 05 early. The engine names the missing step, 04, and shows the danger note.' },
  },
  {
    screen: 'm-verify-broken',
    dur: seconds(4.5),
    to: { x: 0, y: 0, w: 430 },
    ring: [{ x: 30, y: 246, w: 370, h: 62 }],
    copy: { kicker: 'Signed audit log', title: 'Change one word and Verify names the entry.', lead: 'Every action is signed and hash-chained. The log proves itself.', alarm: true },
  },
];

const CASREP_LEN = seconds(6.5);

const CasrepScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: FONT_STACK }}>
      <Backdrop />
      <AbsoluteFill style={{ padding: '150px 70px', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Fade inAt={0} inDuration={14} rise={16}>
          <Kicker size={28}>CASREP, standardized</Kicker>
        </Fade>
        <Fade inAt={6} inDuration={16} rise={20}>
          <Title size={64}>Every CASREP in the same shape, from what the watch actually did.</Title>
        </Fade>
        <Fade inAt={14} inDuration={16} rise={14}>
          <Lead size={31}>Drafted from the signed run. Sent to the CASREP Board only after a yes.</Lead>
        </Fade>
      </AbsoluteFill>
      <CasrepSheet local={frame - 18} dur={CASREP_LEN + 40} width={940} scale={1.32} style={{ left: 70, top: 640 }} />
      <div style={{ position: 'absolute', left: 70, top: 1730, width: 940 }}>
        <RouteChips at={110} size={1.25} />
      </div>
    </AbsoluteFill>
  );
};

const T = 15;
const SCENES: [number, React.ReactNode][] = [
  [seconds(5), <HookScene key="hook" vertical />],
  [seconds(5.5), <ChatbotScene key="chat" vertical />],
  [seconds(5), <OfflineScene key="off" vertical />],
  [beatsLength(BEATS), <Walkthrough key="walk" beats={BEATS} layout="vertical" background={<Backdrop />} />],
  [CASREP_LEN, <CasrepScene key="casrep" />],
  [seconds(6), <TraceScene key="trace" vertical />],
  [seconds(4.5), <CloseScene key="close" vertical />],
];
const TOTAL = SCENES.reduce((a, [d]) => a + d, 0) - (SCENES.length - 1) * T;

const EndFade: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [TOTAL - 20, TOTAL], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ backgroundColor: '#000', opacity, pointerEvents: 'none' }} />;
};

type Cut = React.FC & { durationInFrames: number; fps: number };

export const Vertical: Cut = () => (
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

Vertical.durationInFrames = TOTAL;
Vertical.fps = CANVAS_PORTRAIT.fps;
