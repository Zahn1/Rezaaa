"""REZAA backend configuration. Values come from the environment; a
backend/.env file (KEY=value lines, gitignored) is loaded first so secrets
never need to live in shell profiles or compose files."""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

_env_file = BASE_DIR / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if _line and not _line.startswith("#") and "=" in _line:
            _k, _, _v = _line.partition("=")
            os.environ.setdefault(_k.strip(), _v.strip().strip('"').strip("'"))
DATA_DIR = Path(os.environ.get("REZAA_DATA_DIR", BASE_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

# AI provider
# REZAA_PROVIDER: auto | anthropic | ollama | echo
#   auto = Anthropic if key present, else Ollama if reachable, else echo
REZAA_PROVIDER = os.environ.get("REZAA_PROVIDER", "auto").lower()
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
REZAA_MODEL = os.environ.get("REZAA_MODEL", "claude-opus-4-8")
REZAA_FAST_MODEL = os.environ.get("REZAA_FAST_MODEL", "claude-haiku-4-5")

# Local mode (Ollama)
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434").rstrip("/")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")

# Safety
READ_ONLY_DEFAULT = os.environ.get("REZAA_READ_ONLY", "1") != "0"
CONFIRMATION_TTL_SECONDS = int(os.environ.get("REZAA_CONFIRM_TTL", "120"))
# Paths REZAA is allowed to read in safe mode (colon separated)
ALLOWED_READ_PATHS = [
    p for p in os.environ.get("REZAA_ALLOWED_PATHS", str(Path.home() / "Desktop")).split(":") if p
]
# Things REZAA must never touch
FORBIDDEN_PATTERNS = [
    "keychain", "password", "passwd", ".ssh", ".aws", ".gnupg",
    "credential", "secret", "wallet", "banking", "Login Data", "Cookies",
]

# Memory
MEMORY_COLLECTION = "rezaa_memory"
MEMORY_MAX_RESULTS = 8

# Server
CORS_ORIGINS = os.environ.get(
    "REZAA_CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

AUDIT_LOG_PATH = DATA_DIR / "audit.jsonl"
