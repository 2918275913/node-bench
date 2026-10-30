# node-bench

![CI](https://github.com/2918275913/node-bench/actions/workflows/ci.yml/badge.svg)

Filter thousands of free proxy subscription entries down to the handful that
actually connect, rank them by real latency, and switch mihomo (Clash Meta)
to the fastest one.

It was built to answer one question: of these 289 candidate nodes, which 10
are real? That cannot be told by looking at a subscription file, only by
connecting.

## Quick start

```sh
node src/refresh.mjs        # 1. fetch, parse, probe; writes config.yaml
# 2. start mihomo with that config, API on 127.0.0.1:9099
node src/rank.mjs           # 3. rank by latency, switch to the winner
```

Environment: `MIHOMO_API` (default `http://127.0.0.1:9099`), `MIHOMO_SECRET`
(default `local`).

A full run needs live subscription sources and a local mihomo process, so
there is no canned terminal output here. One real run (2026-10-29) produced:

| Stage | Count |
|---|---|
| Candidates parsed | 289 |
| TCP-reachable | 53 |
| Usable after latency test | 10 |
| Fastest | 520 ms |
| Best sustained download | ~636 KB/s (5 Mbps) |

All 237 `vmess` entries were dead; every usable node was `ss`. That ratio is
the point of the tool.

## How it compares

`node-bench` shares a word with load-testing tools and nothing else:

| | node-bench | autocannon / wrk |
|---|---|---|
| Question asked | which of N untrusted nodes actually work, and which is fastest | how much load can one endpoint take, and at what latency |
| Target | thousands of remote servers you do not control | one HTTP endpoint, usually your own |
| Method | TCP connect probe, then per-node HTTP latency through mihomo | synthetic HTTP traffic at fixed concurrency |
| Output | a filtered, ranked node list and a ready `config.yaml` | requests/sec, latency percentiles |

Use autocannon or wrk to benchmark your own API. Use `curl --proxy` to check
one specific proxy end to end. Use node-bench when the input is a pile of
untrusted candidates and the question is which two or three deserve a place
in a config.

It also ranks by latency only. The sustained-download figure in the table
above was a separate manual check through the winning node, not something the
tool measures on every run.

## How it works

1. `src/refresh.mjs` pulls public subscription files through the GitHub
   contents API (base64), parses `ss://` and `vmess://` URIs, and
   de-duplicates by `host:port`.
2. Probes every node with 60-way concurrent TCP connects (2.5 s timeout) and
   keeps only the ones that answer.
3. Writes a ready-to-run `config.yaml` for mihomo (Clash Meta).
4. `src/rank.mjs` asks the running mihomo instance for real latency per node
   via `/proxies/{name}/delay` (15 concurrent), sorts, and switches the
   `PROXY` group to the winner.

Two things worth knowing before trusting the results:

- A TCP handshake proves the port is open, not that the protocol works. The
  latency test in step 4 is what separates "reachable" from "usable".
- Free nodes die within days. Re-run `refresh.mjs` rather than trusting a
  saved list; node lists and `config.yaml` are generated artifacts and are
  git-ignored on purpose. Nothing here ships a working proxy, only the
  filtering.

## Testing

There is no automated test suite, on purpose: both scripts are network tools
against live data that changes hourly, and a recorded fixture would prove
nothing about the next run. CI runs a syntax gate instead (`node --check` on
both files) so a broken push fails fast.

## Requirements

- Node.js 18+ (uses global `fetch` and `AbortSignal.timeout`; no npm packages)
- A running mihomo (Clash Meta) for `rank.mjs`, with its API on
  `127.0.0.1:9099` or `MIHOMO_API`

## License

MIT — see [LICENSE](LICENSE).
