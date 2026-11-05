"""Creates the Ed25519 keys the cloud backend signs with, kept apart from the laptop keys.

Writes cloud/.keys/<identity>.key (32-byte seeds, gitignored), cloud/.keys/roster.json (public keys,
copied into the bundle), and cloud/.dev.vars so `wrangler pages dev` can sign locally.
Prints the `wrangler pages secret put` commands for the deployed project. Existing keys are reused.

Run: .venv/bin/python scripts/keys_cloud.py
"""
import base64
import json
import os
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "api"))
os.environ.setdefault("WSC_CONFIG", str(REPO / "config" / "cloudflare.yaml"))

from nacl.signing import SigningKey  # noqa: E402

from config import CONFIG, NODE_ID, OPERATOR_IDS  # noqa: E402

KEYS = REPO / "cloud" / ".keys"


def secret_name(identity: str) -> str:
    # Same rule as keyName() in cloud/src/keys.ts.
    return "WSC_KEY_" + "".join(c if c.isalnum() else "_" for c in identity.upper())


def main() -> None:
    KEYS.mkdir(parents=True, exist_ok=True)
    roster, dev_vars = {}, []
    for identity in [NODE_ID, *OPERATOR_IDS]:
        path = KEYS / f"{identity}.key"
        if path.exists():
            sk = SigningKey(path.read_bytes())
        else:
            sk = SigningKey.generate()
            path.write_bytes(bytes(sk))
            os.chmod(path, 0o600)
        roster[identity] = base64.b64encode(bytes(sk.verify_key)).decode()
        dev_vars.append(f"{secret_name(identity)}={base64.b64encode(bytes(sk)).decode()}")
    (KEYS / "roster.json").write_text(json.dumps(roster, indent=2, sort_keys=True))
    dev = REPO / "cloud" / ".dev.vars"
    dev.write_text("\n".join(dev_vars) + "\n")
    os.chmod(dev, 0o600)
    print(f"roster: {', '.join(roster)} -> {KEYS / 'roster.json'}")
    print(f"local secrets for wrangler pages dev -> {dev}")
    project = CONFIG["cloudflare"]["pages_project"]
    print("\nFor the deployed project, run once from cloud/ (each command reads the seed from its key file):")
    for identity in roster:
        print(f"  base64 < .keys/{identity}.key | tr -d '\\n' | npx wrangler pages secret put {secret_name(identity)} --project-name {project}")


if __name__ == "__main__":
    main()
