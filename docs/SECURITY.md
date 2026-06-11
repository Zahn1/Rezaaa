# REZAA Security & Permission Model

## Principles

1. **Read-only by default.** The gate boots with `read_only=True`. Even a
   user-confirmed action is refused until the mode is explicitly switched.
2. **Confirmation gate.** Mutating actions never run directly:
   `propose → preview + token → user answers YES within 120 s → execute`.
   Tokens are single-use and expire.
3. **Audit everything.** Every action (including denials) is appended to
   `data/audit.jsonl` and shown in the HUD. Format:
   `TIME | ACTION | TARGET | STATUS`.
4. **System isolation.** Targets matching the blocklist (keychain, password,
   .ssh, .aws, credentials, banking, wallet, browser cookie stores…) are
   denied at the gate before any handler runs. The memory engine refuses to
   store matching content.
5. **Path whitelist.** File reads are restricted to `REZAA_ALLOWED_PATHS`
   (default `~/Desktop`), resolved after expanding symlinks/`..`.

## Threat notes

- Agents receive a safety preamble in every system prompt, but enforcement
  does **not** rely on the model: the PermissionGate is code, evaluated on
  every action regardless of what an agent asks for.
- The automation executor implements only vetted handlers (`open_app`,
  `browser_task` URL-open). There is deliberately no generic shell executor.
- CORS is restricted to the configured UI origin.
- The audit log is append-only from the app's perspective; ship it to an
  external sink in production for tamper resistance.

## Operational guidance

- Keep `ANTHROPIC_API_KEY` in the environment or a secrets manager — never in
  code or memory storage.
- Run the backend container as non-root with a read-only filesystem except
  the `data/` volume.
- Review the audit trail (`GET /api/audit`) after enabling execute mode.
