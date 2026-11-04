"""Ed25519 identities for the copilot node and each operator.

Private keys stay in api/data/keys/ on this laptop; the roster holds only public keys.
In production the operator key is bound to the Sailor's CAC at enrollment instead.
"""
import base64
import json
import os
import sys

from nacl.encoding import RawEncoder
from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey

from config import KEYS_DIR, NODE_ID, OPERATOR_IDS, ROSTER_PATH


def _roster() -> dict:
    return json.loads(ROSTER_PATH.read_text()) if ROSTER_PATH.exists() else {}


def enroll(identity: str) -> str:
    """Creates a key for identity if it has none. Returns the public key, base64."""
    KEYS_DIR.mkdir(parents=True, exist_ok=True)
    key_path = KEYS_DIR / f"{identity}.key"
    if key_path.exists():
        sk = SigningKey(key_path.read_bytes(), encoder=RawEncoder)
    else:
        sk = SigningKey.generate()
        key_path.write_bytes(bytes(sk))
        os.chmod(key_path, 0o600)
    pub = base64.b64encode(bytes(sk.verify_key)).decode()
    roster = _roster()
    if roster.get(identity) != pub:
        roster[identity] = pub
        ROSTER_PATH.write_text(json.dumps(roster, indent=2, sort_keys=True))
    return pub


def ensure_identities() -> None:
    for identity in [NODE_ID, *OPERATOR_IDS]:
        enroll(identity)


def sign(identity: str, message: bytes) -> str:
    sk = SigningKey((KEYS_DIR / f"{identity}.key").read_bytes(), encoder=RawEncoder)
    return base64.b64encode(sk.sign(message).signature).decode()


def verify(identity: str, message: bytes, signature_b64: str, roster: dict | None = None) -> bool:
    roster = roster if roster is not None else _roster()
    if identity not in roster:
        return False
    try:
        VerifyKey(base64.b64decode(roster[identity])).verify(message, base64.b64decode(signature_b64))
        return True
    except (BadSignatureError, ValueError):
        return False


def load_roster() -> dict:
    return _roster()


if __name__ == "__main__":
    # python -m trust.keys enroll EOOW-03
    if len(sys.argv) == 3 and sys.argv[1] == "enroll":
        print(f"{sys.argv[2]} {enroll(sys.argv[2])}")
    else:
        print("usage: python -m trust.keys enroll <operator_id>")
        sys.exit(2)
