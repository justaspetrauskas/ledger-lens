// Shared server-side accountability log — one in-memory buffer for every visitor and surface.
//
// ponytail: this assumes Railway's default single-replica Hobby config. Scaling past 1
// replica fragments it silently (two users see two partial logs); a redeploy/crash wipes
// it. Upgrade path if either matters: Postgres or Redis. See plan.md §"In-memory audit
// across instances" for the full ceiling.

import type { AuditEntry } from '../src/lib/types'

const CAP = 500
const log: AuditEntry[] = []

export function list(): AuditEntry[] {
  return log
}

export function record(entry: Omit<AuditEntry, 'at'>): AuditEntry {
  const full: AuditEntry = { ...entry, at: Date.now() }
  if (log.some((e) => e.id === full.id)) return full
  log.push(full)
  if (log.length > CAP) log.shift()
  return full
}
