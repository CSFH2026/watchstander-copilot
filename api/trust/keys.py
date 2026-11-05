"""Ed25519 identities for the copilot node and each operator.

Private keys stay in api/data/keys/ on this laptop; the roster holds only public keys.
In production the operator key is bound to the Sailor's CAC at enrollment instead.
"""
import base64
import json
import os
import re
import sys
from pathlib import Path

from nacl.encoding import RawEncoder
from nacl.exceptions import BadSignatureError
from nacl.signing import SigningKey, VerifyKey

from config import KEYS_DIR, NODE_ID, OPERATOR_IDS, ROSTER_PATH

# An identity names a file in KEYS_DIR, so it is a plain name: "EOOW-01", "copilot-node-01".
IDENTITY_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}")


def key_path(identity: str, keys_dir: Path = KEYS_DIR) -> Path:
    """The private key file for identity. Refuses any name that could reach outside keys_dir."""
    if not isinstance(identity, str) or not IDENTITY_RE.fullmatch(identity):
        raise ValueError(f"{identity!r} is not a valid identity; use letters, digits, - and _")
    path = keys_dir / f"{identity}.key"
    if not path.resolve().is_relative_to(keys_dir.resolve()):
        raise ValueError(f"{identity!r} resolves outside {keys_dir}")
    return path


def write_secret(path: Path, data: bytes) -> None:
    """Writes data readable by this user only, from the first byte: the file never exists with wider rights."""
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.fchmod(fd, 0o600)  # an older file keeps its mode on O_TRUNC, so set it here too
        os.write(fd, data)
    finally:
        os.close(fd)


def _roster() -> dict:
    return json.loads(ROSTER_PATH.read_text()) if ROSTER_PATH.exists() else {}


def enroll(identity: str) -> str:
    """Creates a key for identity if it has none. Returns the public key, base64."""
    path = key_path(identity)
    KEYS_DIR.mkdir(parents=True, exist_ok=True)
    if path.exists():
        sk = SigningKey(path.read_bytes(), encoder=RawEncoder)
    else:
        sk = SigningKey.generate()
        write_secret(path, bytes(sk))
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
    sk = SigningKey(key_path(identity).read_bytes(), encoder=RawEncoder)
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
