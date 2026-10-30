# proxy-node-bench

Filter thousands of public proxy subscription entries down to a handful that
actually connect, then pick the fastest one by latency and switch to it.

Built to answer one question: **of these 289 candidate nodes, which 10 are real?**

## What it does

1. `src/refresh.mjs` fetches public subscription files through the GitHub contents
   API (base64), parses `ss://` and `vmess://` URIs, de-duplicates by host:port.
2. Probes every node with a 60-way concurrent TCP connect (2.5s timeout) and keeps
   only the ones that answer.
3. Writes a ready-to-run `config.yaml` for mihomo (Clash Meta).
4. `src/rank.mjs` asks the running mihomo instance for real latency per node via
   `/proxies/{name}/delay` (15 concurrent), sorts, and switches the `PROXY` group to
   the winner.

## Measured result (one run, 2026-10-29)

| Stage | Count |
|---|---|
| Candidates parsed | 289 |
| TCP-reachable | 53 |
| Usable after latency test | 10 |
| Fastest | 520 ms |
| Best sustained download | ~636 KB/s (5 Mbps) |

All 237 `vmess` entries were dead; every usable node was `ss`. That ratio is the
point of the tool — you cannot tell by looking, only by connecting.

## Usage

```bash
node src/refresh.mjs     # writes config.yaml into the current directory
# start mihomo with that config, API on 127.0.0.1:9099
node src/rank.mjs        # prints the table and switches to the fastest node
```

Environment: `MIHOMO_API` (default `http://127.0.0.1:9099`), `MIHOMO_SECRET`
(default `local`).

## Notes

- Node lists and `config.yaml` are generated artifacts and are git-ignored on purpose.
  Nothing here ships a working proxy; it ships the filtering.
- A TCP handshake proves the port is open, not that the protocol works. The latency
  test in step 4 is what actually separates "reachable" from "usable".
- Free nodes die within days. Re-run `refresh.mjs` rather than trusting a saved list.
