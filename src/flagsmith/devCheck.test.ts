import { afterEach, describe, expect, it, vi } from 'vitest'
import { batchKeysFromBody } from './deliveryMonitor'
import { devCheckKey, sendDevConnectionCheck } from './measurement'

describe('dev connection check guards', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keys a dev check batch by its own id, never as a score or exposure', () => {
    const body = JSON.stringify({
      events: [{ event: 'readout_dev_check', identifier: 'dev-check-x', metadata: { devCheckId: 'abc' } }],
    })
    expect(batchKeysFromBody(body).keys).toEqual([devCheckKey('abc')])
  })

  it('refuses to run in a production build', async () => {
    vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'production')
    await expect(sendDevConnectionCheck('dev-check-x', 'id', 10)).rejects.toThrow(/production/)
  })

  it('refuses identities that are not labelled dev-check-', async () => {
    vi.stubEnv('VITE_FLAGSMITH_ENV_NAME', 'development')
    await expect(sendDevConnectionCheck('real-player-uid', 'id', 10)).rejects.toThrow(/dev-check-/)
  })
})
