import { USE_MOCK } from '../config'
import * as mock from './mock'
import * as remote from './remote'

// One interface, two implementations. The store only ever talks to `backend`.
export const backend = { mode: USE_MOCK ? 'mock' : 'remote', ...(USE_MOCK ? mock : remote) }
export { USE_MOCK }
