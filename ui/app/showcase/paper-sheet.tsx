// A picture of the sheet that Print checklist makes (components/print-sheet.tsx), drawn for the
// screen: same fields, same order, the step text and danger note word for word from
// EOCC-SSGTG-LLOP. The handwriting is an example of what a Sailor writes in, not a real run.

type Row = { seq: string; text: string; after?: string; danger?: string; hand?: { reading: string; time: string; initials: string } };

const ROWS: Row[] = [
  {
    seq: '01',
    text: 'Verify low lube oil pressure on the SSGTG at the LOCOP and compare it with the EPCC indication.',
    hand: { reading: 'Low at LOCOP, EPCC agrees', time: '0203', initials: 'RT' },
  },
  {
    seq: '02',
    text: 'Report the casualty to the EOOW, the bridge, and the Chief Engineer.',
    after: '01',
    hand: { reading: 'All three told', time: '0204', initials: 'RT' },
  },
  {
    seq: '03',
    text: 'Start the standby SSGTG and parallel it to the bus.',
    after: '02',
    hand: { reading: 'Standby on the bus', time: '0209', initials: 'RT' },
  },
  {
    seq: '04',
    text: 'Shift the electrical load to the standby SSGTG; shed non-vital loads if the remaining generators cannot carry the full load.',
    after: '03',
  },
  {
    seq: '05',
    text: 'Secure the affected SSGTG; open its generator breaker, then stop the engine.',
    after: '04',
    danger:
      'never before 04 while the affected SSGTG carries load the others cannot pick up; if LO pressure keeps falling or bearing noise is heard, stop the engine at once as MSC D-15 directs, and report the loss of the generator.',
  },
];

export function PaperSheet() {
  return (
    <figure className="sc-paper-fig sc-reveal">
      <div className="sc-paper" aria-hidden="true">
        <p className="sc-pp-kicker">Training use only. Not for operational use.</p>
        <p className="sc-pp-title">Low Lube Oil Pressure, Ship Service Gas Turbine Generator</p>
        <dl className="sc-pp-facts">
          <div><dt>Procedure</dt><dd>EOCC-SSGTG-LLOP</dd></div>
          <div><dt>Sheet</dt><dd>q-0001</dd></div>
          <div><dt>Printed for</dt><dd>EOOW-01</dd></div>
          <div className="sc-pp-wide"><dt>Reported</dt><dd>&ldquo;low lube oil pressure on number two SSGTG&rdquo;</dd></div>
          <div className="sc-pp-wide">
            <dt>Source</dt>
            <dd>COMSCINST 3541.6A Engineering Casualty Control Exercises, exercise D-15 &ldquo;Low Lube Oil Pressure&rdquo; &hellip;</dd>
          </div>
        </dl>
        <p className="sc-pp-how">
          Work the steps in order. Do not start a step until every step it follows is done. For each step, tick Done, write the time and your
          initials, and write any reading or observation. Back at a console, choose Enter paper results and type sheet q-0001.
        </p>
        <table className="sc-pp-table">
          <thead>
            <tr>
              <th>Step</th>
              <th>Action</th>
              <th className="sc-pp-read">Reading or observation</th>
              <th className="sc-pp-done">Done</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.seq}>
                <td className="sc-pp-no">{r.seq}</td>
                <td>
                  {r.text}
                  {r.danger && (
                    <span className="sc-pp-danger">
                      <strong>Danger:</strong> {r.danger}
                    </span>
                  )}
                  {r.after && <span className="sc-pp-after">After step {r.after}</span>}
                </td>
                <td className="sc-pp-read">{r.hand && <span className="sc-pp-hand">{r.hand.reading}</span>}</td>
                <td className="sc-pp-done">
                  <span className={`sc-pp-box${r.hand ? ' is-ticked' : ''}`} /> Done
                  <span className="sc-pp-field">
                    Time {r.hand && <span className="sc-pp-hand">{r.hand.time}</span>}
                  </span>
                  <span className="sc-pp-field">
                    Initials {r.hand && <span className="sc-pp-hand">{r.hand.initials}</span>}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="sc-pp-more">Steps 06 to 10 continue on the sheet.</p>
      </div>
      <figcaption>
        The printed sheet for EOCC-SSGTG-LLOP, steps 01 to 05 of 10, with the handwriting of an example run: 01 to 03 ticked, 04 not yet. Every
        step prints with its order and its danger note, and the sheet number ties the paper back to its query in the log.
      </figcaption>
    </figure>
  );
}
