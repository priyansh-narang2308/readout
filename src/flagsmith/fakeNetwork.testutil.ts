/**
 * Test-only fake network for the real Flagsmith SDK (not imported by the app). The Edge API answers like a running
 * experiment; every POST to the events API is captured exactly as the SDK sent it. Shared by the wire-level tests.
 */
export type SentEvent = { event: string; identifier?: string; value?: unknown; metadata?: Record<string, unknown> }

export const net = {
  requests: [] as string[],
  batches: [] as SentEvent[][],
  inExperiment: true,
  identityStatus: 200,
  variant: 'chance_to_win' as string,
  /** false: the flag carries no experiment metadata at all (no experiment, or one that has ended). */
  experimentMetadata: true,
  /** HTTP status for each events POST, in order; the last one repeats. */
  eventStatuses: [202] as number[],
}

function edgeIdentity(identifier: string) {
  return {
    identifier,
    traits: [],
    flags: [
      {
        feature: { id: 1, name: 'readout_framing', type: 'MULTIVARIATE' },
        enabled: true,
        feature_state_value: net.variant,
        variant: net.variant,
        ...(net.experimentMetadata ? { metadata: { experiment: { id: 42, name: 'readout framing', in_experiment: net.inExperiment } } } : {}),
      },
    ],
  }
}

export async function fakeFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  net.requests.push(`${init?.method ?? 'GET'} ${url}`)
  if (url.includes('/v1/events')) {
    net.batches.push((JSON.parse(String(init?.body)) as { events: SentEvent[] }).events)
    const status = net.eventStatuses.length > 1 ? net.eventStatuses.shift()! : net.eventStatuses[0]!
    return new Response(status < 300 ? '' : 'error', { status })
  }
  if (url.includes('identities/')) {
    if (net.identityStatus !== 200) return new Response('down', { status: net.identityStatus })
    const id = new URL(url).searchParams.get('identifier') ?? ''
    return new Response(JSON.stringify(edgeIdentity(id)), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
}

export function resetNet() {
  Object.assign(net, { requests: [], batches: [], inExperiment: true, identityStatus: 200, variant: 'chance_to_win', experimentMetadata: true, eventStatuses: [202] })
}

export const events = () => net.batches.flat()
export const until = async (cond: () => boolean, ms = 8000) => {
  const end = Date.now() + ms
  while (!cond()) {
    if (Date.now() > end) throw new Error('timed out')
    await new Promise((r) => setTimeout(r, 20))
  }
}
