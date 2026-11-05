"""One entry point for a hoster. Reads the config file named by WSC_CONFIG (default config/local.yaml).

  make run      local target: build the UI, start the API on local.host:local.port
                cloudflare target: build the UI and the bundle, run Pages Functions on this machine
                (wrangler pages dev, local D1, Workers AI) so changes are tested before any deploy
  make deploy   cloudflare target only: D1 migrations and dataset seed, Pages deploy, then step vectors

The dataset is the config's dataset: (or WSC_DATASET). Its content goes to D1 from cloud/data/seed.sql,
and its step vectors go to a Vectorize index named for the dataset and corpus hash, so a changed
corpus never overwrites the vectors a live deployment is using.

Run: .venv/bin/python scripts/run.py [run|deploy]
"""
import base64
import hashlib
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "api"))
# Progress lines must appear as they happen, also when the output is piped to a log.
sys.stdout.reconfigure(line_buffering=True)

from config import CONFIG, CONFIG_PATH, DATASET_NAME  # noqa: E402
from trust.audit import canonical  # noqa: E402

PY = str(REPO / ".venv" / "bin" / "python")
CLOUD = REPO / "cloud"
WRANGLER = str(CLOUD / "node_modules" / ".bin" / "wrangler")
# Must not be newer than the workerd bundled with the pinned wrangler, or pages dev refuses to start.
COMPATIBILITY_DATE = "2026-07-29"
# Placeholder for wrangler pages dev, which keeps D1 on this machine and never reads the id.
LOCAL_DB_ID = "00000000-0000-0000-0000-000000000000"
DEV_PORT = 8788
# Vector width of each embed model the cloud can use.
DIMENSIONS = {"@cf/baai/bge-small-en-v1.5": 384}
EMBED_BATCH = 100
# Cloudflare's bot filter answers 403 to Python's default user agent, so every request names itself.
UA = {"User-Agent": "watchstander-copilot-deploy/1.0"}


def bundle() -> dict:
    return json.loads((CLOUD / "data" / "bundle.json").read_text(encoding="utf-8"))


def vector_index() -> str:
    # Named for the dataset and corpus hash: dev and prod share an index only when the content matches.
    return f"watchstander-{DATASET_NAME}-{bundle()['corpus_sha256'][:8]}"


def sh(cmd: list[str], cwd: Path = REPO, env: dict | None = None) -> None:
    print("+", " ".join(cmd), flush=True)
    subprocess.run(cmd, cwd=cwd, check=True, env={**os.environ, **(env or {})})


def build_ui() -> None:
    if not (REPO / "ui" / "node_modules").exists():
        sh(["npm", "ci"], cwd=REPO / "ui")
    # Same origin in both targets, so the API base stays empty; the mock is never built here.
    sh(["npm", "run", "build"], cwd=REPO / "ui", env={"NEXT_PUBLIC_MOCK": "0", "NEXT_PUBLIC_API_BASE": ""})


def d1_id(create: bool) -> str:
    name = CONFIG["cloudflare"]["d1_database"]
    out = subprocess.run([WRANGLER, "d1", "list", "--json"], cwd=CLOUD, check=True, capture_output=True, text=True).stdout
    for db in json.loads(out):
        if db["name"] == name:
            return db["uuid"]
    if not create:
        sys.exit(f"D1 database {name} does not exist yet; make deploy creates it")
    sh([WRANGLER, "d1", "create", name], cwd=CLOUD)
    return d1_id(create=False)


def ensure_vector_index() -> None:
    name = vector_index()
    out = subprocess.run([WRANGLER, "vectorize", "list", "--json"], cwd=CLOUD, check=True, capture_output=True, text=True).stdout
    if name in {i["name"] for i in json.loads(out[out.index("["):])}:
        return
    dims = DIMENSIONS[bundle()["embed_model"]]
    sh([WRANGLER, "vectorize", "create", name, f"--dimensions={dims}", "--metric=cosine"], cwd=CLOUD)


def d1(where: str, sql: str) -> list[dict]:
    out = subprocess.run([WRANGLER, "d1", "execute", CONFIG["cloudflare"]["d1_database"], where, "--json", "--command", sql],
                         cwd=CLOUD, check=True, capture_output=True, text=True).stdout
    return json.loads(out[out.index("["):])[0]["results"]


def meta(where: str, key: str) -> str | None:
    rows = d1(where, f"SELECT value FROM content_meta WHERE key = '{key}'")
    return rows[0]["value"] if rows else None


def seed(where: str) -> None:
    """Loads the dataset into D1 unless D1 already holds this exact corpus."""
    sha = bundle()["corpus_sha256"]
    if meta(where, "corpus_sha256") == sha:
        print(f"D1 ({where}) already holds dataset {DATASET_NAME} {sha[:8]}")
        return
    sh([WRANGLER, "d1", "execute", CONFIG["cloudflare"]["d1_database"], where, "--yes", "--file", "data/seed.sql"], cwd=CLOUD)


def wait_for(base_url: str, timeout_s: int = 180) -> None:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(urllib.request.Request(base_url + "/api/health", headers=UA), timeout=10) as r:
                if json.load(r).get("ok"):
                    return
        except (urllib.error.URLError, OSError, ValueError):
            pass
        time.sleep(3)
    sys.exit(f"{base_url} did not answer /api/health within {timeout_s} s")


def embed_steps(base_url: str, where: str) -> None:
    """Sends every step's search text to the signed embed route, which writes Vectorize."""
    from nacl.signing import SigningKey
    sha = bundle()["corpus_sha256"]
    flag = f"vectors:{vector_index()}"
    if meta(where, flag) == sha:
        print(f"Vectorize already holds dataset {DATASET_NAME} {sha[:8]}")
        return
    key = SigningKey((CLOUD / ".keys" / f"{bundle()['node_id']}.key").read_bytes())
    items = [json.loads(l) for l in (CLOUD / "data" / "embed.jsonl").read_text(encoding="utf-8").splitlines() if l]
    batches = [items[i:i + EMBED_BATCH] for i in range(0, len(items), EMBED_BATCH)]

    def send(batch: list[dict]) -> int:
        for attempt in range(40):
            body = {"corpus_sha256": sha, "items": batch, "ts": int(time.time() * 1000)}
            digest = hashlib.sha256(canonical(body)).hexdigest()
            body["signature"] = base64.b64encode(key.sign(digest.encode()).signature).decode()
            req = urllib.request.Request(base_url + "/api/admin/embed", data=json.dumps(body).encode(), method="POST",
                                         headers={"Content-Type": "application/json", **UA})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    return json.load(r)["upserted"]
            except urllib.error.HTTPError as e:
                detail = e.read().decode(errors="replace")[:200]
                # 409: the new deployment is not live at this address yet. 5xx: a passing failure.
                if e.code not in (409, 429, 500, 502, 503, 504) or attempt == 39:
                    raise RuntimeError(f"embed batch failed: {e.code} {detail}") from e
            except (urllib.error.URLError, TimeoutError):
                if attempt == 39:
                    raise
            time.sleep(min(30, 2 + attempt * 2))
        return 0

    print(f"embedding {len(items)} steps in {len(batches)} batches through {base_url}", flush=True)
    done = 0
    with ThreadPoolExecutor(4) as pool:
        for n in pool.map(send, batches):
            done += n
            if done % 2000 < EMBED_BATCH:
                print(f"  {done} of {len(items)}", flush=True)
    d1(where, f"INSERT OR REPLACE INTO content_meta VALUES ('{flag}', '{sha}')")
    print(f"Vectorize index {vector_index()} holds {done} steps (new vectors can take a minute to appear in search)")


def render_wrangler(database_id: str) -> None:
    """cloud/wrangler.jsonc is generated from the config file on every run; never edit it."""
    cf = CONFIG["cloudflare"]
    conf = {
        "name": cf["pages_project"],
        "pages_build_output_dir": "../ui/out",
        "compatibility_date": COMPATIBILITY_DATE,
        "d1_databases": [{"binding": "DB", "database_name": cf["d1_database"], "database_id": database_id,
                          "migrations_dir": "migrations"}],
        # Workers AI and Vectorize have no local mode; remote says so, and pages dev uses the real ones.
        "ai": {"binding": "AI", "remote": True},
        "vectorize": [{"binding": "VECTORS", "index_name": vector_index(), "remote": True}],
    }
    if cf.get("vars"):
        conf["vars"] = {k: str(v) for k, v in cf["vars"].items()}
    header = f"// Generated by scripts/run.py from {CONFIG_PATH.relative_to(REPO)}. Do not edit.\n"
    (CLOUD / "wrangler.jsonc").write_text(header + json.dumps(conf, indent=2) + "\n")


def prepare_cloud() -> None:
    if not (CLOUD / "node_modules").exists():
        sh(["npm", "ci"], cwd=CLOUD)
    if not (CLOUD / ".keys" / "roster.json").exists():
        sh([PY, "scripts/keys_cloud.py"])
    sh([PY, "-m", "retrieval.export"], cwd=REPO / "api", env={"WSC_CONFIG": str(CONFIG_PATH)})
    sh([str(CLOUD / "node_modules" / ".bin" / "tsc"), "--noEmit"], cwd=CLOUD)
    build_ui()


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "run"
    target = CONFIG["target"]
    print(f"config {CONFIG_PATH.relative_to(REPO)}: target {target}, offline {CONFIG['offline']}")
    if target == "local":
        if mode != "run":
            sys.exit("deploy is for a cloudflare target; a local target runs with make run")
        build_ui()
        env = {"HF_HUB_OFFLINE": "1"} if CONFIG["offline"] else {}
        local = CONFIG["local"]
        sh([str(REPO / ".venv" / "bin" / "uvicorn"), "main:app", "--host", str(local["host"]),
            "--port", str(local["port"])], cwd=REPO / "api", env=env)
        return

    prepare_cloud()
    db = CONFIG["cloudflare"]["d1_database"]
    print(f"dataset {DATASET_NAME}, Vectorize index {vector_index()}")
    if mode == "run":
        render_wrangler(LOCAL_DB_ID)
        ensure_vector_index()
        sh([WRANGLER, "d1", "migrations", "apply", db, "--local"], cwd=CLOUD)
        seed("--local")
        server = subprocess.Popen([WRANGLER, "pages", "dev", "--port", str(DEV_PORT)], cwd=CLOUD)
        try:
            base = f"http://127.0.0.1:{DEV_PORT}"
            wait_for(base)
            embed_steps(base, "--local")
            print(f"Open {base}  (Pages Functions on this machine; Workers AI and Vectorize need wifi)", flush=True)
            server.wait()
        finally:
            if server.poll() is None:
                server.terminate()
            try:
                server.wait(timeout=10)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait()
    elif mode == "deploy":
        render_wrangler(d1_id(create=True))
        ensure_vector_index()
        # Migrations and content first: the deploy is the code that reads them.
        sh([WRANGLER, "d1", "migrations", "apply", db, "--remote"], cwd=CLOUD)
        seed("--remote")
        sh([WRANGLER, "pages", "deploy", "--project-name", CONFIG["cloudflare"]["pages_project"], "--branch", "main"], cwd=CLOUD)
        base = f"https://{CONFIG['cloudflare']['pages_project']}.pages.dev"
        wait_for(base)
        embed_steps(base, "--remote")
    else:
        sys.exit(f"unknown mode {mode}; use run or deploy")


if __name__ == "__main__":
    main()
