# Where to run the hub

Switchboard is a **stateful long-running process**: in-memory leases (§12), a
WebSocket board feed, a sweep timer, and slow-path work that runs after a response
is sent. Every hosting decision comes down to whether the platform allows that.

## The short answer

**Run the hub on a laptop and put a Cloudflare Tunnel in front of it.** Zero
architecture compromise, two minutes of setup, and it removes the networking risk
§15 rates highest.

```bash
brew install cloudflared
npm start        # terminal 1
./tunnel.sh      # terminal 2  -> prints a public https URL
```

## Comparison

| | Laptop + tunnel | Container host (Fly / Render / Railway) | Vercel |
| --- | --- | --- | --- |
| Fast path latency | **~8ms** | ~8ms | 40–150ms |
| In-memory leases (§12) | ✅ | ✅ | ❌ needs Redis |
| Board WebSocket | ✅ | ✅ | ❌ SSE/polling only |
| Sweep timer | ✅ | ✅ | ❌ per-request only |
| Slow path reliability | ✅ | ✅ | ⚠️ needs `waitUntil` |
| Contract derivation (§8 T2) | ✅ automatic | ❌ push manually | ❌ push manually |
| Survives your laptop sleeping | ❌ | ✅ | ✅ |
| Setup time | **2 min** | ~10 min | ~15 min + Redis |
| Reachable off-LAN | ✅ | ✅ | ✅ |

Contract derivation deserves emphasis: the hub derives the contract registry by
**reading the demo repo's files**. A laptop hub can. Any deployed hub cannot — it
has no access to anyone's filesystem — so §8 Tier 2 contract drift, which §8 calls
"the most defensible thing you build," requires an extra manual step:

```bash
npm run derive-contracts -- /path/to/demo-repo <hub-url>
```

---

## Option 1 — Laptop + Cloudflare Tunnel (recommended)

**Why:** keeps every §12 property, needs no store, and the code path is the one
covered by `npm test` / `verify.sh` / `l1-verify.sh`.

```bash
brew install cloudflared
npm start
./tunnel.sh
```

Anonymous quick tunnels are rate-limited per IP by Cloudflare (HTTP 429 /
error 1015), and it tends to bite at the worst moment. Set up a free named tunnel
once and it stops:

```bash
cloudflared tunnel login
cloudflared tunnel create switchboard
export SB_TUNNEL_NAME=switchboard
./tunnel.sh
```

**Caveat:** if that laptop sleeps or leaves the room, the hub is gone. Whoever
hosts should be plugged in with sleep disabled and should not be the person
demoing.

### Alternative: skip the public internet entirely

`tailscale` puts all four laptops on a private mesh, so the hub is reachable by a
stable address with no public exposure — which also resolves the "no auth on a
public URL" problem rather than documenting it.

```bash
brew install tailscale     # each laptop, then: tailscale up
export SB_HUB=<hub's tailscale IP>
```

---

## Option 2 — Container host

**Why:** survives laptop sleep, still a single long-running process, still
in-memory state. This is the right answer if the hub must outlive the session.

A `Dockerfile`, `fly.toml`, and `render.yaml` are all in the repo.

### Fly.io

```bash
brew install flyctl
fly launch --no-deploy      # keep the app name in fly.toml, or update it
fly secrets set ANTHROPIC_API_KEY=sk-...    # optional
fly deploy
```

### Render

Push the repo, then dashboard → New → Blueprint → select it. `render.yaml` does
the rest.

### Railway

Detects the `Dockerfile` automatically. Set `HOST=0.0.0.0` and leave `PORT` to
Railway.

> **Keep it to ONE instance.** `render.yaml` pins `numInstances: 1` and `fly.toml`
> pins `min_machines_running = 1` with autostop off. Two instances hold two
> separate lease tables and will each grant the same file to a different person —
> precisely the failure the product prevents. Scaling past one requires the Redis
> store in `src/store.ts`.

After deploying:

```bash
export SB_HUB_URL=https://your-hub.fly.dev
./client/install.sh /path/to/demo-repo
npm run derive-contracts -- /path/to/demo-repo https://your-hub.fly.dev
```

---

## Option 3 — Vercel

Supported, and the least good fit. Requires Upstash Redis or Vercel KV, loses the
WebSocket, slows the fast path by 5–20×, and its lock fails open under contention
so a double-grant is possible. Details in [README](./README.md#deploy-to-vercel).

Choose it only if you are already deploying everything else there and want one
platform.

---

## Security, on any public URL

§12 specifies no auth, which is correct for a LAN. On a public URL — tunnel or
deployed — anyone with the link can read the board, including every teammate's
prompts and recorded intents, and can claim tasks, release leases, or reset state.

Cheapest fixes, in order:

1. **Tailscale instead of a public tunnel** — no public surface at all.
2. **A shared secret header** checked in the middleware in `src/app.ts`, with
   `SB_SECRET` exported alongside `SB_HUB_URL` and sent by the client hooks.
3. **Accept it** for a two-hour demo, and don't put anything real through it.
