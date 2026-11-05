import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { FONT_STACK } from '@shared/brand';
import { Fade } from '@shared/components/Fade';
import { C, MONO } from '../brand';
import { Kicker, Lead, Stat, Title } from '../components/Type';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** The page ground: the app's dark background with one soft glow, red for the alarm. */
export const Backdrop: React.FC<{ tone?: 'calm' | 'alarm' }> = ({ tone = 'calm' }) => {
  const frame = useCurrentFrame();
  // A slow pulse, about one a second: an alarm light, never a strobe.
  const pulse = tone === 'alarm' ? 0.55 + 0.45 * Math.sin((frame / 30) * Math.PI * 1.1) ** 2 : 1;
  const glow = tone === 'alarm' ? `rgba(255,107,94,${0.2 * pulse})` : 'rgba(108,176,255,0.10)';
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <AbsoluteFill style={{ background: `radial-gradient(1200px 700px at 15% 0%, ${glow}, transparent 70%)` }} />
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${C.border}44 1px, transparent 1px), linear-gradient(90deg, ${C.border}44 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at 50% 40%, black 30%, transparent 80%)',
        }}
      />
    </AbsoluteFill>
  );
};

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ padding: 28, border: `1px solid ${C.border}`, borderRadius: 10, background: C.surface, display: 'flex', flexDirection: 'column', gap: 12, ...style }}>{children}</div>
);

/** 1. The scene: 0200 in main control, an alarm, and a binder of cards. */
export const HookScene: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const frame = useCurrentFrame();
  const blink = 0.6 + 0.4 * Math.sin((frame / 30) * Math.PI * 1.1) ** 2;
  const points = [
    ['Find it under stress', 'The right card, from what the watch sees and hears, at night, with alarms sounding.'],
    ['Do it in order', 'Secure the generator before the load shifts and the bus can drop. Never step 05 before 04.'],
    ['Prove it afterwards', 'Who did which step, when, and in what order? A typed log can be edited and nobody would know.'],
  ];
  return (
    <AbsoluteFill style={{ fontFamily: FONT_STACK }}>
      <Backdrop tone="alarm" />
      <AbsoluteFill style={{ padding: vertical ? '220px 80px' : '120px 140px', display: 'flex', flexDirection: 'column', gap: vertical ? 36 : 28, justifyContent: vertical ? 'flex-start' : 'center' }}>
        <Fade inAt={0} inDuration={14}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 16, padding: '12px 22px', borderRadius: 10, border: `2px solid ${C.critical}`, background: C.criticalBg, opacity: blink }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', background: C.critical, boxShadow: `0 0 18px ${C.critical}` }} />
            <span style={{ fontFamily: MONO, fontWeight: 800, fontSize: vertical ? 34 : 28, color: C.critical, letterSpacing: '0.08em' }}>LUBO PRESS LO</span>
          </div>
        </Fade>
        <Fade inAt={8} inDuration={16} rise={18}>
          <Kicker alarm size={vertical ? 32 : 24}>
            0200, main control
          </Kicker>
        </Fade>
        <Fade inAt={14} inDuration={18} rise={22}>
          <Title size={vertical ? 104 : 96} style={{ maxWidth: vertical ? 920 : 1400 }}>
            Low lube oil pressure on No.&nbsp;2 SSGTG.
          </Title>
        </Fade>
        <Fade inAt={30} inDuration={18} rise={18}>
          <Lead size={vertical ? 42 : 34} style={{ maxWidth: 1150 }}>
            The EOOW has seconds to act and a binder of casualty cards to search.
          </Lead>
        </Fade>
        <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: 22, marginTop: vertical ? 30 : 18 }}>
          {points.map(([h, p], i) => (
            <Fade key={h} inAt={58 + i * 12} inDuration={16} rise={20} style={{ flex: 1 }}>
              <Card style={{ height: '100%' }}>
                <div style={{ fontSize: vertical ? 36 : 28, fontWeight: 800, color: C.text }}>{h}</div>
                <div style={{ fontSize: vertical ? 28 : 21, lineHeight: 1.5, color: C.muted }}>{p}</div>
              </Card>
            </Fade>
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 2. Why not a chatbot: the two measured wrong answers from a small local model. */
export const ChatbotScene: React.FC<{ vertical?: boolean }> = ({ vertical }) => {
  const runs = [
    { t: 11.7, quote: 'Use fire suppression and drain the fuel.', cap: 'Run 1. It never started the standby generator.' },
    { t: 3.4, quote: 'This is a medical emergency.', cap: 'Run 2. It refused to give the steps.' },
  ];
  return (
    <AbsoluteFill style={{ fontFamily: FONT_STACK }}>
      <Backdrop />
      <AbsoluteFill style={{ padding: vertical ? '220px 80px' : '120px 140px', display: 'flex', flexDirection: 'column', gap: 26, justifyContent: vertical ? 'flex-start' : 'center' }}>
        <Fade inAt={0} inDuration={14} rise={16}>
          <Kicker size={vertical ? 32 : 22}>Why not a chatbot</Kicker>
        </Fade>
        <Fade inAt={6} inDuration={16} rise={20}>
          <Title size={vertical ? 96 : 84}>Same question. Two wrong answers.</Title>
        </Fade>
        <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: 28, marginTop: 18 }}>
          {runs.map((r, i) => (
            <Fade key={r.t} inAt={24 + i * 22} inDuration={16} rise={22} style={{ flex: 1 }}>
              <Card style={{ borderLeft: `6px solid ${C.critical}`, padding: vertical ? 40 : 34, gap: 18 }}>
                <div style={{ fontSize: vertical ? 96 : 80, lineHeight: 1, fontWeight: 850, color: C.critical, letterSpacing: '-0.02em' }}>{r.t} s</div>
                <div style={{ fontSize: vertical ? 44 : 38, fontWeight: 700, lineHeight: 1.3, color: C.text }}>&ldquo;{r.quote}&rdquo;</div>
                <div style={{ fontSize: vertical ? 30 : 24, color: C.muted }}>{r.cap}</div>
              </Card>
            </Fade>
          ))}
        </div>
        <Fade inAt={80} inDuration={18} rise={14}>
          <Lead size={vertical ? 32 : 25} style={{ maxWidth: 1400 }}>
            A small local model on the same laptop, asked for the casualty control steps for low lube oil pressure. Answers paraphrased.{' '}
            <span style={{ color: C.text, fontWeight: 700 }}>The copilot never writes a step: it finds approved text and holds its order.</span>
          </Lead>
        </Fade>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SOURCES = ['COMSCINST 3541.6A', 'NAVEDTRA 14114', 'NAVEDTRA 14113', 'NAVEDTRA 14111', 'Engineman 1 & C', 'Damage Controlman 3 & 2', 'NAVEDTRA 14163'];

/** A Wi-Fi glyph with a slash drawn through it. */
const WifiOff: React.FC<{ at: number; size: number }> = ({ at, size }) => {
  const frame = useCurrentFrame();
  const slash = interpolate(frame, [at, at + 14], [0, 1], clamp);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.muted} strokeWidth={1.8} strokeLinecap="round">
      <path d="M2 8.8a15 15 0 0 1 20 0M5 12.3a10.5 10.5 0 0 1 14 0M8.5 15.8a5.5 5.5 0 0 1 7 0" />
      <circle cx="12" cy="19.2" r="1.1" fill={C.muted} />
      <path d="M3 3l18 18" stroke={C.critical} strokeWidth={2.4} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - slash} />
    </svg>
  );
};

/** 3. Offline doctrine: 103 procedures and 779 steps from public sources, Wi-Fi off. */
export const OfflineScene: React.FC<{ vertical?: boolean }> = ({ vertical }) => (
  <AbsoluteFill style={{ fontFamily: FONT_STACK }}>
    <Backdrop />
    <AbsoluteFill style={{ padding: vertical ? '220px 80px' : '110px 140px', display: 'flex', flexDirection: 'column', gap: 26, justifyContent: vertical ? 'flex-start' : 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 34 }}>
        <Fade inAt={0} inDuration={14}>
          <WifiOff at={16} size={vertical ? 120 : 108} />
        </Fade>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Fade inAt={0} inDuration={14} rise={16}>
            <Kicker size={vertical ? 32 : 22}>Offline doctrine</Kicker>
          </Fade>
          <Fade inAt={6} inDuration={16} rise={20}>
            <Title size={vertical ? 84 : 76}>Everything runs on the laptop. Wi-Fi off.</Title>
          </Fade>
        </div>
      </div>
      <Fade inAt={20} inDuration={16} rise={14}>
        <Lead size={vertical ? 34 : 27} style={{ maxWidth: 1300 }}>
          Procedures, search model, and signing keys install from a USB stick. No GPU, no cloud account, no network at sea.
        </Lead>
      </Fade>
      <Fade inAt={34} inDuration={14} rise={16}>
        <div style={{ display: 'flex', flexDirection: vertical ? 'column' : 'row', gap: vertical ? 44 : 90, marginTop: 20 }}>
          <Stat value={103} label="casualty procedures" at={36} size={vertical ? 120 : 104} />
          <Stat value={779} label="steps, word for word" at={40} size={vertical ? 120 : 104} />
          <Stat value={15} label="systems, GTM to the galley coffee urn" at={44} size={vertical ? 120 : 104} />
        </div>
      </Fade>
      <Fade inAt={70} inDuration={16} rise={12}>
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: vertical ? 30 : 23, fontWeight: 800, color: C.text, marginBottom: 14 }}>Built from public, unclassified doctrine</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {SOURCES.map((s) => (
              <span key={s} style={{ fontSize: vertical ? 26 : 20, fontWeight: 600, color: C.muted, border: `1px solid ${C.borderStrong}`, borderRadius: 999, padding: '7px 16px' }}>
                {s}
              </span>
            ))}
          </div>
        </div>
      </Fade>
    </AbsoluteFill>
  </AbsoluteFill>
);

/** "Under the hood": the measured figures from the showcase stack section. */
export const HoodScene: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: FONT_STACK }}>
    <Backdrop />
    <AbsoluteFill style={{ padding: '110px 140px', display: 'flex', flexDirection: 'column', gap: 26, justifyContent: 'center' }}>
      <Fade inAt={0} inDuration={14} rise={16}>
        <Kicker>Under the hood</Kicker>
      </Fade>
      <Fade inAt={6} inDuration={16} rise={20}>
        <Title size={74} style={{ maxWidth: 1500 }}>
          Small, fast, and plain. No GPU, and no language model in the answer.
        </Title>
      </Fade>
      <Fade inAt={24} inDuration={14} rise={16}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 50, marginTop: 34 }}>
          <Stat value={7} suffix=" ms" label="server time per question, p50 (p95 9 ms, 200 questions)" at={26} size={96} />
          <Stat value={64} suffix=" MB" label="search model on disk" at={30} size={96} />
          <Stat value={213} suffix=" MB" label="memory while serving" at={34} size={96} />
          <Stat value={98} suffix="%" label="right card in the top two, 206 watchstander questions" at={38} size={96} />
        </div>
      </Fade>
      <Fade inAt={56} inDuration={16} rise={12}>
        <Lead size={24} style={{ marginTop: 24 }}>
          Measured on Nov 5 on a laptop CPU, serving the 103-procedure DDG set. 353 backend tests and 14 browser tests on every change.
        </Lead>
      </Fade>
    </AbsoluteFill>
  </AbsoluteFill>
);
