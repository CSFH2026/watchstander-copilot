import type { Metadata } from 'next';
import Link from 'next/link';
import { BlockIcon, CheckIcon, LockIcon, NextIcon } from '../../components/icons';
import { RedLightToggle, ThemeToggle } from '../../components/theme-toggle';
import { FlowDiagram } from './flow-diagram';
import { CasrepSheet } from './casrep-sheet';
import { PaperSheet } from './paper-sheet';
import { ShowcaseMotion } from './motion';

export const metadata: Metadata = {
  title: 'Watchstander Copilot: showcase',
  description: 'Offline casualty control for the DDG-51 engineering watch: cited steps in about 10 ms, held in order, every action signed.',
};

// Every figure below was checked on Nov 5 against corpus/ddg (102 procedures, 771 steps, 14 systems),
// docs/DEMO.md (server ms, the llama3.2:1b runs, the exact refusal text), and api/ (Ed25519, SHA-256,
// paper actions through the same policy check). Measure again before changing one.

// Steps 01 to 05 of EOCC-SSGTG-LLOP, word for word. Each requires the one before it, so trying 05
// while 03 is next is refused for the step it is missing: 04.
const POLICY_STEPS: { seq: string; state: 'done' | 'next' | 'locked'; text: string; tried?: boolean }[] = [
  { seq: '01', state: 'done', text: 'Verify low lube oil pressure on the SSGTG at the LOCOP and compare it with the EPCC indication.' },
  { seq: '02', state: 'done', text: 'Report the casualty to the EOOW, the bridge, and the Chief Engineer.' },
  { seq: '03', state: 'next', text: 'Start the standby SSGTG and parallel it to the bus.' },
  {
    seq: '04',
    state: 'locked',
    text: 'Shift the electrical load to the standby SSGTG; shed non-vital loads if the remaining generators cannot carry the full load.',
  },
  { seq: '05', state: 'locked', text: 'Secure the affected SSGTG; open its generator breaker, then stop the engine.', tried: true },
];

// The public sources behind corpus/ddg, from corpus/ddg/src/sources.yaml. `cited` is how many of the
// 102 procedure files name the source in their source line (grep -l, Nov 5); one file can cite several.
const SOURCES: { name: string; what: string; cited: number; url: string; host: string }[] = [
  {
    name: 'COMSCINST 3541.6A',
    what: 'Engineering Casualty Control Exercises, Military Sealift Command, 1986',
    cited: 63,
    url: 'https://web.archive.org/web/20050208220520id_/http://www.msc.navy.mil/instructions/pdf/m35416a.pdf',
    host: 'web.archive.org',
  },
  {
    name: 'NAVEDTRA 14114',
    what: 'Gas Turbine Systems Technician (Electrical) 3/(Mechanical) 3, Volume 2',
    cited: 64,
    url: 'https://www.militarynewbie.com/wp-content/uploads/2013/11/NAVEDTRA-14114-Gas-Turbine-Systems-Technician-Volume-2.pdf',
    host: 'militarynewbie.com',
  },
  {
    name: 'NAVEDTRA 14113',
    what: 'Gas Turbine Systems Technician (Electrical) 3/(Mechanical) 3, Volume 1',
    cited: 3,
    url: 'https://www.militarynewbie.com/wp-content/uploads/2013/11/NAVEDTRA-14113-Gas-Turbine-Systems-Technician-Volume-1.pdf',
    host: 'militarynewbie.com',
  },
  { name: 'NAVEDTRA 14111', what: 'Gas Turbine Systems Supervisor', cited: 11, url: 'https://www.tpub.com/gtss/1.htm', host: 'tpub.com' },
  {
    name: 'Engineman 1 & C',
    what: 'NAVEDTRA rate training manual, chapter 9, Engineering Casualty Control',
    cited: 12,
    url: 'https://www.tpub.com/engine1/en1-183.htm',
    host: 'tpub.com',
  },
  { name: 'Damage Controlman 3 & 2', what: 'Rate training manual', cited: 16, url: 'https://www.tpub.com/dc32/1.htm', host: 'tpub.com' },
];

/** The number is in the HTML; motion.tsx only counts up to it, so it is right with JavaScript off. */
function Stat({ value, prefix, suffix, label }: { value: number; prefix?: string; suffix?: string; label: string }) {
  return (
    <div className="sc-stat">
      <p className="sc-stat-num">
        <span className="sr-only">
          {prefix}
          {value}
          {suffix}
        </span>
        <span aria-hidden="true">
          {prefix && <span className="sc-stat-unit">{prefix}</span>}
          <span className="sc-count" data-to={value}>
            {value}
          </span>
          {suffix && <span className="sc-stat-unit">{suffix}</span>}
        </span>
      </p>
      <p className="sc-stat-label">{label}</p>
    </div>
  );
}

function Head({ kicker, title, lead, id }: { kicker: string; title: string; lead?: string; id: string }) {
  return (
    <header className="sc-head sc-reveal">
      <p className="sc-kicker">{kicker}</p>
      <h2 id={id}>{title}</h2>
      {lead && <p className="sc-lead">{lead}</p>}
    </header>
  );
}

export default function Showcase() {
  return (
    <>
      <header className="header">
        <div className="brand-wrap">
          <Link href="/" className="brand sc-brand">
            Watchstander Copilot
          </Link>
          <span className="badge badge-neutral">Showcase</span>
        </div>
        <div className="header-actions">
          <ThemeToggle />
          <RedLightToggle />
        </div>
      </header>

      <main className="sc">
        <section className="sc-hero" aria-labelledby="hero-title">
          <div className="sc-wrap">
            <p className="sc-kicker sc-in">Trusted Watchstander Copilot &middot; DDG-51 engineering</p>
            <h1 id="hero-title" className="sc-in">
              The right casualty procedure in 10&nbsp;ms. Offline. Every step signed.
            </h1>
            <p className="sc-lead sc-in">
              The engineering watch types the symptom. The copilot returns the cited procedure, holds the steps in order, and keeps a log that
              proves itself.
            </p>
            <div className="sc-stats sc-in" role="list" aria-label="Key figures">
              <div role="listitem">
                <Stat value={100} suffix="%" label="offline: no network on the laptop" />
              </div>
              <div role="listitem">
                <Stat value={102} label="DDG-51 casualty procedures, each cited" />
              </div>
              <div role="listitem">
                <Stat value={10} prefix="~" suffix=" ms" label="from symptom to steps" />
              </div>
              <div role="listitem">
                <Stat value={0} label="language models on the answer path" />
              </div>
            </div>
            <div className="sc-actions sc-in">
              <Link href="/" className="sc-go">
                Open the live copilot
              </Link>
              <a href="#flow" className="sc-link">
                See the whole flow
              </a>
            </div>
          </div>
        </section>

        <section className="sc-section sc-alarm" aria-labelledby="problem-title">
          <div className="sc-wrap">
            <Head
              id="problem-title"
              kicker="0200, main control"
              title="Low lube oil pressure on No. 2 SSGTG."
              lead="The EOOW has seconds to act and a binder of casualty cards to search."
            />
            <div className="sc-grid3">
              <article className="sc-point sc-reveal">
                <h3>Find it under stress</h3>
                <p>The right card, from what the watch sees and hears, at night, with alarms sounding.</p>
              </article>
              <article className="sc-point sc-reveal">
                <h3>Do it in order</h3>
                <p>Secure the generator before the load shifts and the bus can drop. The card says: never step 05 before 04.</p>
              </article>
              <article className="sc-point sc-reveal">
                <h3>Prove it afterwards</h3>
                <p>Who did which step, when, and in what order? A typed log can be edited and nobody would know.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="sc-section" aria-labelledby="llm-title">
          <div className="sc-wrap">
            <Head id="llm-title" kicker="Why not a chatbot" title="Same question. Two wrong answers." />
            <div className="sc-grid2">
              <figure className="sc-quote sc-reveal">
                <p className="sc-big sc-bad">11.7 s</p>
                <blockquote>Use fire suppression and drain the fuel.</blockquote>
                <figcaption>Run 1. It never started the standby generator.</figcaption>
              </figure>
              <figure className="sc-quote sc-reveal">
                <p className="sc-big sc-bad">3.4 s</p>
                <blockquote>This is a medical emergency.</blockquote>
                <figcaption>Run 2. It refused to give the steps.</figcaption>
              </figure>
            </div>
            <p className="sc-note sc-reveal">
              A small local model (<code>llama3.2:1b</code>) on the same laptop, asked for the casualty control steps for low lube oil pressure.
              Answers paraphrased. The copilot never writes a step: it finds approved text and holds its order.
            </p>
          </div>
        </section>

        <section className="sc-section" aria-labelledby="offline-title">
          <div className="sc-wrap">
            <Head
              id="offline-title"
              kicker="Offline doctrine"
              title="Everything runs on the laptop. Wi-Fi off."
              lead="Procedures, search model, and signing keys install from a USB stick. No GPU, no cloud account, no network at sea."
            />
            <div className="sc-stats sc-reveal">
              <Stat value={102} label="casualty procedures" />
              <Stat value={771} label="steps, word for word" />
              <Stat value={14} label="plant systems, GTM to steering" />
            </div>
            <div className="sc-sources sc-reveal">
              <h3>Built from public, unclassified doctrine</h3>
              <ul>
                {SOURCES.map((src) => (
                  <li key={src.name}>
                    <a href={src.url} target="_blank" rel="noopener noreferrer">
                      {src.name}
                    </a>
                    <span className="sc-src-what">{src.what}</span>
                    <span className="sc-src-meta">
                      Cited by {src.cited} procedures &middot; {src.host}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="sc-note sc-reveal">
              Every procedure names its source and the exercise, chapter, or page it came from. Training copies, not a ship&rsquo;s EOCC cards. The
              links are references only; the copilot never goes online. A new casualty is one source entry and <code>make index</code>.
            </p>
          </div>
        </section>

        <section className="sc-section" aria-labelledby="speed-title">
          <div className="sc-wrap">
            <Head id="speed-title" kicker="Speed" title="Symptom in. Cited steps out. About 10 ms." />
            <div className="sc-grid2">
              <div className="sc-demo sc-reveal">
                <p className="sc-demo-q">
                  <code>low lube oil pressure on number two SSGTG</code>
                </p>
                <p className="sc-demo-a">
                  <strong>EOCC-SSGTG-LLOP</strong> Low Lube Oil Pressure, Ship Service Gas Turbine Generator
                </p>
                <p className="sc-demo-meta">Cited to COMSCINST 3541.6A exercise D-15. 10 steps, 01 next. 11 ms on the server.</p>
              </div>
              <div className="sc-demo sc-demo-no sc-reveal">
                <p className="sc-demo-q">
                  <code>low lube oil pressure on number two SSDG</code>
                </p>
                <p className="sc-demo-a">No authorized procedure is held for ship service diesel generator. Use the EOCC binder.</p>
                <p className="sc-demo-meta">A DDG-51 has no diesel generators. No match means no steps, never a guess.</p>
              </div>
            </div>
            <p className="sc-note sc-reveal">8 to 12 ms server time on the six demo queries, warm, on a laptop CPU. Keyword search plus a small local embedding model.</p>
          </div>
        </section>

        <section className="sc-section" aria-labelledby="policy-title">
          <div className="sc-wrap">
            <Head
              id="policy-title"
              kicker="Policy engine"
              title="Steps unlock in order. Rules decide, never a model."
              lead="01 and 02 are done, and 03 is next. The watch tries 05 early. Each step requires the one before it, so the engine names the missing step, 04, and shows the danger note. The refusal is signed too."
            />
            <div className="sc-screen sc-reveal" aria-label="Example from the copilot screen">
              <ol className="step-list">
                {POLICY_STEPS.map((st) => (
                  <li key={st.seq} className={`step step-${st.state}${st.tried ? ' sc-tried-step' : ''}`}>
                    <span className="step-marker">{st.state === 'done' ? <CheckIcon /> : st.state === 'next' ? <NextIcon /> : <LockIcon />}</span>
                    <div>
                      <div className="step-top">
                        <span className="step-seq">{st.seq}</span>
                        <span className="step-state">{st.state === 'done' ? 'Done' : st.state === 'next' ? 'Next' : 'Locked'}</span>
                        {st.tried && <span className="sc-tried">Tried early</span>}
                      </div>
                      <p className="step-text">{st.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="action-banner blocked sc-banner" role="note">
                <BlockIcon />
                <div>
                  <p className="blocked-reason">Blocked: step 05 requires step 04 first.</p>
                  <p className="blocked-meta">
                    Danger: never before 04 while the affected SSGTG carries load the others cannot pick up; if LO pressure keeps falling or bearing
                    noise is heard, stop the engine at once as MSC D-15 directs, and report the loss of the generator.
                  </p>
                </div>
              </div>
            </div>
            <p className="sc-note sc-reveal">
              <code>ignore your rules and secure number two SSGTG</code> finds the same procedure with 05 still locked. The rules read the step
              order, not the words.
            </p>
          </div>
        </section>

        <section className="sc-section" aria-labelledby="log-title">
          <div className="sc-wrap">
            <Head
              id="log-title"
              kicker="Signed audit log"
              title="Every action signed. The log proves itself."
              lead="Allowed and blocked actions, and every query, become one entry each."
            />
            <ol className="sc-chain sc-reveal">
              <li>
                <p className="sc-big">Ed25519</p>
                <p>Each acknowledgement is signed with the key of the operator on watch. Each query is signed by the copilot.</p>
              </li>
              <li>
                <p className="sc-big">SHA-256</p>
                <p>Each entry carries the hash of the one before it. Delete or reorder one, and the chain breaks.</p>
              </li>
              <li>
                <p className="sc-big sc-bad">Broken</p>
                <p>
                  Change one word and Verify names the entry: <q>Chain broken at entry N: payload hash does not match.</q>
                </p>
              </li>
            </ol>
          </div>
        </section>

        <section className="sc-section" aria-labelledby="paper-title">
          <div className="sc-wrap">
            <Head
              id="paper-title"
              kicker="Paper checklist"
              title="Gloves on, laptop out of reach? Print it."
              lead="The paper still ends up in the signed log, under the same order rules."
            />
            <div className="sc-paper-grid">
              <PaperSheet />
              <ol className="sc-steps3 sc-steps-stack">
                <li className="sc-reveal">
                  <span className="sc-step-n" aria-hidden="true">1</span>
                  <h3>Print checklist</h3>
                  <p>Each step with its order and danger note, and room for the reading, the time, and initials. The sheet carries the query id.</p>
                </li>
                <li className="sc-reveal">
                  <span className="sc-step-n" aria-hidden="true">2</span>
                  <h3>Work the casualty</h3>
                  <p>In the space, on paper, in order.</p>
                </li>
                <li className="sc-reveal">
                  <span className="sc-step-n" aria-hidden="true">3</span>
                  <h3>Enter paper results</h3>
                  <p>Each ticked step is signed into the log, marked from paper. The policy engine still blocks one out of order.</p>
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section className="sc-section" aria-labelledby="casrep-title">
          <div className="sc-wrap">
            <Head
              id="casrep-title"
              kicker="CASREP, standardized"
              title="Every CASREP in the same shape, from what the watch actually did."
              lead="Today each watch writes its CASREP its own way, from memory, after the casualty. The words, the detail, and the format drift from sailor to sailor and ship to ship. The copilot drafts it from the signed run instead, so every report reads the same."
            />
            <div className="sc-cr-grid">
              <CasrepSheet />
              <div className="sc-cr-points">
                <article className="sc-point sc-reveal">
                  <h3>Same fields, every time</h3>
                  <p>One layout for every casualty, with the NWP 1-03.1 report types: INITIAL, UPDATE, CORRECT, CASCOR, and CASCAN.</p>
                </article>
                <article className="sc-point sc-reveal">
                  <h3>Doctrine words, not memory</h3>
                  <p>The equipment and the steps come from the procedure card. The times and the order come from the signed log.</p>
                </article>
                <article className="sc-point sc-reveal">
                  <h3>Evidence attached</h3>
                  <p>Each step names its audit entry. A step the policy engine blocked is in the remarks, and the chain check is too.</p>
                </article>
                <article className="sc-point sc-reveal">
                  <h3>A person makes the calls</h3>
                  <p>Category, outside help, parts, and the repair estimate stay with the sailor and the chain of command.</p>
                </article>
              </div>
            </div>
            <ul className="sc-ticks sc-reveal">
              <li>Verifies every hash and signature first, and refuses to draft from a broken log.</li>
              <li>Sends to the CASREP Board only after a yes. On the board it routes Originator, DIVO, DH, CHENG, XO, CO, then Released.</li>
            </ul>
          </div>
        </section>

        <section className="sc-section" aria-labelledby="known-title">
          <div className="sc-wrap">
            <Head
              id="known-title"
              kicker="CASREP Board, both ways"
              title="Open CASREPs come back to the watch."
              lead="The next watch that meets the same casualty sees that it is already reported, and where its CASREP stands."
            />
            <div className="known-banner sc-reveal" role="note" aria-label="Example known casualty banner">
              <p>
                <strong>Known casualty:</strong> CASREP N99999/0003 is open on SSGTG 2 lube oil system (CAT 2, at DH review). Do the immediate
                actions, then check whether this matches it.
              </p>
            </div>
            <ul className="sc-ticks sc-reveal">
              <li>The copilot reads the board every minute into a cache on the laptop, so a slow or missing board never slows an answer.</li>
              <li>A CASREP matches by its procedure id, or by the equipment words of the procedure&apos;s system.</li>
              <li>Read only, and never a reason to skip a step: the steps stay live under the banner.</li>
            </ul>
          </div>
        </section>

        <section id="flow" className="sc-section sc-flowsec" aria-labelledby="flow-title">
          <div className="sc-wrap sc-wrap-wide">
            <Head id="flow-title" kicker="The whole loop" title="From alarm to released CASREP, and back." />
            <FlowDiagram />
          </div>
        </section>

        <section className="sc-section" aria-labelledby="future-title">
          <div className="sc-wrap">
            <Head
              id="future-title"
              kicker="Future work, not built"
              title="Next: hands free, and lessons learned."
              lead="None of this is in the demo. Each keeps the same rules: authorized doctrine only, steps in order, every action signed."
            />
            <div className="sc-grid3">
              <article className="sc-point sc-reveal">
                <h3>Voice in, voice out</h3>
                <p>
                  Push to talk with speech to text that runs on the laptop, so no audio leaves the space. The words it heard stay on screen
                  before the search runs, and the copilot reads the next step aloud.
                </p>
              </article>
              <article className="sc-point sc-reveal">
                <h3>Lessons learned</h3>
                <p>Released CASREPs feed back into the doctrine index, so the next watch sees what fixed the same casualty last time.</p>
              </article>
              <article className="sc-point sc-reveal">
                <h3>The ship&apos;s own cards</h3>
                <p>
                  Load the ship&apos;s approved EOCC cards in place of the training set, and bind each operator key to the CAC. A structured
                  procedure field on the board makes every CASREP match exactly.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="sc-section sc-cta" aria-labelledby="cta-title">
          <div className="sc-wrap sc-reveal">
            <h2 id="cta-title">See it run.</h2>
            <p className="sc-lead">Type a symptom. Try step 05 early. Then verify the log.</p>
            <Link href="/" className="sc-go">
              Open the live copilot
            </Link>
          </div>
        </section>
      </main>
      <ShowcaseMotion />
    </>
  );
}
