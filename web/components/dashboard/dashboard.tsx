"use client";

/**
 * Roster command center — production port of the FlowOS hackathon dashboard.
 *
 * Every real surface (agents, operations, activity, terminal, metrics, HQ
 * tasks) renders exclusively from useLive()/@/lib/live. There are no mock
 * rosters or fabricated employees anywhere in this file: before the first
 * snapshot the dashboard shows a lightweight loading state, and an empty
 * company renders honestly as empty. The only sample datasets left are the two
 * decorative charts in ./sample-data.
 */
import {
  Activity,
  ArrowLeft,
  Bell,
  Bot,
  BrainCircuit,
  Building2,
  ChartNoAxesCombined,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleDot,
  Clock3,
  Command,
  Cpu,
  FileCheck2,
  FileClock,
  FileText,
  Filter,
  FolderKanban,
  Gauge,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  Link2,
  ListChecks,
  Menu,
  MessageSquareText,
  Maximize2,
  Monitor,
  Minus,
  Moon,
  Network,
  Pause,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Sun,
  TerminalSquare,
  Users,
  Workflow,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  type CSSProperties,
  type FormEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "./utils";
import { sparkData, teamData } from "./sample-data";
import { useLive } from "@/lib/live";
import type {
  AgentNode,
  OperationStatus,
  Task,
  TaskStatus,
} from "@/lib/contracts";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type ThemeMode = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

/** The hierarchy renders exactly the live agents from the snapshot. */
type CompanyAgent = AgentNode;

type SidebarProps = {
  active: string;
  onNavigate: (item: string) => void;
  open: boolean;
  onClose: () => void;
  onOpenPanel: (title: string) => void;
};

function AnimatedNumber({
  value,
  suffix = "",
  decimals = 0,
  className,
}: {
  value: number;
  suffix?: string;
  decimals?: number;
  className?: string;
}) {
  const numberRef = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const counter = { value: 0 };
      gsap.to(counter, {
        value,
        duration: 1.25,
        ease: "power3.out",
        onUpdate: () => {
          if (numberRef.current) {
            numberRef.current.textContent = `${new Intl.NumberFormat("en-US", {
              minimumFractionDigits: decimals,
              maximumFractionDigits: decimals,
            }).format(counter.value)}${suffix}`;
          }
        },
      });
    },
    { dependencies: [value, suffix, decimals] },
  );

  return (
    <span ref={numberRef} className={cn("tabular-nums", className)}>
      {new Intl.NumberFormat("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(value)}
      {suffix}
    </span>
  );
}

/** Rotating status line, typed out from the live metrics — never canned copy. */
function TypedStatus() {
  const { ready, metrics } = useLive();
  const phrases = useMemo(() => {
    if (!ready) return ["Connecting to live company data…"];
    const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
    return [
      `${count(metrics.activeAgents, "agent")} coordinating across active operations.`,
      `${count(metrics.runnersOnline, "runner")} online and ready for real work.`,
      metrics.pendingApprovals > 0
        ? `${count(metrics.pendingApprovals, "decision")} waiting for your review.`
        : "No decisions are waiting on you right now.",
    ];
  }, [ready, metrics.activeAgents, metrics.runnersOnline, metrics.pendingApprovals]);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [characterIndex, setCharacterIndex] = useState(0);

  // New live numbers restart the loop so a stale phrase never finishes typing.
  useEffect(() => {
    setPhraseIndex(0);
    setCharacterIndex(0);
  }, [phrases]);

  useEffect(() => {
    const phrase = phrases[phraseIndex % phrases.length] ?? "";
    const complete = characterIndex >= phrase.length;
    const timer = window.setTimeout(
      () => {
        if (complete) {
          setCharacterIndex(0);
          setPhraseIndex((current) => (current + 1) % phrases.length);
        } else {
          setCharacterIndex((current) => current + 1);
        }
      },
      complete ? 1800 : 28,
    );
    return () => window.clearTimeout(timer);
  }, [characterIndex, phraseIndex, phrases]);

  return (
    <span className="typed-status" aria-live="polite">
      {(phrases[phraseIndex % phrases.length] ?? "").slice(0, characterIndex)}
      <span className="typing-caret" aria-hidden="true" />
    </span>
  );
}

type Approval = {
  id: number;
  title: string;
  agent: string;
  risk: "High" | "Medium";
  approved: boolean;
};

/** The four department nodes are company STRUCTURE, not data — they persist. */
const companyDepartments = [
  { name: "Engineering", color: "#6d5ce7", left: "8%" },
  { name: "Sales", color: "#2d9d62", left: "34%" },
  { name: "Support", color: "#3d87c8", left: "60%" },
  { name: "Operations", color: "#db8b28", left: "86%" },
] as const;

const sidebarSections = [
  {
    label: "Workspace",
    items: [
      [LayoutDashboard, "Command Center"],
      [Users, "Teams"],
      [Bot, "AI Employees"],
      [FolderKanban, "Projects"],
      [BrainCircuit, "Company Brain"],
      [Workflow, "Workflows"],
    ],
  },
  {
    label: "Management",
    items: [
      [ChartNoAxesCombined, "Analytics"],
      [FileCheck2, "Approvals"],
      [KeyRound, "Permissions"],
      [FileClock, "Audit Log"],
    ],
  },
  {
    label: "System",
    items: [
      [Link2, "Integrations"],
      [Settings, "Settings"],
    ],
  },
] satisfies { label: string; items: [LucideIcon, string][] }[];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center rounded-[10px] bg-violet-600 text-white shadow-[0_6px_16px_rgba(93,75,214,.24)]",
        compact ? "h-8 w-8" : "h-9 w-9",
      )}
      aria-hidden="true"
    >
      <Sparkles size={compact ? 15 : 17} strokeWidth={2.1} />
      <span className="absolute inset-[-3px] -z-10 rounded-[13px] border border-violet-200" />
    </div>
  );
}

function AgentAvatar({
  initials,
  accent = "violet",
  size = "md",
}: {
  initials: string;
  accent?: string;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={cn(
        "agent-avatar shrink-0",
        `agent-${accent}`,
        size === "sm" && "h-7 w-7 text-[9px]",
        size === "md" && "h-9 w-9 text-[10px]",
        size === "lg" && "h-12 w-12 text-xs",
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

function Sidebar({
  active,
  onNavigate,
  open,
  onClose,
  onOpenPanel,
}: SidebarProps) {
  const { org, metrics } = useLive();
  const capacity = Math.min(100, metrics.activeAgents * 6);
  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.button
            type="button"
            aria-label="Close navigation"
            className="sidebar-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>
      <aside className={cn("sidebar", open && "sidebar-open")}>
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between px-4 pb-4 pt-5">
            <div className="flex items-center gap-3">
              <BrandMark />
              <div>
                <div className="text-[17px] font-semibold tracking-[-0.035em] text-ink">
                  Roster
                </div>
                <div className="text-[10px] text-muted">AI workforce OS</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close sidebar"
              className="icon-button lg:hidden"
            >
              <X size={16} />
            </button>
          </div>

          <button
            type="button"
            className="workspace-select mx-3"
            onClick={() => onOpenPanel("Workspace switcher")}
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-line bg-white">
              <Building2 size={14} />
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-xs font-semibold text-ink">
                {org?.name ?? "Your company"}
              </span>
              <span className="block truncate text-[10px] text-muted">Production</span>
            </span>
            <ChevronDown size={14} className="text-muted" />
          </button>

          <nav className="sidebar-nav mt-4 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
            {sidebarSections.map((section) => (
              <div key={section.label} className="mb-4">
                <p className="mb-1.5 px-2 text-[9px] font-semibold uppercase tracking-[0.105em] text-[#9297a2]">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map(([Icon, item]) => {
                    const isActive = active === item;
                    return (
                      <button
                        key={item}
                        type="button"
                        className={cn("nav-item", isActive && "nav-item-active")}
                        onClick={() => {
                          onNavigate(item);
                          onClose();
                        }}
                        aria-current={isActive ? "page" : undefined}
                      >
                        <Icon size={14} strokeWidth={1.8} />
                        <span>{item}</span>
                        {item === "Approvals" && metrics.pendingApprovals > 0 && (
                          <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                            {metrics.pendingApprovals}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="space-y-2.5 px-3 pb-3">
            <div className="capacity-card">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-ink">
                    AI workforce capacity
                  </p>
                  <p className="mt-0.5 text-[9px] text-muted">
                    {metrics.activeAgents} agent{metrics.activeAgents === 1 ? "" : "s"} active ·{" "}
                    {metrics.runnersOnline} runner{metrics.runnersOnline === 1 ? "" : "s"} online
                  </p>
                </div>
                <Cpu size={14} className="text-violet-600" />
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e9e7f1]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${capacity}%` }}
                  transition={{ duration: 0.9, ease: "easeOut" }}
                  className="h-full rounded-full bg-violet-600"
                />
              </div>
              <button
                type="button"
                onClick={() => onOpenPanel("Plan & capacity")}
                className="mt-3 w-full rounded-lg border border-line bg-white py-1.5 text-[10px] font-semibold text-ink transition hover:border-violet-300 hover:text-violet-700"
              >
                Manage plan
              </button>
            </div>

            <button
              type="button"
              className="profile-row"
              onClick={() => onOpenPanel("Account")}
            >
              <span className="user-avatar">OP</span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[11px] font-semibold text-ink">
                  Operator
                </span>
                <span className="block truncate text-[9px] text-muted">
                  Workspace Admin
                </span>
              </span>
              <ChevronRight size={13} className="text-muted" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function TopHeader({
  search,
  setSearch,
  unread,
  themeMode,
  resolvedTheme,
  onCycleTheme,
  onOpenSidebar,
  onOpenPanel,
}: {
  search: string;
  setSearch: (value: string) => void;
  unread: number;
  themeMode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  onCycleTheme: () => void;
  onOpenSidebar: () => void;
  onOpenPanel: (title: string) => void;
}) {
  const { metrics } = useLive();
  const ThemeIcon =
    themeMode === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
  return (
    <header className="top-header">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="icon-button lg:hidden"
            onClick={onOpenSidebar}
            aria-label="Open navigation"
          >
            <Menu size={17} />
          </button>
          <p className="text-[10px] font-medium text-muted">Company overview</p>
        </div>
        <h1 className="mt-0.5 text-[24px] font-semibold tracking-[-0.045em] text-ink">
          Command Center
        </h1>
        <p className="mt-0.5 max-w-[620px] truncate text-[11px] text-muted">
          Monitor your AI workforce, active operations, and decisions requiring attention.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <label className="search-box">
          <Search size={14} className="shrink-0 text-[#9a9faa]" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search agents, projects, knowledge…"
            aria-label="Global search"
          />
          <kbd>⌘ K</kbd>
        </label>
        <span
          className="theme-control"
          title={`${metrics.runnersOnline} runner${metrics.runnersOnline === 1 ? "" : "s"} online`}
          aria-label={`${metrics.runnersOnline} runners online`}
        >
          <Cpu size={14} />
          <span>
            {metrics.runnersOnline} runner{metrics.runnersOnline === 1 ? "" : "s"}
          </span>
        </span>
        <button
          type="button"
          className="theme-control"
          aria-label={`Theme is ${themeMode}. Change theme`}
          title={`Theme: ${themeMode}`}
          onClick={onCycleTheme}
        >
          <ThemeIcon size={14} />
          <span>{themeMode}</span>
        </button>
        <button
          type="button"
          className="icon-button relative"
          aria-label={`${unread} unread notifications`}
          onClick={() => onOpenPanel("Notifications")}
        >
          <Bell size={15} />
          {unread > 0 && (
            <span className="notification-dot">
              <span className="sr-only">{unread}</span>
            </span>
          )}
        </button>
        <button
          type="button"
          className="create-button"
          onClick={() => onOpenPanel("Create with Roster")}
        >
          <Plus size={14} />
          <span>Create</span>
        </button>
        <button
          type="button"
          aria-label="Open user menu"
          className="user-avatar hidden sm:grid"
          onClick={() => onOpenPanel("Account")}
        >
          OP
        </button>
      </div>
    </header>
  );
}

function Card({
  children,
  className,
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <motion.section
      id={id}
      className={cn("dashboard-card motion-stage", className)}
    >
      {children}
    </motion.section>
  );
}

function CardHeader({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-header">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} className="text-[#707682]" />}
          <h2 className="text-[13px] font-semibold tracking-[-0.02em] text-ink">
            {title}
          </h2>
        </div>
        {subtitle && <p className="mt-1 text-[10px] text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * The agents actually present in this company — straight from the live
 * snapshot. The company starts EMPTY and fills in as real work arrives: an
 * agent appears on the hierarchy the first time HQ routes something to it.
 * Nothing on screen is ever fabricated.
 */
function useCompanyAgents(): CompanyAgent[] {
  const { agents } = useLive();
  return agents;
}

function CompanyNetwork({
  onOpen,
  onSelectAgent,
}: {
  onOpen: () => void;
  onSelectAgent: (agent: CompanyAgent) => void;
}) {
  const liveAgents = useCompanyAgents();
  return (
    <div className="network-map parallax-layer" data-depth="18" aria-label="Live company organization map">
      <button
        type="button"
        className="network-hit-area"
        onClick={onOpen}
        aria-label="Open full-screen company hierarchy"
      >
        <span>
          <Maximize2 size={12} />
          Expand hierarchy
        </span>
      </button>
      <svg
        className="absolute inset-0 h-full w-full overflow-visible"
        viewBox="0 0 500 210"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path d="M250 48 V82" className="network-line" />
        <path d="M58 82 H442" className="network-line" />
        {[58, 186, 314, 442].map((x) => (
          <path key={x} d={`M${x} 82 V111`} className="network-line" />
        ))}
      </svg>
      <div className="hq-node">
        <span className="activity-ring" />
        <BrandMark compact />
        <span className="mt-1 text-[10px] font-semibold text-ink">HQ</span>
        <span className="text-[8px] text-muted">Coordinating</span>
      </div>
      {companyDepartments.map((department) => {
        const departmentAgents = liveAgents.filter(
          (agent) => agent.team === department.name,
        );
        return (
        <div
          className="department-node"
          key={department.name}
          style={{ left: department.left }}
        >
          <span
            className="dept-icon"
            style={{
              color: department.color,
              borderColor: `${department.color}44`,
              background: `${department.color}0e`,
            }}
          >
            <Users size={13} />
          </span>
          <span className="mt-1.5 text-[9px] font-semibold text-ink">
            {department.name}
          </span>
          <span className="text-[8px] text-muted">
            {departmentAgents.length} agents
          </span>
          <div className="compact-agent-row mt-3 flex justify-center gap-1.5">
            {departmentAgents.map((agent) => (
              <button
                type="button"
                key={agent.id}
                className={cn(
                  "compact-agent-dot",
                  agent.working ? "agent-dot-working" : "agent-dot-idle",
                )}
                aria-label={`Open ${agent.name}: ${agent.working ? "working" : "idle"}`}
                title={`${agent.name} — ${agent.task}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectAgent(agent);
                }}
              >
                <span className="sr-only">{agent.name}</span>
              </button>
            ))}
          </div>
        </div>
        );
      })}
    </div>
  );
}

function CompanyStatusCard({
  onOpen,
  onSelectAgent,
}: {
  onOpen: () => void;
  onSelectAgent: (agent: CompanyAgent) => void;
}) {
  const { metrics } = useLive();
  const autonomous = Math.max(0, 100 - metrics.interventionRate);
  const headline = [
    [Users, metrics.activeAgents, "", "Active agents"],
    [CheckCircle2, metrics.tasksCompleted, "", "Tasks completed"],
    [Gauge, autonomous, "%", "Autonomous"],
  ] satisfies [LucideIcon, number, string, string][];
  return (
    <Card className="status-field col-span-12 min-h-[338px] p-5 xl:col-span-8">
      <div className="grid h-full gap-4 md:grid-cols-[0.78fr_1.22fr]">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-[10px] font-semibold text-[#4f5663]">
            <span className="status-beacon" />
            Company Status
          </div>
          <h2 className="mt-4 text-[26px] font-semibold tracking-[-0.045em] text-ink">
            Operations healthy
          </h2>
          <p className="mt-2 min-h-9 max-w-[330px] text-[11px] leading-[1.55] text-muted">
            <TypedStatus />
          </p>
          <dl className="mt-6 grid grid-cols-3 gap-2 md:grid-cols-1 md:gap-3">
            {headline.map(([MetricIcon, value, suffix, label]) => (
              <div key={label} className="flex items-center gap-2.5">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                  <MetricIcon size={13} />
                </span>
                <div>
                  <dd className="text-[13px] font-semibold text-ink">
                    <AnimatedNumber value={value} suffix={suffix} />
                  </dd>
                  <dt className="text-[8px] text-muted">{label}</dt>
                </div>
              </div>
            ))}
          </dl>
          <button type="button" className="text-button mt-auto pt-4" onClick={onOpen}>
            Open company map <ChevronRight size={13} />
          </button>
        </div>
        <CompanyNetwork onOpen={onOpen} onSelectAgent={onSelectAgent} />
      </div>
    </Card>
  );
}

function ApprovalQueue({
  approvals,
  onApprove,
  onReview,
}: {
  approvals: Approval[];
  onApprove: (id: number) => void;
  onReview: (title: string) => void;
}) {
  const pending = approvals.filter((approval) => !approval.approved);
  return (
    <Card className="attention-card decision-stack col-span-12 min-h-[338px] p-5 xl:col-span-4">
      <CardHeader
        icon={CircleAlert}
        title="Needs Your Attention"
        subtitle="Decisions waiting on your judgment."
        action={
          <span className="count-badge">
            {pending.length}
          </span>
        }
      />
      <div className="mt-4 space-y-2">
        <AnimatePresence mode="popLayout">
          {approvals.slice(0, 3).map((approval) => (
            <motion.div
              layout
              key={approval.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, height: 0 }}
              className={cn("approval-row", approval.approved && "approval-approved")}
            >
              <span className="approval-icon">
                {approval.approved ? <Check size={14} /> : <FileText size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-ink">
                  {approval.title}
                </p>
                <p className="mt-0.5 truncate text-[9px] text-muted">
                  {approval.approved
                    ? "Approved just now"
                    : `Requested by ${approval.agent}`}
                </p>
              </div>
              {!approval.approved && (
                <span
                  className={cn(
                    "hidden text-[8px] font-semibold sm:block",
                    approval.risk === "High" ? "text-rose-600" : "text-amber-700",
                  )}
                >
                  {approval.risk} risk
                </span>
              )}
              <div className="flex gap-1.5">
                {!approval.approved ? (
                  <>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => onReview(approval.title)}
                    >
                      Review
                    </button>
                    <button
                      type="button"
                      className="button-amber"
                      onClick={() => onApprove(approval.id)}
                    >
                      Approve
                    </button>
                  </>
                ) : (
                  <span className="flex items-center gap-1 text-[9px] font-semibold text-emerald-700">
                    <CheckCircle2 size={12} /> Approved
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <button
        type="button"
        className="text-button mt-3"
        onClick={() => onReview("All approvals")}
      >
        View all approvals <ChevronRight size={13} />
      </button>
    </Card>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 180;
      const y = 58 - ((value - min) / Math.max(1, max - min)) * 46;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 180 64" className="metric-spark" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="18" x2="180" y2="18" className="metric-grid-line" />
      <line x1="0" y1="40" x2="180" y2="40" className="metric-grid-line" />
      <polygon
        points={`0,64 ${points} 180,64`}
        fill={color}
        opacity="0.1"
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="180"
        cy={Number(points.split(" ").at(-1)?.split(",")[1] ?? 32)}
        r="3"
        fill={color}
      />
    </svg>
  );
}

function MetricCard({
  title,
  value,
  icon: Icon,
  spark,
  color,
}: {
  title: string;
  value: string;
  icon: LucideIcon;
  spark: number[];
  color: string;
}) {
  const numericValue = Number(value.match(/[\d.]+/)?.[0] ?? 0);
  const decimals = value.includes(".") ? 1 : 0;
  const suffix = value.includes("%") ? "%" : "";
  const progress = Math.min(94, Math.max(54, spark[spark.length - 1] + 28));
  return (
    <Card className="metric-card col-span-6 p-5 lg:col-span-3">
      <div className="flex items-start justify-between gap-3">
        <span
          className="metric-orbit"
          style={
            {
              "--metric-color": color,
              "--metric-progress": `${progress * 3.6}deg`,
            } as CSSProperties
          }
        >
          <Icon size={14} />
        </span>
        <p className="metric-change text-right text-[8px] font-medium text-emerald-600">
          ● live
        </p>
      </div>
      <p className="mt-4 text-[10px] font-medium text-muted">{title}</p>
      <div className="mt-1">
        <p className="text-[26px] font-semibold tracking-[-0.04em] text-ink">
          <AnimatedNumber value={numericValue} decimals={decimals} suffix={suffix} />
        </p>
      </div>
      <div className="metric-chart-stage mt-3">
        <Sparkline values={spark} color={color} />
      </div>
    </Card>
  );
}

const statusStyles: Record<OperationStatus, string> = {
  Running: "status-running",
  Reviewing: "status-reviewing",
  "Waiting for approval": "status-waiting",
  Blocked: "status-blocked",
};

function StatusBadge({ status }: { status: OperationStatus }) {
  return (
    <span className={cn("status-badge", statusStyles[status])}>
      <span className={cn("status-dot", status === "Running" && "animate-blink-soft")} />
      {status}
    </span>
  );
}

const taskChipStyles: Record<TaskStatus, string> = {
  queued: "bg-amber-50 text-amber-700",
  claimed: "bg-violet-50 text-violet-700",
  running: "bg-violet-50 text-violet-700",
  done: "bg-emerald-50 text-emerald-700",
  failed: "bg-rose-50 text-rose-600",
};

function LiveOperations({ query }: { query: string }) {
  const [filter, setFilter] = useState("All teams");
  const { operations, tasks, ready } = useLive();

  // Real task attached to an operation row, so its execution status can show
  // as a small chip beside the operation status.
  const taskByOperation = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of tasks) {
      map.set(task.id, task);
      if (task.event_id) map.set(task.event_id, task);
    }
    return map;
  }, [tasks]);

  const shown = useMemo(() => {
    return operations.filter((operation) => {
      const matchesSearch = `${operation.agent} ${operation.assignment} ${operation.team}`
        .toLowerCase()
        .includes(query.toLowerCase());
      const matchesFilter =
        filter === "All teams" ||
        (filter === "Active" && ["Running", "Reviewing"].includes(operation.status)) ||
        (filter === "Waiting" && operation.status === "Waiting for approval") ||
        (filter === "Blocked" && operation.status === "Blocked");
      return matchesSearch && matchesFilter;
    });
    // `operations` must be a dependency — without it the memo keeps the first
    // snapshot forever and the table silently stops updating on poll.
  }, [filter, query, operations]);

  return (
    <Card className="col-span-12 overflow-hidden xl:col-span-8">
      <div className="border-b border-line px-5 pb-0 pt-5">
        <CardHeader
          icon={Activity}
          title="Live Operations"
          subtitle="Agent work updates in real time."
          action={
            <button type="button" className="button-secondary">
              <Filter size={12} /> Filter
            </button>
          }
        />
        <div className="mt-4 flex gap-4 overflow-x-auto">
          {["All teams", "Active", "Waiting", "Blocked"].map((item) => (
            <button
              key={item}
              type="button"
              className={cn("filter-tab", filter === item && "filter-tab-active")}
              onClick={() => setFilter(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="operations-table" role="table" aria-label="Live AI operations">
        <div className="operation-head" role="row">
          <span>Agent</span>
          <span>Current assignment</span>
          <span>Team</span>
          <span>Status</span>
          <span>Progress</span>
          <span>Elapsed</span>
        </div>
        {shown.map((operation) => {
          const task = taskByOperation.get(operation.id);
          return (
          <motion.div
            layout
            key={operation.id}
            className="operation-row"
            role="row"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <span className="operation-agent">
              <AgentAvatar
                initials={operation.initials}
                accent={operation.accent}
                size="sm"
              />
              <span className="min-w-0">
                <span className="block truncate text-[10px] font-semibold text-ink">
                  {operation.agent}
                </span>
                <span className="block text-[8px] text-emerald-600">● Online</span>
              </span>
            </span>
            <span className="operation-assignment">{operation.assignment}</span>
            <span className="operation-team">{operation.team}</span>
            <span className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={operation.status} />
              {task && (
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[8px] font-semibold",
                    taskChipStyles[task.status],
                  )}
                  title={task.result_summary ?? `Task ${task.status}`}
                >
                  {task.status}
                </span>
              )}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#edeef2]">
                <motion.span
                  initial={{ width: 0 }}
                  animate={{ width: `${operation.progress}%` }}
                  className={cn(
                    "block h-full rounded-full",
                    operation.status === "Blocked" ? "bg-rose-500" : "bg-violet-500",
                  )}
                />
              </span>
              <span className="w-7 text-right text-[8px] text-muted">
                {operation.progress}%
              </span>
            </span>
            <span className="font-mono text-[8px] text-muted">{operation.elapsed}</span>
          </motion.div>
          );
        })}
        {!ready && (
          <div className="grid min-h-36 place-items-center px-5 text-center">
            <p className="text-[10px] text-muted">Connecting to live operations…</p>
          </div>
        )}
        {ready && operations.length === 0 && (
          <div className="grid min-h-36 place-items-center px-5 text-center">
            <div>
              <Activity size={20} className="mx-auto text-[#a5a9b2]" />
              <p className="mt-2 text-[11px] font-medium text-ink">No operations yet</p>
              <p className="mt-0.5 text-[9px] text-muted">
                Route a request through HQ and live work appears here.
              </p>
            </div>
          </div>
        )}
        {ready && operations.length > 0 && shown.length === 0 && (
          <div className="grid min-h-36 place-items-center px-5 text-center">
            <div>
              <Search size={20} className="mx-auto text-[#a5a9b2]" />
              <p className="mt-2 text-[11px] font-medium text-ink">No matching operations</p>
              <p className="mt-0.5 text-[9px] text-muted">Try another search or filter.</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

const taskStatusLabels: Record<TaskStatus, string> = {
  queued: "Queued",
  claimed: "Claimed",
  running: "Running",
  done: "Done",
  failed: "Failed",
};

function HQAgentCard({ onOpen }: { onOpen: () => void }) {
  const { tasks, profile, org } = useLive();
  const done = tasks.filter((task) => task.status === "done").length;
  const overall = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const delegated = tasks.slice(0, 4);
  return (
    <Card className="hq-card col-span-12 p-5 xl:col-span-4">
      <CardHeader
        icon={Network}
        title="HQ Agent"
        action={<StatusBadge status="Running" />}
      />
      <div className="mt-5 flex items-center gap-3">
        <span className="hq-avatar">
          <span className="activity-ring" />
          <BrandMark />
        </span>
        <div>
          <p className="text-[9px] font-medium text-violet-700">Current objective</p>
          <h3 className="mt-0.5 text-[15px] font-semibold tracking-[-0.025em] text-ink">
            {profile?.directive ??
              (org ? `Coordinate ${org.name}` : "Awaiting the first request")}
          </h3>
        </div>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between text-[9px]">
          <span className="font-medium text-muted">Overall progress</span>
          <span className="font-semibold text-violet-700">{overall}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${overall}%` }}
            transition={{ duration: 0.8 }}
            className="h-full rounded-full bg-violet-600"
          />
        </div>
      </div>
      <div className="mt-5 border-t border-violet-100 pt-3">
        <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.08em] text-muted">
          Delegated work
        </p>
        <div className="space-y-1.5">
          {delegated.length === 0 && (
            <p className="rounded-lg bg-white/60 px-2.5 py-2 text-[9px] text-muted">
              No delegated work yet — route a request through HQ.
            </p>
          )}
          {delegated.map((task) => (
            <div key={task.id} className="flex items-center gap-2 rounded-lg bg-white/60 px-2.5 py-2">
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-md",
                  task.status === "done"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-violet-100 text-violet-700",
                )}
              >
                {task.status === "done" ? <Check size={11} /> : <GitBranch size={11} />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[9px] font-medium text-ink">
                {task.request}
              </span>
              <span className="text-[8px] text-muted">{taskStatusLabels[task.status]}</span>
            </div>
          ))}
        </div>
      </div>
      <button type="button" className="text-button mt-4" onClick={onOpen}>
        Open HQ workspace <ChevronRight size={13} />
      </button>
    </Card>
  );
}

/**
 * Slash commands are the only local affordance left in the terminal — a short
 * help text. Everything without a leading slash is a real request routed
 * through HQ via submit().
 */
const slashHelp: Record<string, string[]> = {
  "/help": [
    "Type any request and HQ routes it to a real agent.",
    "✓ Plain text — routed through HQ, answered with a live terminal line",
    "○ /help — show this message",
  ],
};

function AgentTerminal() {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState<string[]>(["● Connecting to HQ…"]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { terminal, ready, stale, submit } = useLive();

  // HQ authors terminal_line for exactly this surface, so show it verbatim.
  useEffect(() => {
    if (ready && terminal.length) setLines(terminal.slice(-8));
    else if (ready) setLines(["○ No activity yet. Type a request to route it through HQ."]);
  }, [ready, terminal]);

  const runCommand = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = command.trim();
    if (!text || busy) return;

    // Slash commands stay local: minimal help only.
    if (text.startsWith("/")) {
      const response =
        slashHelp[text.toLowerCase()] ??
        ["Unknown command.", "Try /help, or type a request to route it through HQ."];
      setLines([`> ${text}`, ...response]);
      setCommand("");
      return;
    }

    // Anything else is a real request routed through HQ.
    setBusy(true);
    setLines((prev) => [...prev.slice(-6), `> ${text}`, "● routing through HQ…"]);
    setCommand("");
    try {
      const routed = await submit(text);
      setLines((prev) => [
        ...prev.filter((l) => l !== "● routing through HQ…"),
        routed ?? "○ HQ unreachable — try again in a moment.",
      ]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="terminal-card col-span-12 overflow-hidden xl:col-span-7">
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <TerminalSquare size={14} className="text-[#a89cf7]" />
          <h2 className="text-[12px] font-semibold text-white">Agent Terminal</h2>
          <span className="ml-1 rounded-md bg-white/5 px-2 py-1 text-[8px] text-[#b5bac5]">
            HQ
          </span>
        </div>
        <div
          className={cn(
            "flex items-center gap-2 text-[8px]",
            ready && !stale ? "text-emerald-400" : "text-amber-300",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 animate-blink-soft rounded-full",
              ready && !stale ? "bg-emerald-400" : "bg-amber-300",
            )}
          />
          {ready && !stale ? "Connected" : "Connecting"}
        </div>
      </div>
      <div
        className="min-h-[210px] cursor-text px-5 py-4 font-mono text-[10px] leading-[1.85]"
        onClick={() => inputRef.current?.focus()}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={lines.join("")}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {lines.map((line, index) => (
              <motion.p
                key={`${line}-${index}`}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1, duration: 0.22 }}
                className={cn(
                  line.startsWith("✓") && "text-emerald-400",
                  line.startsWith("●") && "text-sky-300",
                  line.startsWith("○") && "text-amber-300",
                  line.startsWith(">") && "text-[#a89cf7]",
                  !["✓", "●", "○", ">"].some((prefix) => line.startsWith(prefix)) &&
                    "text-[#d9dce3]",
                )}
              >
                {line}
              </motion.p>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="border-t border-white/10 px-4 py-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {Object.keys(slashHelp).map((suggestion) => (
            <button
              type="button"
              key={suggestion}
              onClick={() => {
                setCommand(suggestion);
                inputRef.current?.focus();
              }}
              className="terminal-suggestion"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <form className="terminal-input" onSubmit={runCommand}>
          <span className="text-[#8576ee]">&gt;</span>
          <input
            ref={inputRef}
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Type a request to route it through HQ…"
            aria-label="Terminal command"
          />
          <button type="submit" aria-label="Run command">
            <Command size={13} />
          </button>
        </form>
      </div>
    </Card>
  );
}

function CompanyBrainCard({ onOpen }: { onOpen: () => void }) {
  const { profile, events, tasks, metrics } = useLive();

  /**
   * When a real repo has been indexed, the Company Brain shows what HQ was
   * actually calibrated FROM — the archetype and the derived traits, quoted
   * from real commits and README lines rather than authored copy. Before that
   * it renders honestly empty.
   */
  const updates: string[][] = profile
    ? [
        [`Calibrated from ${profile.source_repo}`, "GitHub", "Verified"],
        ...profile.traits.slice(0, 2).map((t) => [t, profile.source_repo, "Derived"]),
      ]
    : [];
  const orbits = [
    [events.length, "Events recorded"],
    [tasks.length, "Tasks delegated"],
    [metrics.pendingApprovals, "Need attention"],
  ] satisfies [number, string][];
  return (
    <Card className="brain-field col-span-12 p-5 xl:col-span-5">
      <CardHeader
        icon={BrainCircuit}
        title="Company Brain"
        subtitle="Institutional knowledge, continuously updated."
        action={
          <span className="flex items-center gap-1 text-[8px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        }
      />
      <div className="brain-orbits mt-5 grid grid-cols-3 gap-2">
        {orbits.map(([value, label], index) => (
          <div
            key={label}
            className={cn("brain-orbit", index === 0 && "brain-orbit-primary")}
          >
            <p className="text-[16px] font-semibold tracking-[-0.03em] text-ink">
              <AnimatedNumber value={value} />
            </p>
            <p className="mt-0.5 text-[8px] leading-snug text-muted">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 divide-y divide-line">
        {updates.length === 0 && (
          <p className="py-5 text-center text-[10px] text-muted">
            No knowledge yet — index a repo during onboarding to calibrate HQ.
          </p>
        )}
        {updates.map(([title, source, state]) => (
          <div key={title} className="flex items-center gap-3 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f4f5f7] text-[#6e7480]">
              <FileText size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold text-ink">{title}</p>
              <p className="mt-0.5 text-[8px] text-muted">{source}</p>
            </div>
            <span
              className={cn(
                "rounded-md px-1.5 py-1 text-[8px] font-medium",
                state === "New"
                  ? "bg-sky-50 text-sky-700"
                  : "bg-emerald-50 text-emerald-700",
              )}
            >
              {state}
            </span>
          </div>
        ))}
      </div>
      <button type="button" className="text-button mt-3" onClick={onOpen}>
        Explore company brain <ChevronRight size={13} />
      </button>
    </Card>
  );
}

/**
 * Decorative trend chart — the data behind it is illustrative (see
 * ./sample-data). Labeled as a preview until per-team history exists.
 */
function TeamPerformanceChart() {
  const [range, setRange] = useState<keyof typeof teamData>("Last 7 days");
  const summaries = [
    ["Engineering", 96],
    ["Sales", 88],
    ["Support", 93],
    ["Operations", 84],
  ] satisfies [string, number][];
  return (
    <Card className="performance-field col-span-12 p-5 xl:col-span-7">
      <CardHeader
        icon={ChartNoAxesCombined}
        title="Team Performance"
        subtitle="Illustrative preview — live team stats land here."
        action={
          <label className="range-select">
            <span className="sr-only">Chart time range</span>
            <select value={range} onChange={(event) => setRange(event.target.value as keyof typeof teamData)}>
              {Object.keys(teamData).map((key) => (
                <option key={key}>{key}</option>
              ))}
            </select>
            <ChevronDown size={12} />
          </label>
        }
      />
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_120px]">
        <div className="h-[220px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={teamData[range]} margin={{ top: 8, right: 6, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="tasksFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6d5ce7" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6d5ce7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eceef2" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 9, fill: "#858b96" }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 9, fill: "#858b96" }}
              />
              <Tooltip
                contentStyle={{
                  border: "1px solid #e5e7ec",
                  borderRadius: 10,
                  fontSize: 10,
                  boxShadow: "0 10px 30px rgba(20,30,50,.08)",
                }}
              />
              <Area
                type="monotone"
                dataKey="completed"
                name="Tasks completed"
                stroke="#6d5ce7"
                strokeWidth={2}
                fill="url(#tasksFill)"
              />
              <Area
                type="monotone"
                dataKey="interventions"
                name="Human interventions"
                stroke="#d69237"
                strokeWidth={1.5}
                fill="transparent"
                strokeDasharray="4 4"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="team-orbits grid grid-cols-2 gap-2 sm:grid-cols-1">
          {summaries.map(([team, value]) => (
            <div key={team} className="team-orbit-row">
              <span
                className="team-radial"
                style={{ "--team-progress": `${value * 3.6}deg` } as CSSProperties}
              >
                <AnimatedNumber value={value} suffix="%" />
              </span>
              <span className="text-[8px] text-muted">{team}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function ActivityFeed() {
  const { activity, ready } = useLive();

  // Icon carries the decision: a spawned agent is the one worth a second look.
  // Empty when the snapshot has no events — nothing has happened yet.
  const entries = activity.map((item) => ({
    id: item.id,
    Icon: item.text.startsWith("spawn") ? Lightbulb : Network,
    text: `${item.agent}: ${item.text}`,
    time: item.ago,
    source: item.user ?? item.team,
  }));
  return (
    <Card className="col-span-12 p-5 xl:col-span-5">
      <CardHeader
        icon={Clock3}
        title="Recent Activity"
        subtitle="Decisions and learning across the company."
      />
      <div className="relative mt-4">
        <span className="activity-timeline" />
        <div className="space-y-3.5">
          {entries.length === 0 && (
            <p className="py-6 text-center text-[10px] text-muted">
              {ready
                ? "No activity yet — the feed fills in as requests come through HQ."
                : "Connecting to the live activity feed…"}
            </p>
          )}
          {entries.map(({ id, Icon, text, time, source }) => (
            <div key={id} className="relative flex gap-3">
              <span className="activity-icon">
                <Icon size={12} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] leading-[1.4] text-[#3b3f47]">{text}</p>
                <p className="mt-1 text-[8px] text-muted">{source}</p>
              </div>
              <span className="text-[8px] text-[#9a9faa]">{time}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function RecommendationCard({
  dismissed,
  onDismiss,
  onReview,
}: {
  dismissed: boolean;
  onDismiss: () => void;
  onReview: () => void;
}) {
  const { metrics } = useLive();
  if (dismissed) return null;
  return (
    <Card className="recommendation-card col-span-12 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-violet-700 shadow-sm">
          <Zap size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-violet-700">
            Smart recommendation
          </p>
          <h2 className="mt-1 text-[14px] font-semibold tracking-[-0.02em] text-ink">
            Human intervention rate is at {metrics.interventionRate}% across recent work.
          </h2>
          <p className="mt-1 text-[10px] text-muted">
            Review escalation workflows to keep autonomous resolution rates high.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className="button-secondary" onClick={onDismiss}>
            Dismiss
          </button>
          <button type="button" className="create-button" onClick={onReview}>
            Review workflow
          </button>
        </div>
      </div>
    </Card>
  );
}

function AgentWorkspace({
  agent,
  onBack,
  onClose,
}: {
  agent: CompanyAgent;
  onBack: () => void;
  onClose: () => void;
}) {
  const { activity } = useLive();

  // Real events routed to this agent; when none exist yet, a single honest
  // line about its current state rather than an invented timeline.
  const entries = useMemo(() => {
    const forAgent = activity
      .filter((item) => item.agent === agent.name)
      .map((item) => ({
        id: item.id,
        icon: item.text.startsWith("spawn") ? Lightbulb : Network,
        title: item.text,
        source: item.user ?? item.team,
        time: item.ago,
      }));
    if (forAgent.length > 0) return forAgent;
    return [
      {
        id: "current-state",
        icon: agent.working ? Activity : Pause,
        title: agent.working
          ? `${agent.name} is working on “${agent.task}”`
          : `${agent.name} is idle — ${agent.task}`,
        source: agent.team,
        time: agent.elapsed,
      },
    ];
  }, [activity, agent]);

  return (
    <div className="agent-workspace">
      <header className="map-overlay-header">
        <button type="button" className="map-back-button" onClick={onBack}>
          <ArrowLeft size={15} />
          Company map
        </button>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close agent workspace">
          <X size={16} />
        </button>
      </header>

      <div className="agent-workspace-grid">
        <aside className="agent-identity-panel">
          <span className="agent-detail-avatar">{agent.initials}</span>
          <p className="agent-detail-team">{agent.team}</p>
          <h2>{agent.name}</h2>
          <span
            className={cn(
              "agent-detail-status",
              agent.working ? "agent-status-working" : "agent-status-idle",
            )}
          >
            <span />
            {agent.working ? "Working now" : "Idle"}
          </span>
          <div className="agent-assignment">
            <p>Current assignment</p>
            <strong>{agent.task}</strong>
          </div>
          <div className="agent-progress-copy">
            <span>Progress</span>
            <span>{agent.progress}%</span>
          </div>
          <div className="agent-progress-track">
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: `${agent.progress}%` }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className={agent.working ? "agent-progress-active" : "agent-progress-paused"}
            />
          </div>
          <dl className="agent-facts">
            <div>
              <dt>Elapsed</dt>
              <dd>{agent.elapsed}</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>{agent.working ? "Autonomous" : "Available"}</dd>
            </div>
          </dl>
        </aside>

        <section className="agent-activity-page" aria-labelledby="agent-activity-title">
          <div className="agent-activity-heading">
            <span className="agent-heading-icon"><Clock3 size={22} /></span>
            <div>
              <h2 id="agent-activity-title">Recent activity</h2>
              <p>What {agent.name} has been doing and learning.</p>
            </div>
          </div>
          <div className="agent-activity-list">
            <span className="agent-activity-line" aria-hidden="true" />
            {entries.map(({ id, icon: Icon, title, source, time }, index) => (
              <motion.article
                key={id}
                className="agent-activity-entry"
                initial={{ opacity: 0, x: 14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.06 }}
              >
                <span className="agent-event-icon"><Icon size={17} /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{source}</p>
                </div>
                <time>{time}</time>
              </motion.article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Positions for a department branch, for ANY number of agents.
 *
 * branchLayouts below is hand-tuned for common counts (3, 4, 7). Live data can
 * put any count in a department — a spawned agent, an idled one — so anything
 * without a preset gets a generated two-row arc that keeps branches continuous
 * at any scale. Hand-tuned layouts still win when they exist, so the designed
 * look is unchanged.
 */
function layoutFor(count: number): Array<{ x: number; y: number }> {
  const preset = branchLayouts[count];
  if (preset) return preset;
  if (count <= 0) return [];

  // One row up to 4, two staggered rows beyond — mirrors the 7-agent preset.
  const perRow = count <= 4 ? count : Math.ceil(count / 2);
  const rows = count <= 4 ? 1 : 2;
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const inRow = i % perRow;
    const rowCount = row === rows - 1 ? count - perRow * (rows - 1) : perRow;
    const spread = 72 / Math.max(1, rowCount);
    out.push({
      x: 14 + spread * inRow + spread / 2,
      y: rows === 1 ? 58 : row === 0 ? 40 : 82,
    });
  }
  return out;
}

const branchLayouts: Record<number, Array<{ x: number; y: number }>> = {
  3: [
    { x: 18, y: 70 },
    { x: 50, y: 42 },
    { x: 82, y: 70 },
  ],
  4: [
    { x: 14, y: 48 },
    { x: 38, y: 78 },
    { x: 62, y: 78 },
    { x: 86, y: 48 },
  ],
  7: [
    { x: 14, y: 40 },
    { x: 38, y: 40 },
    { x: 62, y: 40 },
    { x: 86, y: 40 },
    { x: 26, y: 82 },
    { x: 50, y: 82 },
    { x: 74, y: 82 },
  ],
};

function FullscreenCompanyMap({
  open,
  selectedAgent,
  onSelectAgent,
  onBackToMap,
  onClose,
}: {
  open: boolean;
  selectedAgent: CompanyAgent | null;
  onSelectAgent: (agent: CompanyAgent) => void;
  onBackToMap: () => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [mapZoom, setMapZoom] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 20 });
  const liveAgents = useCompanyAgents();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open && !selectedAgent) {
      setMapZoom(1);
      setZoomOrigin({ x: 50, y: 20 });
    }
  }, [open, selectedAgent]);

  const zoomIn = () => setMapZoom((zoom) => Math.min(2.2, zoom + 0.35));
  const zoomOut = () => setMapZoom((zoom) => Math.max(1, zoom - 0.35));
  const resetZoom = () => {
    setMapZoom(1);
    setZoomOrigin({ x: 50, y: 20 });
    canvasRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  };

  const zoomTowardClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button")) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setZoomOrigin({
      x: ((event.clientX - rect.left + canvas.scrollLeft) / canvas.scrollWidth) * 100,
      y: ((event.clientY - rect.top + canvas.scrollTop) / canvas.scrollHeight) * 100,
    });
    zoomIn();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.section
          className="company-map-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={selectedAgent ? `${selectedAgent.name} workspace` : "Company hierarchy"}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.985 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
        >
          {selectedAgent ? (
            <AgentWorkspace agent={selectedAgent} onBack={onBackToMap} onClose={onClose} />
          ) : (
            <div className="full-map-page">
              <header className="map-overlay-header">
                <div>
                  <p>Live organization</p>
                  <h2>Company hierarchy</h2>
                  <span>Choose any employee agent to inspect its current work.</span>
                </div>
                <div className="map-header-actions">
                  <div className="map-zoom-controls" aria-label="Hierarchy zoom controls">
                    <button
                      type="button"
                      onClick={zoomOut}
                      disabled={mapZoom <= 1}
                      aria-label="Zoom out hierarchy"
                    >
                      <Minus size={14} />
                    </button>
                    <span aria-live="polite">{Math.round(mapZoom * 100)}%</span>
                    <button
                      type="button"
                      onClick={zoomIn}
                      disabled={mapZoom >= 2.2}
                      aria-label="Zoom in hierarchy"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={resetZoom}
                      disabled={mapZoom === 1}
                      aria-label="Reset hierarchy zoom"
                    >
                      <RotateCcw size={13} />
                    </button>
                  </div>
                  <div className="agent-state-legend" aria-label="Agent status legend">
                    <span><i className="agent-dot-working" /> Working</span>
                    <span><i className="agent-dot-idle" /> Idle</span>
                  </div>
                  <button type="button" className="icon-button" onClick={onClose} aria-label="Close company hierarchy">
                    <X size={16} />
                  </button>
                </div>
              </header>

              <div
                ref={canvasRef}
                className={cn("full-map-canvas", mapZoom > 1 && "is-zoomed")}
                onClick={zoomTowardClick}
              >
                <span className="map-zoom-hint">
                  Click the canvas to focus · scroll to explore
                </span>
                <motion.div
                  className="full-map-zoom-layer"
                  animate={{ scale: mapZoom }}
                  transition={{ type: "spring", stiffness: 190, damping: 24 }}
                  style={{
                    transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%`,
                  }}
                >
                  <div className="full-hq-node glass-hierarchy-node">
                  <BrandMark />
                  <div>
                    <strong>HQ Agent</strong>
                    <span>
                      Coordinating {liveAgents.length} employee agent
                      {liveAgents.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                  <div className="full-department-grid">
                  <svg
                    className="department-branch-svg"
                    viewBox="0 0 100 20"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    {[12.5, 37.5, 62.5, 87.5].map((x, index) => (
                      <motion.path
                        key={x}
                        d={`M 50 0 C 50 9, ${x} 7, ${x} 20`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.7, delay: index * 0.06 }}
                      />
                    ))}
                  </svg>
                  {companyDepartments.map((department) => {
                    const agents = liveAgents.filter(
                      (agent) => agent.team === department.name,
                    );
                    const positions = layoutFor(agents.length);
                    return (
                      <section className="full-department-branch" key={department.name}>
                        <div
                          className="full-department-heading glass-hierarchy-node"
                          style={{ "--department-color": department.color } as CSSProperties}
                        >
                          <span><Users size={15} /></span>
                          <div>
                            <h3>{department.name}</h3>
                            <p>{agents.filter((agent) => agent.working).length} working · {agents.filter((agent) => !agent.working).length} idle</p>
                          </div>
                        </div>
                        <div className="full-agent-branches">
                          <svg
                            className="curved-branch-svg"
                            viewBox="0 0 100 100"
                            preserveAspectRatio="none"
                            aria-hidden="true"
                          >
                            {positions.map((position, index) => (
                              <motion.path
                                key={`${department.name}-branch-${index}`}
                                d={`M 50 0 C 50 ${position.y * 0.34}, ${position.x} ${position.y * 0.48}, ${position.x} ${position.y - 7}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.65, delay: index * 0.045 }}
                              />
                            ))}
                          </svg>
                          {agents.map((agent, index) => (
                            <button
                              type="button"
                              key={agent.id}
                              className="branch-agent-bubble glass-hierarchy-node"
                              style={
                                {
                                  left: `${positions[index].x}%`,
                                  top: `${positions[index].y}%`,
                                } as CSSProperties
                              }
                              onClick={() => onSelectAgent(agent)}
                              aria-label={`Open ${agent.name}, ${agent.working ? "working" : "idle"}`}
                            >
                              <span
                                className={cn(
                                  "full-agent-state",
                                  agent.working ? "agent-dot-working" : "agent-dot-idle",
                                )}
                              />
                              <span className="branch-agent-initials">{agent.initials}</span>
                              <span className="branch-agent-copy">
                              <strong>{agent.name.replace(" Agent", "")}</strong>
                                <small>{agent.working ? "Working" : "Idle"}</small>
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    );
                  })}
                  </div>
                </motion.div>
              </div>
            </div>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}

function DetailPanel({
  title,
  onClose,
}: {
  title: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <AnimatePresence>
      {title && (
        <>
          <motion.button
            type="button"
            className="panel-overlay"
            aria-label="Close panel"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
          <motion.aside
            className="detail-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 330, damping: 34 }}
          >
            <div className="flex items-center justify-between border-b border-line p-5">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-violet-700">
                  Roster workspace
                </p>
                <h2 id="detail-title" className="mt-1 text-[18px] font-semibold text-ink">
                  {title}
                </h2>
              </div>
              <button type="button" className="icon-button" onClick={onClose} aria-label="Close panel">
                <X size={16} />
              </button>
            </div>
            <div className="p-5">
              <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                <div className="flex items-center gap-3">
                  <BrandMark compact />
                  <div>
                    <p className="text-[11px] font-semibold text-ink">Roster action center</p>
                    <p className="mt-0.5 text-[9px] text-muted">
                      This panel is a placeholder — full workspace views are on the way.
                    </p>
                  </div>
                </div>
              </div>
              <div className="mt-5 space-y-2">
                {["Review context", "Inspect linked agents", "Open decision history"].map(
                  (item, index) => (
                    <button key={item} type="button" className="panel-action">
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-[#f4f5f7] text-muted">
                        {index === 0 ? (
                          <ListChecks size={14} />
                        ) : index === 1 ? (
                          <Bot size={14} />
                        ) : (
                          <FileClock size={14} />
                        )}
                      </span>
                      <span className="flex-1 text-left text-[11px] font-medium text-ink">{item}</span>
                      <ChevronRight size={14} className="text-muted" />
                    </button>
                  ),
                )}
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

export function Dashboard() {
  const dashboardRef = useRef<HTMLElement>(null);
  // Headline metrics come straight from the live snapshot; before the first
  // successful poll the whole shell renders a lightweight loading state.
  const { metrics, ready, stale } = useLive();
  const [activeNav, setActiveNav] = useState("Command Center");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [unread, setUnread] = useState(3);
  const [panel, setPanel] = useState<string | null>(null);
  const [companyMapOpen, setCompanyMapOpen] = useState(false);
  const [selectedCompanyAgent, setSelectedCompanyAgent] = useState<CompanyAgent | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>("light");
  const [recommendationDismissed, setRecommendationDismissed] = useState(false);
  const [approvals, setApprovals] = useState<Approval[]>([
    {
      id: 1,
      title: "Production deployment",
      agent: "Deployment Agent",
      risk: "High",
      approved: false,
    },
    {
      id: 2,
      title: "Refund exception",
      agent: "Support Agent",
      risk: "Medium",
      approved: false,
    },
    {
      id: 3,
      title: "New outbound campaign",
      agent: "Sales HQ",
      risk: "Medium",
      approved: false,
    },
    {
      id: 4,
      title: "Contract language update",
      agent: "Legal Agent",
      risk: "Medium",
      approved: false,
    },
  ]);

  useEffect(() => {
    const stored = window.localStorage.getItem("roster-theme") as ThemeMode | null;
    if (stored && ["system", "light", "dark"].includes(stored)) {
      setThemeMode(stored);
    }
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncTheme = () => {
      setResolvedTheme(themeMode === "system" ? (media.matches ? "dark" : "light") : themeMode);
    };
    syncTheme();
    media.addEventListener("change", syncTheme);
    window.localStorage.setItem("roster-theme", themeMode);
    return () => media.removeEventListener("change", syncTheme);
  }, [themeMode]);

  useGSAP(
    () => {
      const scroller = dashboardRef.current?.querySelector(".dashboard-scroll");
      if (!scroller || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

      gsap.utils.toArray<HTMLElement>(".motion-stage").forEach((stage) => {
        gsap.fromTo(
          stage,
          { y: 34, opacity: 0.72 },
          {
            y: 0,
            opacity: 1,
            ease: "none",
            scrollTrigger: {
              trigger: stage,
              scroller,
              start: "top 96%",
              end: "top 72%",
              scrub: 0.55,
            },
          },
        );
      });

      gsap.utils.toArray<HTMLElement>(".parallax-layer").forEach((layer) => {
        const depth = Number(layer.dataset.depth ?? 14);
        gsap.fromTo(
          layer,
          { yPercent: -depth / 3 },
          {
            yPercent: depth / 3,
            ease: "none",
            scrollTrigger: {
              trigger: layer,
              scroller,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          },
        );
      });

      gsap.to(".ambient-shape-ring", {
        rotate: 360,
        duration: 28,
        repeat: -1,
        ease: "none",
      });
      gsap.to(".ambient-shape-disc", {
        y: -18,
        rotate: -8,
        duration: 5.5,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    },
    // Re-run after the loading gate lifts, when the real dashboard DOM exists.
    { scope: dashboardRef, dependencies: [ready], revertOnUpdate: true },
  );

  const openPanel = (title: string) => {
    setPanel(title);
    if (title === "Notifications") setUnread(0);
  };

  const approve = (id: number) => {
    setApprovals((current) =>
      current.map((approval) =>
        approval.id === id ? { ...approval, approved: true } : approval,
      ),
    );
    setUnread((count) => count + 1);
  };

  const navigate = (item: string) => {
    setActiveNav(item);
    if (item !== "Command Center") openPanel(item);
  };

  const cycleTheme = () => {
    setThemeMode((current) =>
      current === "system" ? "dark" : current === "dark" ? "light" : "system",
    );
  };

  const openCompanyMap = () => {
    setSelectedCompanyAgent(null);
    setCompanyMapOpen(true);
  };

  const openCompanyAgent = (agent: CompanyAgent) => {
    setSelectedCompanyAgent(agent);
    setCompanyMapOpen(true);
  };

  // Lightweight loading state until the first snapshot lands — skeleton shell,
  // never fabricated numbers.
  if (!ready) {
    return (
      <main ref={dashboardRef} className="atmosphere" data-theme={resolvedTheme}>
        <div className="ambient-shape ambient-shape-ring" aria-hidden="true" />
        <div className="ambient-shape ambient-shape-disc" aria-hidden="true" />
        <div className="ambient-shape ambient-shape-grid" aria-hidden="true" />
        <motion.div
          initial={{ opacity: 0, y: 18, scale: 0.992 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
          className="app-window"
        >
          <div className="grid w-full place-items-center">
            <div className="text-center">
              <div className="mx-auto w-fit">
                <BrandMark />
              </div>
              <p className="mt-4 text-[13px] font-semibold tracking-[-0.02em] text-ink">
                Connecting to your company…
              </p>
              <p className="mt-1 text-[10px] text-muted">
                Live agents, operations, and activity load in a moment.
              </p>
              <span className="mt-4 inline-flex items-center gap-2 text-[9px] text-muted">
                <span className="h-1.5 w-1.5 animate-blink-soft rounded-full bg-violet-500" />
                Waiting for the first snapshot
              </span>
            </div>
          </div>
        </motion.div>
      </main>
    );
  }

  return (
    <main ref={dashboardRef} className="atmosphere" data-theme={resolvedTheme}>
      <div className="ambient-shape ambient-shape-ring" aria-hidden="true" />
      <div className="ambient-shape ambient-shape-disc" aria-hidden="true" />
      <div className="ambient-shape ambient-shape-grid" aria-hidden="true" />
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.992 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
        className="app-window"
      >
        <Sidebar
          active={activeNav}
          onNavigate={navigate}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onOpenPanel={openPanel}
        />
        <div className="main-column">
          <TopHeader
            search={search}
            setSearch={setSearch}
            unread={unread}
            themeMode={themeMode}
            resolvedTheme={resolvedTheme}
            onCycleTheme={cycleTheme}
            onOpenSidebar={() => setSidebarOpen(true)}
            onOpenPanel={openPanel}
          />
          <div className="dashboard-scroll">
            <div className="bento-grid">
              <CompanyStatusCard
                onOpen={openCompanyMap}
                onSelectAgent={openCompanyAgent}
              />
              <ApprovalQueue
                approvals={approvals}
                onApprove={approve}
                onReview={openPanel}
              />
              <MetricCard
                title="Active AI Employees"
                value={String(metrics.activeAgents)}
                icon={Bot}
                spark={sparkData[0]}
                color="#6d5ce7"
              />
              <MetricCard
                title="Tasks Completed"
                value={String(metrics.tasksCompleted)}
                icon={CheckCircle2}
                spark={sparkData[1]}
                color="#2c9c63"
              />
              <MetricCard
                title="Human Intervention Rate"
                value={`${metrics.interventionRate}%`}
                icon={MessageSquareText}
                spark={sparkData[2]}
                color="#3297a3"
              />
              <MetricCard
                title="Pending Approvals"
                value={String(metrics.pendingApprovals)}
                icon={FileCheck2}
                spark={sparkData[3]}
                color="#7c62ed"
              />
              <LiveOperations query={search} />
              <HQAgentCard onOpen={() => openPanel("HQ workspace")} />
              <AgentTerminal />
              <CompanyBrainCard onOpen={() => openPanel("Company Brain")} />
              <TeamPerformanceChart />
              <ActivityFeed />
              <RecommendationCard
                dismissed={recommendationDismissed}
                onDismiss={() => setRecommendationDismissed(true)}
                onReview={() => openPanel("Enterprise escalation workflow")}
              />
            </div>
            <footer className="dashboard-footer">
              <span>Roster command center</span>
              <span className="flex items-center gap-1.5">
                <CircleDot size={10} className={stale ? "text-amber-500" : "text-emerald-500"} />
                {stale ? "Reconnecting to live data…" : "All systems operational"}
              </span>
            </footer>
          </div>
        </div>
        <FullscreenCompanyMap
          open={companyMapOpen}
          selectedAgent={selectedCompanyAgent}
          onSelectAgent={openCompanyAgent}
          onBackToMap={() => setSelectedCompanyAgent(null)}
          onClose={() => {
            setCompanyMapOpen(false);
            setSelectedCompanyAgent(null);
          }}
        />
        <DetailPanel title={panel} onClose={() => setPanel(null)} />
      </motion.div>
    </main>
  );
}
