"use client";

// The team engine. Eight employees, each owning a territory on the sphere.
// Every action they take grows a new node out of their web and files a line
// into their memory, so the globe literally IS the company's brain: junction
// size is earned per connection, filament arcs trace old context, signals
// course the wires. Demo activity keeps it alive; real actions arrive via
// POST /api/action and land the same way, flagged in the feed. Drag spins it.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const TILT = 0.42;
const OMEGA = (Math.PI * 2) / 56; // one revolution ≈ 56s
const CREAM = "237,237,237";
const RED = "61, 124, 255";
const FLASH = "255,255,255";

type GNode = { x: number; y: number; z: number; deg: number; born: number; seed: number; emp: number };
type GEdge = { a: number; b: number; collab: boolean };
type Ghost = { x: number; y: number; z: number };
type Signal = { edge: number; start: number; dur: number };
type Pulse = { node: number; start: number };
type FeedItem = { who: string; what: string; at: number; real: boolean };
type RosterRow = { name: string; role: string; count: number; last: string | null };

const TEAM = [
  { name: "Ava", role: "Design" },
  { name: "Marcus", role: "Backend" },
  { name: "Priya", role: "Growth" },
  { name: "Jonah", role: "Support" },
  { name: "Tessa", role: "Data" },
  { name: "Leo", role: "Mobile" },
  { name: "Nadia", role: "Ops" },
  { name: "Sam", role: "Sales" },
];

const DEEDS: Record<string, string[]> = {
  Design: ["shipped the onboarding redesign", "closed 4 review threads", "cut the empty-state flow", "handed off the new nav spec", "killed a dead pattern from the system"],
  Backend: ["merged the queue retry fix", "shipped billing webhooks", "cut p95 latency 34%", "rotated the API keys", "landed the migration, zero downtime"],
  Growth: ["launched the referral loop", "shipped 3 landing variants", "lifted signup conversion 11%", "closed the attribution gap", "sunset the losing experiment"],
  Support: ["cleared the escalation queue", "wrote the refunds runbook", "turned 6 tickets into one fix", "flagged a churn-risk account", "shipped 12 macro updates"],
  Data: ["backfilled the events table", "shipped the retention model", "caught a silent tracking break", "rebuilt the exec dashboard", "validated the pricing cohort"],
  Mobile: ["shipped 2.4.0 to both stores", "fixed the cold-start crash", "cut app size by 18MB", "landed offline sync", "closed the push-permission drop"],
  Ops: ["renewed SOC 2 evidence", "automated contractor onboarding", "cut tooling spend 22%", "shipped the incident template", "closed the Q3 vendor review"],
  Sales: ["closed the Meridian account", "booked 9 demos this week", "revived a dead enterprise deal", "shipped the new pricing deck", "moved 3 pilots to annual"],
};

const rand3 = () => Math.random() * 2 - 1;
const norm3 = (v: [number, number, number]): [number, number, number] => {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
};

// golden-spiral point i of k — territories land evenly over the whole sphere
function spiralPoint(i: number, k: number): [number, number, number] {
  const y = 1 - (2 * (i + 0.5)) / k;
  const r = Math.sqrt(Math.max(0, 1 - y * y));
  const phi = i * 2.399963;
  return norm3([r * Math.cos(phi), y, r * Math.sin(phi)]);
}

type EmpState = { center: [number, number, number]; bag: number[]; recent: number[]; memories: string[] };

export default function TeamGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>(TEAM.map((t) => ({ ...t, count: 0, last: null })));
  const [totals, setTotals] = useState({ actions: 0, memories: 0 });

  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<GEdge[]>([]);
  const ghostsRef = useRef<Ghost[]>([]);
  const empsRef = useRef<EmpState[]>([]);
  const signalsRef = useRef<Signal[]>([]);
  const pulsesRef = useRef<Pulse[]>([]);
  const cursorRef = useRef<number | null>(null); // null until first poll seeds it

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // ---- seed geometry ------------------------------------------------
    const now = performance.now();
    const nodes: GNode[] = [];
    const edges: GEdge[] = [];
    nodesRef.current = nodes;
    edgesRef.current = edges;

    const attach = (emp: number, born: number): number => {
      const E = empsRef.current[emp];
      const parent =
        Math.random() < 0.5 && E.recent.length > 0
          ? E.recent[E.recent.length - 1 - Math.floor(Math.random() * Math.min(30, E.recent.length))]
          : E.bag[Math.floor(Math.random() * E.bag.length)];
      const P = nodes[parent];
      const stem = 0.05 + Math.random() * 0.08;
      const [x, y, z] = norm3([P.x + rand3() * stem, P.y + rand3() * stem, P.z + rand3() * stem]);
      const idx = nodes.length;
      nodes.push({ x, y, z, deg: 1, born, seed: Math.random() * 7, emp });
      edges.push({ a: parent, b: idx, collab: false });
      P.deg++;
      E.bag.push(parent, idx);
      E.recent.push(idx);
      if (E.recent.length > 90) E.recent.splice(0, 45);
      // tissue: sometimes close a loop inside the territory
      if (Math.random() < 0.2 && E.bag.length > 4) {
        const other = E.bag[Math.floor(Math.random() * E.bag.length)];
        if (other !== idx && other !== parent) {
          edges.push({ a: other, b: idx, collab: false });
          nodes[other].deg++;
          nodes[idx].deg++;
        }
      }
      // collaboration: a red wire across to a teammate's web
      if (Math.random() < 0.08 && nodes.length > 40) {
        const other = Math.floor(Math.random() * nodes.length);
        if (nodes[other].emp !== emp) {
          edges.push({ a: other, b: idx, collab: true });
          nodes[other].deg++;
        }
      }
      return idx;
    };

    empsRef.current = TEAM.map((_, i) => {
      const center = spiralPoint(i, TEAM.length);
      const E: EmpState = { center, bag: [], recent: [], memories: [] };
      for (let r = 0; r < 5; r++) {
        const [x, y, z] = norm3([center[0] + rand3() * 0.24, center[1] + rand3() * 0.24, center[2] + rand3() * 0.24]);
        E.bag.push(nodes.length);
        E.recent.push(nodes.length);
        nodes.push({ x, y, z, deg: 1, born: now - 10_000, seed: Math.random() * 7, emp: i });
      }
      return E;
    });
    // pre-grow so the webs read as lived-in from frame one
    for (let i = 0; i < TEAM.length; i++) {
      const grow = 8 + Math.floor(Math.random() * 8);
      for (let g = 0; g < grow; g++) attach(i, now - 10_000);
    }

    // filament sky: dotted arcs of old context curving over the sphere
    const ghosts: Ghost[] = [];
    for (let arc = 0; arc < 26; arc++) {
      let p = norm3([rand3(), rand3(), rand3()]);
      const axis = norm3([rand3(), rand3(), rand3()]);
      const step = 0.02 + Math.random() * 0.02;
      const steps = 40 + Math.floor(Math.random() * 40);
      for (let s = 0; s < steps; s++) {
        const [ax, ay, az] = axis;
        const [px, py, pz] = p;
        const c = Math.cos(step);
        const sn = Math.sin(step);
        const dot = ax * px + ay * py + az * pz;
        p = norm3([
          px * c + (ay * pz - az * py) * sn + ax * dot * (1 - c),
          py * c + (az * px - ax * pz) * sn + ay * dot * (1 - c),
          pz * c + (ax * py - ay * px) * sn + az * dot * (1 - c),
        ]);
        ghosts.push({ x: p[0], y: p[1], z: p[2] });
      }
    }
    ghostsRef.current = ghosts;

    // ---- actions ------------------------------------------------------
    const spawn = (emp: number, what: string, real: boolean) => {
      const t = performance.now();
      const idx = attach(emp, t);
      pulsesRef.current.push({ node: idx, start: t });
      const E = empsRef.current[emp];
      E.memories.push(what);
      setFeed((prev) => [{ who: TEAM[emp].name, what, at: Date.now(), real }, ...prev].slice(0, 6));
      setRoster(TEAM.map((m, i) => ({ ...m, count: empsRef.current[i].memories.length, last: empsRef.current[i].memories.at(-1) ?? null })));
      setTotals({
        actions: nodes.length - TEAM.length * 5,
        memories: empsRef.current.reduce((a, e) => a + e.memories.length, 0),
      });
    };

    let demoTimer: ReturnType<typeof setTimeout>;
    const demo = () => {
      const emp = Math.floor(Math.random() * TEAM.length);
      const deeds = DEEDS[TEAM[emp].role];
      spawn(emp, deeds[Math.floor(Math.random() * deeds.length)], false);
      demoTimer = setTimeout(demo, 1400 + Math.random() * 2400);
    };
    demoTimer = setTimeout(demo, 900);

    const poll = setInterval(async () => {
      try {
        const since = cursorRef.current;
        const res = await fetch(`/api/action?since=${since ?? 0}`);
        const data = (await res.json()) as { actions: { id: number; who: string; what: string }[]; cursor: number };
        if (since === null) {
          cursorRef.current = data.cursor; // don't replay history on load
          return;
        }
        cursorRef.current = Math.max(since, data.cursor);
        for (const a of data.actions) {
          const emp = TEAM.findIndex((t) => a.who.toLowerCase().includes(t.name.toLowerCase()));
          spawn(emp >= 0 ? emp : Math.floor(Math.random() * TEAM.length), a.what, true);
        }
      } catch {
        // server gone mid-reload; next tick retries
      }
    }, 2500);

    // ---- render loop ----------------------------------------------------
    let theta = 0;
    let vel = 0;
    let dragging = false;
    let lastX = 0;
    let last = performance.now();
    let raf = 0;

    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      theta += dx * 0.005;
      vel = dx * 0.0007;
    };
    const onUp = () => (dragging = false);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(64, t - last);
      last = t;
      if (!dragging) theta += (OMEGA * dt) / 1000 + vel;
      vel *= 0.95;

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.36;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const cT = Math.cos(TILT);
      const sT = Math.sin(TILT);
      const proj = (p: { x: number; y: number; z: number }) => {
        const rx = p.x * ct + p.z * st;
        const rz = -p.x * st + p.z * ct;
        return { sx: cx + rx * R, sy: cy - (p.y * cT - rz * sT) * R, d: p.y * sT + rz * cT };
      };
      const depthA = (d: number) => 0.16 + 0.84 * (d + 1) / 2;

      // atmosphere
      const grad = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.35);
      grad.addColorStop(0, `rgba(${RED},0.05)`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // filament sky
      for (const gp of ghostsRef.current) {
        const q = proj(gp);
        ctx.fillStyle = `rgba(${CREAM},${(0.028 + 0.06 * (q.d + 1) / 2).toFixed(3)})`;
        ctx.fillRect(q.sx, q.sy, 1, 1);
      }

      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      // wires
      ctx.lineWidth = 1;
      for (const e of edges) {
        const a = proj(nodes[e.a]);
        const b = proj(nodes[e.b]);
        const alpha = depthA((a.d + b.d) / 2) * (e.collab ? 0.34 : 0.16);
        ctx.strokeStyle = e.collab ? `rgba(${RED},${alpha.toFixed(3)})` : `rgba(${CREAM},${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();
      }

      // signals coursing the wires
      if (Math.random() < 0.07 && edges.length > 0) {
        signalsRef.current.push({ edge: Math.floor(Math.random() * edges.length), start: t, dur: 900 + Math.random() * 700 });
      }
      signalsRef.current = signalsRef.current.filter((s) => t - s.start < s.dur);
      for (const s of signalsRef.current) {
        const e = edges[s.edge];
        if (!e) continue;
        const k = (t - s.start) / s.dur;
        const a = proj(nodes[e.a]);
        const b = proj(nodes[e.b]);
        const d = a.d + (b.d - a.d) * k;
        ctx.fillStyle = `rgba(${RED},${(depthA(d) * 0.9).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(a.sx + (b.sx - a.sx) * k, a.sy + (b.sy - a.sy) * k, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // nodes — size is earned, never assigned
      for (const n of nodes) {
        const q = proj(n);
        const age = t - n.born;
        const grow = age < 500 ? 1 - Math.pow(1 - age / 500, 3) : 1;
        const breathe = 1 + 0.08 * Math.sin(t / 650 + n.seed);
        const r = (1.0 + Math.sqrt(n.deg) * 0.85) * grow * breathe * (0.55 + 0.45 * (q.d + 1) / 2);
        const flash = age < 900 ? 1 - age / 900 : 0;
        const alpha = depthA(q.d) * (0.5 + 0.5 * flash);
        ctx.fillStyle = flash > 0.55 ? `rgba(${FLASH},${alpha.toFixed(3)})` : flash > 0 ? `rgba(${RED},${alpha.toFixed(3)})` : `rgba(${CREAM},${(alpha * 0.85).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, Math.max(0.4, r), 0, Math.PI * 2);
        ctx.fill();
      }

      // action pulses: a ring blooms where the node grew in
      pulsesRef.current = pulsesRef.current.filter((p) => t - p.start < 1000);
      for (const p of pulsesRef.current) {
        const q = proj(nodes[p.node]);
        // rAF timestamps can lag performance.now() (background tabs, headless
        // virtual time), which would make the ring radius negative and throw
        const k = Math.min(1, Math.max(0, (t - p.start) / 1000));
        ctx.strokeStyle = `rgba(${RED},${((1 - k) * 0.55 * depthA(q.d)).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, 4 + k * 42, 0, Math.PI * 2);
        ctx.stroke();
      }

      // name tags ride each territory as it faces front
      ctx.font = "10px var(--font-geist-mono), ui-monospace, monospace";
      ctx.textBaseline = "middle";
      for (let i = 0; i < TEAM.length; i++) {
        const c = empsRef.current[i].center;
        const q = proj({ x: c[0] * 1.12, y: c[1] * 1.12, z: c[2] * 1.12 });
        if (q.d < 0.3) continue;
        const a = ((q.d - 0.3) / 0.7) * 0.85;
        ctx.fillStyle = `rgba(${RED},${a.toFixed(3)})`;
        ctx.fillRect(q.sx - 12, q.sy - 0.5, 6, 1);
        ctx.fillStyle = `rgba(${CREAM},${a.toFixed(3)})`;
        ctx.fillText(TEAM[i].name.toUpperCase(), q.sx - 2, q.sy);
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(demoTimer);
      clearInterval(poll);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-canvas text-fg">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab active:cursor-grabbing" />

      <header className="pointer-events-none absolute left-6 top-6 z-10">
        <Link href="/" className="pointer-events-auto font-mono text-[11px] tracking-[0.2em] text-fg-dim transition-colors hover:text-fg">
          ← ORCHESTRA
        </Link>
        <h1 className="mt-3 font-mono text-2xl tracking-[0.3em]">TEAM ENGINE</h1>
        <p className="mt-1 max-w-[34ch] font-mono text-[11px] leading-relaxed text-fg-dim">
          One light per action. Every employee grows a brain the company keeps.
        </p>
      </header>

      <div className="pointer-events-none absolute right-6 top-6 z-10 text-right font-mono text-[11px] text-fg-dim">
        <div>
          TEAM <span className="text-fg">{TEAM.length}</span>
        </div>
        <div>
          ACTIONS <span className="text-fg">{totals.actions}</span>
        </div>
        <div>
          MEMORIES <span className="text-accent">{totals.memories}</span>
        </div>
      </div>

      <aside className="pointer-events-none absolute bottom-24 right-6 z-10 hidden w-80 md:block">
        <ul className="space-y-2.5 border-l border-hairline pl-4">
          {roster.map((r) => (
            <li key={r.name} className="font-mono text-[13px]">
              <span className="text-fg">{r.name.toUpperCase()}</span>
              <span className="text-fg-dim"> · {r.role}</span>
              <span className="text-accent"> · {r.count}</span>
              <div className="truncate text-fg-dim opacity-70">{r.last ?? "waking up…"}</div>
            </li>
          ))}
        </ul>
      </aside>

      <div className="pointer-events-none absolute bottom-6 left-6 z-10 max-w-[46ch]">
        <ul className="space-y-1.5">
          {feed.map((f, i) => (
            <li key={`${f.at}-${i}`} className="truncate font-mono text-[12.5px] text-fg-dim" style={{ opacity: 1 - i * 0.14 }}>
              {f.real && <span className="mr-1.5 border border-accent px-1 text-[9px] text-accent">API</span>}
              <span className="text-fg">{f.who.toUpperCase()}</span> {f.what}
            </li>
          ))}
        </ul>
      </div>

      <div className="pointer-events-none absolute bottom-6 right-6 z-10 hidden font-mono text-[10px] text-fg-dim opacity-60 lg:block">
        curl -X POST localhost:3001/api/action -d {'\'{"who":"Ava","what":"shipped dark mode"}\''}
      </div>
    </div>
  );
}
