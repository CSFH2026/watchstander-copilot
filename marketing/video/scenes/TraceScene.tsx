import { AbsoluteFill } from 'remotion';
import { FONT_STACK } from '@shared/brand';
import { Fade } from '@shared/components/Fade';
import { C, MONO, SHOWCASE_URL, TRAINING } from '../brand';
import { TraceMark } from '../components/TraceMark';
import { Kicker, Lead, Title } from '../components/Type';
import { Backdrop } from './Story';

// The TRACE section of the showcase, first sentence of each word.
const WORDS: [string, string, string][] = [
  ['T', 'Trusted', 'Doctrine only. No language model is on the answer path.'],
  ['R', 'Record', 'Every query and acknowledgement is signed and hash-chained.'],
  ['A', 'Actions', 'Steps unlock in order, on screen or on paper.'],
  ['C', 'Casualty', 'The right cited procedure, then a CASREP drafted from the signed run.'],
  ['E', 'Engineering', 'Built for the DDG-51 engineering watch. The EOOW stays in charge of every step.'],
];

/** 11. One name for all of it: TRACE, one word at a time. */
export const TraceScene: React.FC<{ vertical?: boolean }> = ({ vertical }) => (
  <AbsoluteFill style={{ fontFamily: FONT_STACK }}>
    <Backdrop />
    <AbsoluteFill style={{ padding: vertical ? '200px 80px' : '90px 140px', display: 'flex', flexDirection: 'column', gap: 20, justifyContent: vertical ? 'flex-start' : 'center' }}>
      <Fade inAt={0} inDuration={14} rise={16}>
        <Kicker size={vertical ? 32 : 22}>The answer</Kicker>
      </Fade>
      <Fade inAt={6} inDuration={16} rise={20}>
        <Title size={vertical ? 92 : 72}>One name for all of it: TRACE.</Title>
      </Fade>
      <div style={{ display: 'flex', flexDirection: 'column', gap: vertical ? 30 : 16, marginTop: vertical ? 40 : 22 }}>
        {WORDS.map(([l, w, p], i) => (
          <Fade key={l} inAt={26 + i * 14} inDuration={14} rise={18}>
            <div style={{ display: 'flex', alignItems: vertical ? 'flex-start' : 'baseline', gap: 30 }}>
              <span style={{ fontFamily: MONO, fontSize: vertical ? 96 : 70, lineHeight: 1, fontWeight: 850, color: C.accent, width: vertical ? 80 : 60 }}>{l}</span>
              <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', alignItems: vertical ? 'flex-start' : 'baseline', gap: vertical ? 6 : 24 }}>
                <span style={{ fontSize: vertical ? 50 : 40, fontWeight: 800, color: C.text, width: vertical ? undefined : 290 }}>{w}</span>
                <span style={{ fontSize: vertical ? 32 : 26, color: C.muted, lineHeight: 1.4 }}>{p}</span>
              </div>
            </div>
          </Fade>
        ))}
      </div>
    </AbsoluteFill>
  </AbsoluteFill>
);

/** The close: the mark, the name, what it stands for, and where to see it. */
export const CloseScene: React.FC<{ vertical?: boolean }> = ({ vertical }) => (
  <AbsoluteFill style={{ fontFamily: FONT_STACK }}>
    <Backdrop />
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: vertical ? 34 : 26, textAlign: 'center', padding: '0 80px' }}>
      <Fade inAt={0} inDuration={12}>
        <TraceMark size={vertical ? 220 : 170} drawAt={4} />
      </Fade>
      <Fade inAt={20} inDuration={16} rise={18}>
        <Title size={vertical ? 150 : 130} style={{ letterSpacing: '0.04em' }}>
          TRACE
        </Title>
      </Fade>
      <Fade inAt={30} inDuration={16} rise={14}>
        <Lead size={vertical ? 40 : 34} style={{ color: C.text, fontWeight: 600 }}>
          Trusted Record of Actions in Casualty Engineering
        </Lead>
      </Fade>
      <Fade inAt={42} inDuration={16} rise={12}>
        <Lead size={vertical ? 32 : 26}>See it run. Type a symptom. Try step 05 early. Then verify the log.</Lead>
      </Fade>
      <Fade inAt={54} inDuration={16}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', marginTop: vertical ? 30 : 16 }}>
          <span style={{ fontFamily: MONO, fontSize: vertical ? 28 : 24, color: C.accent }}>{SHOWCASE_URL}</span>
          <span style={{ fontSize: vertical ? 26 : 21, color: C.muted }}>Watchstander Copilot · Fleethacker Norfolk, use case 21</span>
          <span style={{ fontSize: vertical ? 22 : 18, color: C.bannerText, background: C.bannerBg, padding: '6px 16px', borderRadius: 6 }}>
            <b>{TRAINING.tag}</b> · {TRAINING.text}
          </span>
        </div>
      </Fade>
    </AbsoluteFill>
  </AbsoluteFill>
);
