/**
 * The TRACE mark: a letter T drawn as five linked nodes. The links are the hash chain, the line is
 * the trace, and the last node is the signed step. The signed node is the only one that is larger and
 * carries a check, so the mark still reads in the red-light palette where every colour is one hue.
 * Colours come from the .tm-* classes in globals.css.
 */
export function TraceMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="tm" width={size} height={size} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <rect className="tm-bg" width="120" height="120" rx="26" />
      <path className="tm-line" d="M22 38H98M60 38V90" />
      <circle className="tm-node" cx="22" cy="38" r="6.5" />
      <circle className="tm-node" cx="60" cy="38" r="6.5" />
      <circle className="tm-node" cx="98" cy="38" r="6.5" />
      <circle className="tm-node" cx="60" cy="64" r="6.5" />
      <circle className="tm-seal" cx="60" cy="90" r="11" />
      <path className="tm-check" d="M54.5 90.5L58.5 94.5L66 86" />
    </svg>
  );
}
