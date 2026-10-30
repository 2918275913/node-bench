# node-bench

![CI](https://github.com/2918275913/node-bench/actions/workflows/ci.yml/badge.svg)

Bulk endpoint reachability probing and latency ranking. Give it a few thousand
candidate addresses, it makes TCP connections to all of them, throws away the
dead ones, then ranks whatever answered by real latency and writes a config
file for the local proxy kernel.

The question it exists to answer: of N candidates you know nothing about,
which handful actually respond, and which one is fastest right now. That
cannot be read off a list — only measured.

## Quick start

```sh
node src/refresh.mjs        # fetch + parse candidates, probe, write config.yaml
# start the local proxy kernel with that config, API on 127.0.0.1:9099
node src/rank.mjs           # rank by latency, switch to the winner
```

Environment: `MIHOMO_API` (default `http://127.0.0.1:9099`), `MIHOMO_SECRET`
(default `local`).

A full run needs live candidate sources and a running kernel, so there is no
canned output. One real run (2026-10-29) looked like this:

| Stage | Count |
|---|---|
| Candidates parsed | 289 |
| TCP-reachable | 53 |
| Usable after latency test | 10 |
| Fastest | 520 ms |
| Best sustained download | ~636 KB/s (5 Mbps) |

The 45:1 ratio between "answered a TCP handshake" and "actually usable" is the
whole argument for measuring instead of trusting.

## How it compares

`node-bench` shares a word with load-testing tools and nothing else:

| | node-bench | autocannon / wrk |
|---|---|---|
| Question asked | which of N untrusted endpoints actually work, and which is fastest | how much load can one endpoint take, and at what latency |
| Target | thousands of remote servers you do not control | one HTTP endpoint, usually your own |
| Method | TCP connect probe, then per-node HTTP latency through the local kernel | synthetic HTTP traffic at fixed concurrency |
| Output | a filtered, ranked list and a ready `config.yaml` | requests/sec, latency percentiles |

Use autocannon or wrk to benchmark your own API. Use `curl --proxy` to check
one specific endpoint end to end. Use node-bench when the input is a pile of
unknown candidates and the question is which two or three deserve a place in
a config.

It ranks by latency only. The sustained-download figure above was a separate
manual check through the winning node, not something measured on every run.

## How it works

1. `src/refresh.mjs` pulls candidate lists, parses `ss://` and `vmess://`
   URIs, and de-duplicates by `host:port`.
2. Probes every candidate with 60-way concurrent TCP connects (2.5 s timeout)
   and keeps only the ones that answer.
3. Writes a ready-to-run `config.yaml` for mihomo (Clash Meta).
4. `src/rank.mjs` asks the running kernel for real latency per node via
   `/proxies/{name}/delay` (15 concurrent), sorts, and switches the `PROXY`
   group to the winner.

Two things worth knowing before trusting the results:

- A completed TCP handshake proves the port is open, not that the protocol
  works. Step 4 is what separates "reachable" from "usable".
- Candidate lists go stale within days. Re-run `refresh.mjs` rather than
  trusting a saved one; node lists and `config.yaml` are generated artifacts
  and are git-ignored on purpose.

## Testing

No automated suite, on purpose: both scripts are network tools against live
data that changes hourly, and a recorded fixture would prove nothing about the
next run. CI runs a syntax gate instead (`node --check` on both files) so a
broken push fails fast.

## Requirements

- Node.js 18+ (uses global `fetch` and `AbortSignal.timeout`; no npm packages)
- A running mihomo (Clash Meta) kernel for `rank.mjs`, API on
  `127.0.0.1:9099` or `MIHOMO_API`

## License

MIT — see [LICENSE](LICENSE).
