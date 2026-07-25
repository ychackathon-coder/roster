/**
 * Test fixtures. Builds a bare HubState so tests never touch the singleton in
 * state.ts and can therefore run in any order.
 *
 * The default task graph is the §14 demo seed, because the behavior that has to
 * be right is the behavior the demo depends on: T-03 and T-04 collide on one
 * real file, and T-02 depends on T-01.
 */
import type { HubState, Session, Task } from './types.js'

export const makeState = (): HubState => ({
  rev: 0,
  repo: { name: 'switchboard-demo', branch: 'main' },
  sessions: {},
  leases: {},
  tasks: {},
  contracts: {},
  notices: [],
  profiles: {},
  repoContext: '',
  activity: [],
  buildStatus: 'unknown',
  hubHealth: { lastAdjudicationMs: 0, degradedSessions: [] },
})

export const makeSession = (over: Partial<Session> & { id: string }): Session => ({
  humanId: over.id,
  humanName: 'Anon',
  machine: 'test-box',
  agentKind: 'claude-code',
  status: 'active',
  lastSeen: Date.now(),
  lastPrompt: '',
  currentTaskId: null,
  color: '#888888',
  ...over,
})

export const makeTask = (over: Partial<Task> & { id: string }): Task => ({
  title: 'untitled',
  area: 'frontend',
  suggestedPaths: [],
  dependsOn: [],
  status: 'open',
  claimedBy: null,
  ...over,
})

/** §14, verbatim. */
export const seedDemoTasks = (s: HubState): void => {
  const tasks: Task[] = [
    makeTask({
      id: 'T-01',
      title: 'cart route accepts variantId',
      area: 'backend',
      suggestedPaths: ['api/routes/cart.ts', 'api/types.ts'],
    }),
    makeTask({
      id: 'T-02',
      title: 'variant picker component',
      area: 'frontend',
      suggestedPaths: ['web/src/components/VariantPicker.tsx'],
      dependsOn: ['T-01'],
    }),
    makeTask({
      id: 'T-03',
      title: 'render variant in cart item',
      area: 'frontend',
      suggestedPaths: ['web/src/components/Cart/CartItem.tsx'],
      dependsOn: ['T-02'],
    }),
    makeTask({
      id: 'T-04',
      title: 'quantity stepper in cart item',
      area: 'frontend',
      suggestedPaths: ['web/src/components/Cart/CartItem.tsx'],
    }),
    makeTask({
      id: 'T-05',
      title: 'cart fixtures cover variants',
      area: 'tests',
      suggestedPaths: ['tests/fixtures/cart.ts'],
      dependsOn: ['T-01'],
    }),
  ]
  for (const t of tasks) s.tasks[t.id] = t
}

/** Registers a session already working a task, the state after UserPromptSubmit. */
export const joinSession = (
  s: HubState,
  a: { id: string; name: string; machine: string; taskId?: string; intent?: string },
): Session => {
  const session = makeSession({
    id: a.id,
    humanId: a.name.toLowerCase(),
    humanName: a.name,
    machine: a.machine,
    currentTaskId: a.taskId ?? null,
    lastPrompt: a.intent ?? '',
  })
  s.sessions[session.id] = session
  if (a.taskId && s.tasks[a.taskId]) {
    s.tasks[a.taskId]!.status = 'in_progress'
    s.tasks[a.taskId]!.claimedBy = session.id
  }
  return session
}
