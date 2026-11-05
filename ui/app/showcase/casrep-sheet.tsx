// A CASREP as the copilot drafts it, taken from a real draft of the LLOP demo run (api/casrep.py).
// Each field says who fills it, because that split is the point: the run supplies the facts, a
// person supplies only the judgment calls.

type Source = 'run' | 'ship' | 'sailor';

const TAG: Record<Source, string> = { run: 'From the signed run', ship: 'Ship setting', sailor: "Sailor's call" };

const HEAD: { k: string; v: string; src: Source }[] = [
  { k: 'Serial', v: 'N99999/0001', src: 'run' },
  { k: 'Unit', v: 'USS EXAMPLE (DDG 999)', src: 'ship' },
  { k: 'Report', v: 'INITIAL', src: 'run' },
  { k: 'DTG', v: '050200Z NOV 26', src: 'run' },
  { k: 'Equipment', v: 'Ship service gas turbine generators (501-K34 SSGTG): Low Lube Oil Pressure, Ship Service Gas Turbine Generator', src: 'run' },
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

function Tag({ src }: { src: Source }) {
  return <span className={`sc-cr-tag sc-cr-tag-${src}`}>{TAG[src]}</span>;
}

export function CasrepSheet() {
  return (
    <figure className="sc-cr-fig sc-reveal">
      <div className="sc-cr" role="group" aria-label="Example CASREP drafted from the low lube oil pressure demo run">
        <p className="sc-cr-kicker">CASREP &middot; simplified training form</p>
        <dl className="sc-cr-head">
          {HEAD.map((f) => (
            <div key={f.k} className={f.k === 'Equipment' ? 'sc-cr-row sc-cr-wide' : 'sc-cr-row'}>
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
              <Tag src={f.src} />
            </div>
          ))}
        </dl>
        <section className="sc-cr-block" aria-label="Description">
          <h4>
            Description <Tag src="run" />
          </h4>
          <p>Casualty: Low Lube Oil Pressure, Ship Service Gas Turbine Generator.</p>
          <p>
            Reported at 050200Z NOV 26 by EOOW-02: &ldquo;low lube oil pressure on number two SSGTG&rdquo;. Matched procedure EOCC-SSGTG-LLOP
            (clear match).
          </p>
          <p>Actions taken (4 of 10 steps):</p>
          <ul>
            {DONE.map(([n, text, seq]) => (
              <li key={n}>
                <b>{n}</b> {text} <span className="sc-cr-seq">audit #{seq}</span>
              </li>
            ))}
          </ul>
          <p>Steps not yet done: 05, 06, 07, 08, 09, 10.</p>
        </section>
        <section className="sc-cr-block" aria-label="Remarks">
          <h4>
            Remarks <Tag src="run" />
          </h4>
          <p>Query q-0001 is audit #1, hash ed01cb71d3d6df94. Step entries #2, #3, #5, #6, each signed by EOOW-02.</p>
          <p>Blocked by the policy engine: #4, step 05: step 05 requires step 04 first.</p>
          <p>Audit chain verified: 6 entries. Source: COMSCINST 3541.6A exercise D-15; NAVEDTRA 14114 chapter 3.</p>
        </section>
      </div>
      <figcaption>
        Drafted from a real run of the demo question. The sailor checks it, sets the category, and sends it only after a yes. On screen it is
        <strong> Draft CASREP</strong>; in a terminal, <code>make casrep</code>.
      </figcaption>
    </figure>
  );
}
