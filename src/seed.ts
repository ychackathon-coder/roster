/**
 * The §14 demo seed.
 *
 * T-03 and T-04 collide on one real file ON PURPOSE, and T-01 defines a contract
 * that T-02 and T-05 consume. Exactly one collision at a known moment — which
 * §17.1 is candid about: engineering the seed is honest scoping for the demo, not
 * a fix for contention thrash.
 */
import { logActivity, mutate } from './state.js'
import type { Task } from './types.js'

const DEMO_TASKS: Task[] = [
  {
    id: 'T-01',
    title: 'cart route accepts variantId',
    area: 'backend',
    suggestedPaths: ['api/routes/cart.ts', 'api/types.ts'],
    dependsOn: [],
    status: 'open',
    claimedBy: null,
  },
  {
    id: 'T-02',
    title: 'variant picker component',
    area: 'frontend',
    suggestedPaths: ['web/src/components/VariantPicker.tsx'],
    dependsOn: ['T-01'],
    status: 'open',
    claimedBy: null,
  },
  {
    id: 'T-03',
    title: 'render selected variant in cart item',
    area: 'frontend',
    suggestedPaths: ['web/src/components/Cart/CartItem.tsx'],
    dependsOn: ['T-02'],
    status: 'open',
    claimedBy: null,
  },
  {
    id: 'T-04',
    title: 'quantity stepper in cart item',
    area: 'frontend',
    suggestedPaths: ['web/src/components/Cart/CartItem.tsx'],
    dependsOn: [],
    status: 'open',
    claimedBy: null,
  },
  {
    id: 'T-05',
    title: 'cart fixtures cover variants',
    area: 'tests',
    suggestedPaths: ['tests/fixtures/cart.ts'],
    dependsOn: ['T-01'],
    status: 'open',
    claimedBy: null,
  },
]

/** §15 risk 11: keep a reseed script so a hub restart costs 20 seconds. */
export const seedTasks = (): void => {
  mutate('seed', (s) => {
    for (const t of DEMO_TASKS) s.tasks[t.id] = { ...t, dependsOn: [...t.dependsOn], suggestedPaths: [...t.suggestedPaths] }
    logActivity(s, `seeded ${DEMO_TASKS.length} tasks`, 'info')
  })
}

/** Wipes sessions and leases but keeps tasks — for a mid-demo reset. */
export const resetRuntime = (): void => {
  mutate('reset', (s) => {
    s.sessions = {}
    s.leases = {}
    s.notices = []
    s.activity = []
    s.buildStatus = 'unknown'
    for (const t of Object.values(s.tasks)) {
      t.status = 'open'
      t.claimedBy = null
    }
    logActivity(s, 'runtime reset — tasks returned to the board', 'warn')
  })
}
