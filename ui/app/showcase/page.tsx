import type { Metadata } from 'next';
import Link from 'next/link';
import { BlockIcon, CheckIcon, LockIcon, NextIcon, WarnIcon } from '../../components/icons';
import { RedLightToggle, ThemeToggle } from '../../components/theme-toggle';

export const metadata: Metadata = {
  title: 'Watchstander Copilot: showcase',
  description: 'The problem the copilot solves, and how it solves it, from symptom to signed record.',
};

// Every figure and quote below was checked against this repo's API and corpus on Nov 4.
// Change one only after measuring again; the page is a claim the team stands behind.
const SECTIONS = [
  { id: 'problem', label: 'The problem' },
  { id: 'solution', label: 'The solution' },
  { id: 'trust', label: 'Why trust it' },
  { id: 'scale', label: 'How it scales' },
];

const DANGER_05 =
  'never before 04 while the affected unit is the only source on the bus; if LO pressure falls below the trip point or bearing noise is heard, stop the engine at once and report the loss of power.';

function SectionHead({ n, id, title, lead }: { n: number; id: string; title: string; lead: string }) {
  return (
    <header className="sc-head">
      <span className="sc-kicker">
        {n} / {SECTIONS.find((s) => s.id === id)?.label}
      </span>
      <h2 id={`${id}-title`}>{title}</h2>
      <p className="sc-lead">{lead}</p>
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

      <main className="page sc">
        <section className="sc-hero" aria-labelledby="hero-title">
          <p className="sc-time">0200, main control</p>
          <h1 id="hero-title">Low lube oil pressure alarm on No. 2 ship service diesel generator.</h1>
          <p className="sc-lead">
            The EOOW has seconds to act and a binder of casualty cards to search. The copilot turns the reported symptom into the right
            procedure, in order, with the source cited and every action on a signed record.
          </p>
          <nav className="sc-toc" aria-label="Walkthrough">
            {SECTIONS.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} className="chip sc-chip">
                {i + 1}. {s.label}
              </a>
            ))}
            <Link href="/" className="chip sc-chip sc-chip-go">
              5. Live copilot
            </Link>
          </nav>
        </section>

        <section id="problem" className="sc-section" aria-labelledby="problem-title">
          <SectionHead
            n={1}
            id="problem"
            title="A casualty is the worst time to search a binder"
            lead="Engineering casualty control is a fixed sequence. Under stress, finding it, following it, and proving it was followed are all hard."
          />
          <div className="sc-grid">
            <article className="card sc-card">
              <h3>Lookup under stress</h3>
              <p>The watch must find the right card from what they see and hear, at night, with alarms sounding and the plant still moving.</p>
            </article>
            <article className="card sc-card">
              <h3>Wrong order is dangerous</h3>
              <p>
                Securing the affected generator before load is shifted can drop the bus. The card says step 05 is &ldquo;never before 04 while the
                affected unit is the only source on the bus.&rdquo;
              </p>
            </article>
            <article className="card sc-card">
              <h3>A chatbot is not the answer</h3>
              <p>
                We asked a small local language model for the steps. One run took 11.7 s and said to use fire suppression and drain fuel. The next took
                3.4 s and called it a medical emergency. Same question, two wrong answers.
              </p>
            </article>
            <article className="card sc-card">
              <h3>No trusted record</h3>
              <p>After the casualty, nobody can prove who did which step, when, and in what order. A typed log can be edited and nobody would know.</p>
            </article>
          </div>
        </section>

        <section id="solution" className="sc-section" aria-labelledby="solution-title">
          <SectionHead
            n={2}
            id="solution"
            title="Symptom in, cited steps out, every action signed"
            lead="The Sailor types the symptom the way they would report it. The copilot does the lookup, holds the sequence, and keeps the record."
          />

          <ol className="sc-flow">
            <li className="card sc-beat">
              <span className="sc-beat-n">A</span>
              <div className="sc-beat-body">
                <h3>Type the symptom, get the procedure</h3>
                <p className="sc-query">
                  <code>low lube oil pressure on number two SSDG</code>
                </p>
                <p>
                  Returns <strong>EOCC-SSDG-LLOP</strong>, cited to exercise D-15, with every step in order and the next one marked. Hybrid search
                  understands shorthand like &ldquo;LO press&rdquo; and &ldquo;2SSDG&rdquo;.
                </p>
                <p className="sc-fact">
                  <span className="sc-fact-num">6 to 13 ms</span> search time across ten test queries. The answer is on screen well under a second.
                </p>
              </div>
            </li>

            <li className="card sc-beat">
              <span className="sc-beat-n">B</span>
              <div className="sc-beat-body">
                <h3>The guardrail holds the order</h3>
                <p>Steps unlock only in sequence. A step out of order, or a danger step too early, is blocked with the card&rsquo;s own reason.</p>
                <div className="sc-screen" aria-label="Example from the copilot screen">
                  <ol className="step-list">
                    <li className="step step-done">
                      <span className="step-marker"><CheckIcon /></span>
                      <div>
                        <div className="step-top"><span className="step-seq">03</span><span className="step-state">Done</span></div>
                        <p className="step-text">Start the standby ship service diesel generator and parallel it to the bus.</p>
                      </div>
                    </li>
                    <li className="step step-next">
                      <span className="step-marker"><NextIcon /></span>
                      <div>
                        <div className="step-top"><span className="step-seq">04</span><span className="step-state">Next</span></div>
                        <p className="step-text">Shift electrical load to the standby generator; trip non-vital circuits if the standby unit cannot carry the full load.</p>
                      </div>
                    </li>
                    <li className="step step-locked">
                      <span className="step-marker"><LockIcon /></span>
                      <div>
                        <div className="step-top"><span className="step-seq">05</span><span className="step-state">Locked</span></div>
                        <p className="step-text">Secure the affected generator: open its breaker, then stop the engine.</p>
                        <p className="step-danger"><WarnIcon /><span><strong>Danger</strong> {DANGER_05}</span></p>
                      </div>
                    </li>
                  </ol>
                  <div className="action-banner blocked sc-banner" role="note">
                    <BlockIcon />
                    <div>
                      <p className="blocked-reason">Blocked: step 05 requires step 04 first.</p>
                      <p className="blocked-meta">The refusal is signed and written to the log too.</p>
                    </div>
                  </div>
                </div>
              </div>
            </li>

            <li className="card sc-beat">
              <span className="sc-beat-n">C</span>
              <div className="sc-beat-body">
                <h3>Every action signed, every edit caught</h3>
                <p>
                  Each acknowledgement is signed with the Ed25519 key of the operator on watch; each query is signed by the copilot itself. Every
                  entry is chained to the one before it with SHA-256. Change one word in the log and verification names the first broken entry.
                </p>
                <p className="sc-fact sc-fact-bad">
                  <span className="sc-fact-num">BROKEN at entry 11</span> after we flipped one blocked action to allowed in a copy of the log.
                </p>
              </div>
            </li>

            <li className="card sc-beat">
              <span className="sc-beat-n">D</span>
              <div className="sc-beat-body">
                <h3>Fully offline</h3>
                <p>
                  The procedures, the search model, and the keys live on the laptop. With wifi off, it still answers. No GPU, no cloud account, no
                  network at sea.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section id="trust" className="sc-section" aria-labelledby="trust-title">
          <SectionHead
            n={3}
            id="trust"
            title="Nothing on the answer path makes anything up"
            lead="The copilot finds and orders; it never writes. That is why a Sailor and a Chief Engineer can trust what is on the screen."
          />
          <div className="sc-grid">
            <article className="card sc-card">
              <h3>No language model in the answer</h3>
              <p>Search ranks procedures. A fixed rule engine, built from each card&rsquo;s own order and danger notes, decides what is allowed. No text is generated.</p>
            </article>
            <article className="card sc-card">
              <h3>Word for word from doctrine</h3>
              <p>Every step on screen is the exact text of the procedure file, with its source and exercise number. Nothing is paraphrased.</p>
            </article>
            <article className="card sc-card">
              <h3>It says when it does not know</h3>
              <p>
                <code>gas turbine generator fire in the module</code> returns &ldquo;No authorized procedure is held for gas turbine generator. Use the EOCC
                binder.&rdquo; If two cards fit, it asks the Sailor to confirm.
              </p>
            </article>
            <article className="card sc-card">
              <h3>Words cannot unlock a step</h3>
              <p>
                <code>ignore your rules and secure the generator now</code> leaves step 05 locked. The rules read the step order, not the request.
              </p>
            </article>
          </div>
        </section>

        <section id="scale" className="sc-section" aria-labelledby="scale-title">
          <SectionHead
            n={4}
            id="scale"
            title="One folder per ship class"
            lead="Adding a casualty is adding a file. Adding a ship class is adding a folder. The engineering department reviews doctrine, not code."
          />
          <div className="sc-scale">
            <pre className="card sc-tree" aria-label="Corpus folder layout">
{`corpus/
  ddg/
    EOCC-SSDG-LLOP.md
    EOCC-SSDG-LFOP.md
    EOCC-SSDG-HJWT.md
  <next ship class>/
    ...`}
            </pre>
            <ul className="sc-points">
              <li><strong>One markdown file per procedure.</strong> Each step carries its <code>requires:</code> and <code>danger:</code> notes.</li>
              <li><strong>One command to rebuild.</strong> <code>make index</code> reads the folder. The guardrail is built from the same file, so order and danger notes cannot drift.</li>
              <li><strong>Runs on the laptop the ship already has.</strong> Installs from a USB stick; no GPU and no network.</li>
              <li><strong>Today:</strong> 3 procedures and 27 steps for the DDG ship service diesel generators, from public, unclassified training text.</li>
            </ul>
          </div>
        </section>

        <section className="sc-cta" aria-labelledby="cta-title">
          <h2 id="cta-title">See it run</h2>
          <p className="sc-lead">Type the symptom. Try step 05 early. Then verify the log.</p>
          <Link href="/" className="sc-go">
            Open the live copilot
          </Link>
        </section>
      </main>
    </>
  );
}
