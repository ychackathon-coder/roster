"use client";

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
  LockKeyhole,
  Menu,
  MessageSquareText,
  Maximize2,
  Monitor,
  Minus,
  Moon,
  Network,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings,
  ShieldCheck,
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
import { cn } from "@/lib/utils";
import {
  operations as fallbackOperations,
  sparkData,
  teamData,
  type OperationStatus,
} from "@/lib/data";
import { useRosterData } from "@/lib/roster-context";
import { mergeAgents } from "@/lib/roster";

gsap.registerPlugin(ScrollTrigger, useGSAP);

type ThemeMode = "system" | "light" | "dark";
type ResolvedTheme = "light" | "dark";

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

function TypedStatus() {
  const phrases = [
    "18 agents are coordinating across active projects.",
    "Autonomous completion is holding at 94 percent.",
    "One decision queue is waiting for Jordan.",
  ];
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [characterIndex, setCharacterIndex] = useState(0);

  useEffect(() => {
    const phrase = phrases[phraseIndex];
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
      {phrases[phraseIndex].slice(0, characterIndex)}
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

type CompanyAgent = {
  id: string;
  name: string;
  initials: string;
  team: "Engineering" | "Sales" | "Support" | "Operations";
  working: boolean;
  task: string;
  progress: number;
  elapsed: string;
};

const companyAgents: CompanyAgent[] = [
  { id: "build", name: "Build Agent", initials: "BA", team: "Engineering", working: true, task: "Investigating CI failure", progress: 68, elapsed: "08:42" },
  { id: "deployment", name: "Deployment Agent", initials: "DA", team: "Engineering", working: true, task: "Verifying release 4.18 staging", progress: 81, elapsed: "16:24" },
  { id: "security", name: "Security Agent", initials: "SE", team: "Engineering", working: true, task: "Reviewing production release", progress: 74, elapsed: "11:09" },
  { id: "docs", name: "Documentation Agent", initials: "DO", team: "Engineering", working: true, task: "Updating release notes", progress: 54, elapsed: "06:19" },
  { id: "quality", name: "Quality Agent", initials: "QA", team: "Engineering", working: false, task: "Waiting for the next test window", progress: 0, elapsed: "—" },
  { id: "data", name: "Data Agent", initials: "DT", team: "Engineering", working: true, task: "Tracing ingestion anomaly", progress: 43, elapsed: "19:34" },
  { id: "infrastructure", name: "Infrastructure Agent", initials: "IA", team: "Engineering", working: false, task: "Waiting for a new assignment", progress: 0, elapsed: "—" },
  { id: "research", name: "Research Agent", initials: "RA", team: "Sales", working: true, task: "Compiling competitor brief", progress: 86, elapsed: "24:11" },
  { id: "outreach", name: "Outreach Agent", initials: "OA", team: "Sales", working: false, task: "Waiting for campaign approval", progress: 0, elapsed: "15:02" },
  { id: "account", name: "Account Agent", initials: "AC", team: "Sales", working: true, task: "Preparing renewal risk report", progress: 62, elapsed: "09:47" },
  { id: "proposal", name: "Proposal Agent", initials: "PA", team: "Sales", working: true, task: "Drafting enterprise proposal", progress: 77, elapsed: "13:38" },
  { id: "support", name: "Support Agent", initials: "SA", team: "Support", working: true, task: "Resolving enterprise escalation", progress: 72, elapsed: "13:08" },
  { id: "triage", name: "Triage Agent", initials: "TA", team: "Support", working: true, task: "Routing priority conversations", progress: 58, elapsed: "05:51" },
  { id: "knowledge", name: "Knowledge Agent", initials: "KA", team: "Support", working: false, task: "Waiting for verified guidance", progress: 0, elapsed: "—" },
  { id: "success", name: "Success Agent", initials: "CS", team: "Support", working: true, task: "Building onboarding checklist", progress: 65, elapsed: "17:20" },
  { id: "finance", name: "Finance Agent", initials: "FA", team: "Operations", working: false, task: "Blocked on invoice source data", progress: 31, elapsed: "42:53" },
  { id: "compliance", name: "Compliance Agent", initials: "CA", team: "Operations", working: true, task: "Monitoring policy exceptions", progress: 50, elapsed: "55:12" },
  { id: "people", name: "People Ops Agent", initials: "PO", team: "Operations", working: false, task: "Waiting for a new assignment", progress: 0, elapsed: "—" },
];

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
                  FlowOS
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
                Acme Systems
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
                        {item === "Approvals" && (
                          <span className="ml-auto rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                            4
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
                    18 of 25 agents active
                  </p>
                </div>
                <Cpu size={14} className="text-violet-600" />
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e9e7f1]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: "72%" }}
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
              onClick={() => onOpenPanel("Jordan Lee")}
            >
              <span className="user-avatar">JL</span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[11px] font-semibold text-ink">
                  Jordan Lee
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
          onClick={() => onOpenPanel("Create with FlowOS")}
        >
          <Plus size={14} />
          <span>Create</span>
        </button>
        <button
          type="button"
          aria-label="Open user menu"
          className="user-avatar hidden sm:grid"
          onClick={() => onOpenPanel("Jordan Lee")}
        >
          JL
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
 * Live agent state overlaid on the standing roster.
 *
 * The roster stays as company STRUCTURE so the hierarchy keeps its full shape;
 * live events light up the nodes they touch and idle the rest. See mergeAgents in
 * lib/roster.ts for why this merges rather than replaces.
 */
function useCompanyAgents(): CompanyAgent[] {
  const { agents, live } = useRosterData();
  return useMemo(
    () => (live && agents.length ? mergeAgents(companyAgents, agents) : companyAgents),
    [agents, live],
  );
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
            {[
              [Users, "18", "Active agents"],
              [CheckCircle2, "247", "Tasks today"],
              [Gauge, "94%", "Autonomous"],
            ].map(([Icon, value, label]) => {
              const MetricIcon = Icon as LucideIcon;
              return (
                <div key={String(label)} className="flex items-center gap-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                    <MetricIcon size={13} />
                  </span>
                  <div>
                    <dd className="text-[13px] font-semibold text-ink">
                      {String(value).includes("%") ? (
                        <AnimatedNumber value={Number(String(value).replace("%", ""))} suffix="%" />
                      ) : (
                        <AnimatedNumber value={Number(value)} />
                      )}
                    </dd>
                    <dt className="text-[8px] text-muted">{String(label)}</dt>
                  </div>
                </div>
              );
            })}
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
  change,
  icon: Icon,
  spark,
  color,
}: {
  title: string;
  value: string;
  change: string;
  icon: LucideIcon;
  spark: number[];
  color: string;
}) {
  const numericValue = Number(value.match(/[\d.]+/)?.[0] ?? 0);
  const decimals = value.includes(".") ? 1 : 0;
  const suffix = value.includes("%") ? "%" : value.includes("hrs") ? " hrs" : "";
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
          {change}
          <span className="ml-1 text-muted">vs last week</span>
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

function LiveOperations({ query }: { query: string }) {
  const [filter, setFilter] = useState("All teams");
  const { operations: liveOperations, live } = useRosterData();
  // Live rows when roster has events; the original static rows otherwise, so the
  // table is never empty while onboarding hasn't run.
  const operations = live && liveOperations.length ? liveOperations : fallbackOperations;
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
        {shown.map((operation) => (
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
            <span><StatusBadge status={operation.status} /></span>
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
        ))}
        {shown.length === 0 && (
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

function HQAgentCard({ onOpen }: { onOpen: () => void }) {
  const tasks = [
    ["Engineering validation", "Done"],
    ["Customer onboarding", "Running"],
    ["Contract review", "Review"],
    ["Launch communications", "Queued"],
  ];
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
            Prepare Acme Enterprise launch
          </h3>
        </div>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between text-[9px]">
          <span className="font-medium text-muted">Overall progress</span>
          <span className="font-semibold text-violet-700">72%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/80">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: "72%" }}
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
          {tasks.map(([task, status], index) => (
            <div key={task} className="flex items-center gap-2 rounded-lg bg-white/60 px-2.5 py-2">
              <span
                className={cn(
                  "grid h-5 w-5 place-items-center rounded-md",
                  index === 0
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-violet-100 text-violet-700",
                )}
              >
                {index === 0 ? <Check size={11} /> : <GitBranch size={11} />}
              </span>
              <span className="min-w-0 flex-1 truncate text-[9px] font-medium text-ink">
                {task}
              </span>
              <span className="text-[8px] text-muted">{status}</span>
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

const commandResponses: Record<string, string[]> = {
  "/status": [
    "Release 4.18 is waiting for staging verification.",
    "✓ Build completed",
    "✓ Security review passed",
    "● Integration tests running",
    "○ Human deployment approval",
    "ETA: 6 minutes",
  ],
  "/explain": [
    "Integration suite is validating payment callbacks.",
    "No regressions detected in 184 of 212 checks.",
    "Deployment remains paused until verification completes.",
  ],
  "/delegate": [
    "Delegation planner ready.",
    "Specify an objective and preferred team.",
  ],
  "/pause": [
    "Deployment Agent paused after the current safe checkpoint.",
    "No production resources were changed.",
  ],
};

function AgentTerminal() {
  const [command, setCommand] = useState("");
  const [lines, setLines] = useState(commandResponses["/status"]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { terminal, live, submit } = useRosterData();

  // HQ authors terminal_line for exactly this surface, so show it verbatim.
  // Slash-commands stay local so the prototype interactions still work.
  useEffect(() => {
    if (live && terminal.length) setLines(terminal.slice(-8));
  }, [live, terminal]);

  const runCommand = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = command.trim();
    if (!text || busy) return;

    // Slash commands remain a local demo affordance.
    if (text.startsWith("/")) {
      const response =
        commandResponses[text.toLowerCase()] ??
        ["Unknown command.", "Try /status, /explain, /delegate, or /pause."];
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
        routed ?? "○ HQ unreachable — is roster running?",
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
            Deployment Agent
          </span>
        </div>
        <div className="flex items-center gap-2 text-[8px] text-emerald-400">
          <span className="h-1.5 w-1.5 animate-blink-soft rounded-full bg-emerald-400" />
          Connected
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
          {Object.keys(commandResponses).map((suggestion) => (
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
            placeholder="Type a command or ask the agent…"
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
  const { profile } = useRosterData();

  /**
   * When a real repo has been indexed, the Company Brain shows what HQ was
   * actually calibrated FROM — the archetype and the derived traits. This is the
   * demo's proof point made visible: these strings are quoted from real commits
   * and README lines, not authored copy.
   */
  const updates: string[][] = profile
    ? [
        [`Calibrated from ${profile.source_repo}`, "GitHub", "Verified"],
        ...profile.traits.slice(0, 2).map((t) => [t, profile.source_repo, "Derived"]),
      ]
    : [
        ["Release policy updated", "GitHub", "Verified"],
        ["Enterprise onboarding procedure added", "Notion", "New"],
        ["Customer escalation rule verified", "Slack", "Verified"],
      ];
  return (
    <Card className="brain-field col-span-12 p-5 xl:col-span-5">
      <CardHeader
        icon={BrainCircuit}
        title="Company Brain"
        subtitle="Institutional knowledge, continuously updated."
        action={
          <span className="flex items-center gap-1 text-[8px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Updated 2m ago
          </span>
        }
      />
      <div className="brain-orbits mt-5 grid grid-cols-3 gap-2">
        {[
          ["12,480", "Knowledge records"],
          ["37", "Memories proposed"],
          ["3", "Need verification"],
        ].map(([value, label], index) => (
          <div
            key={label}
            className={cn("brain-orbit", index === 0 && "brain-orbit-primary")}
          >
            <p className="text-[16px] font-semibold tracking-[-0.03em] text-ink">
              <AnimatedNumber value={Number(value.replace(",", ""))} />
            </p>
            <p className="mt-0.5 text-[8px] leading-snug text-muted">{label}</p>
          </div>
        ))}
      </div>
      <div className="mt-4 divide-y divide-line">
        {updates.map(([title, source, state]) => (
          <div key={title} className="flex items-center gap-3 py-3">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#f4f5f7] text-[#6e7480]">
              <FileText size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold text-ink">{title}</p>
              <p className="mt-0.5 text-[8px] text-muted">
                {source} · Human verified
              </p>
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
        subtitle="Completed tasks and human interventions."
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
  const { activity, live } = useRosterData();

  const staticEntries = [
    [Network, "HQ Agent delegated release review to Security Agent", "2m", "HQ"],
    [ShieldCheck, "Deployment Agent requested production approval", "8m", "GitHub"],
    [Lightbulb, "Support Agent learned a new escalation preference", "18m", "Slack"],
    [CheckCircle2, "Jordan approved the enterprise refund exception", "31m", "Human"],
    [BrainCircuit, "Company Brain verified a new deployment policy", "44m", "Notion"],
  ] satisfies [LucideIcon, string, string, string][];

  // Icon carries the decision: a spawned agent is the one worth a second look.
  const entries: [LucideIcon, string, string, string][] =
    live && activity.length
      ? activity.map((item) => [
          item.text.startsWith("spawn") ? Lightbulb : Network,
          `${item.agent}: ${item.text}`,
          item.ago,
          item.user ?? item.team,
        ])
      : staticEntries;
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
          {entries.map(([Icon, text, time, source]) => (
            <div key={text} className="relative flex gap-3">
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
            Support agents required human intervention 18% more often this week.
          </h2>
          <p className="mt-1 text-[10px] text-muted">
            Review the enterprise escalation workflow to restore autonomous resolution rates.
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
  const activity = [
    {
      icon: Network,
      title: `HQ Agent assigned “${agent.task}”`,
      source: "HQ",
      time: "2m",
    },
    {
      icon: agent.working ? Activity : Pause,
      title: agent.working
        ? `${agent.name} began working on the assignment`
        : `${agent.name} moved to idle`,
      source: agent.team,
      time: "8m",
    },
    {
      icon: BrainCircuit,
      title: "Reviewed linked company knowledge and prior decisions",
      source: "Company Brain",
      time: "18m",
    },
    {
      icon: CheckCircle2,
      title: agent.working
        ? `Completed the latest checkpoint at ${agent.progress}%`
        : "Saved working context before pausing",
      source: "Agent runtime",
      time: "31m",
    },
    {
      icon: FileText,
      title: "Synchronized a concise progress memory",
      source: "Audit Log",
      time: "44m",
    },
  ];

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
            {activity.map(({ icon: Icon, title, source, time }, index) => (
              <motion.article
                key={title}
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
 * branchLayouts below is hand-tuned for the counts in the static roster (3, 4, 7).
 * Once live data can add a spawned agent or idle one out, a department can hold a
 * count with no entry — and `positions.map(...)` on undefined crashes the
 * full-screen hierarchy outright.
 *
 * Hand-tuned layouts still win when they exist, so the designed look is
 * unchanged; anything else gets a generated two-row arc that keeps branches
 * continuous at any scale.
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
                    <span>Coordinating 18 employee agents</span>
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
                  FlowOS workspace
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
                    <p className="text-[11px] font-semibold text-ink">FlowOS action center</p>
                    <p className="mt-0.5 text-[9px] text-muted">
                      This interactive panel is powered by local demo data.
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
  // Headline metrics derived from the real event stream; falls back to the
  // original static figures until onboarding has produced any events.
  const { metrics, live: rosterLive, profile } = useRosterData();
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
    const stored = window.localStorage.getItem("flowos-theme") as ThemeMode | null;
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
    window.localStorage.setItem("flowos-theme", themeMode);
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
    { scope: dashboardRef },
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
                value={metrics.activeAgents ? String(metrics.activeAgents) : "18"}
                change="↑ 12%"
                icon={Bot}
                spark={sparkData[0]}
                color="#6d5ce7"
              />
              <MetricCard
                title="Tasks Completed Today"
                value={rosterLive ? String(metrics.tasksCompleted) : "247"}
                change="↑ 18%"
                icon={CheckCircle2}
                spark={sparkData[1]}
                color="#2c9c63"
              />
              <MetricCard
                title="Human Intervention Rate"
                value={rosterLive ? `${metrics.interventionRate}%` : "6.2%"}
                change="↓ 0.8pt"
                icon={MessageSquareText}
                spark={sparkData[2]}
                color="#3297a3"
              />
              <MetricCard
                title="Estimated Time Saved"
                value="83 hrs"
                change="↑ 11%"
                icon={Clock3}
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
              <span>FlowOS command center</span>
              <span className="flex items-center gap-1.5">
                <CircleDot size={10} className="text-emerald-500" />
                All systems operational
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
