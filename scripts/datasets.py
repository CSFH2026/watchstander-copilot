"""Lists the datasets under corpus/ that make demo DATASET=<name> can pick, and marks the one a run would use."""
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "api"))

from config import CONFIG, DATASET_NAME, ConfigError, load_dataset  # noqa: E402


def main() -> None:
    default = CONFIG["dataset"]
    print(f"{'name':10} {'kind':9} {'procedures':>10}  title")
    for folder in sorted(p.parent for p in (REPO / "corpus").glob("*/dataset.yaml")):
        try:
            d = load_dataset(folder.name)
        except ConfigError as e:
            print(f"{folder.name:10} invalid: {e}")
            continue
        count = sum(1 for f in folder.glob("*.md") if f.name.lower() != "readme.md")
        marks = [m for m, on in (("selected", folder.name == DATASET_NAME), ("default", folder.name == default)) if on]
        mark = f"  ({', '.join(marks)})" if marks else ""
        print(f"{d['name']:10} {d['kind']:9} {count:>10}  {d['title']}{mark}")
    print("\nPick one with: make demo DATASET=<name>   (also make run, make index, make deploy)")


if __name__ == "__main__":
    main()
