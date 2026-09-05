import { useQuery } from '@tanstack/react-query'

import { useApi } from '../api/ApiProvider'
import styles from './VersionLine.module.css'

/**
 * Which build of libra is serving this page, under the account row.
 *
 * The number comes from the server, not from the client's own `package.json`.
 * `scripts/run.sh` builds this client into the wheel, so the two are one
 * artifact — one thing to name, and the server is the half that knows the name.
 */
export function VersionLine() {
  const api = useApi()
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.health(),
    // A running server cannot change its version under the page, so asking a
    // second time is asking for an answer already on screen.
    staleTime: Infinity,
  })

  // Nothing at all until it arrives, and nothing if it never does. "Version
  // unknown" is a line the reader can do nothing with, and a server that
  // cannot answer /health has already failed louder elsewhere.
  if (!health.data) return null

  const { version, build } = health.data
  return (
    <p className={styles.version}>{build ? `libra ${version} · ${build}` : `libra ${version}`}</p>
  )
}
