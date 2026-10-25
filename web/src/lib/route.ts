import { useEffect, useState } from 'react'

// The hash holds what's on screen so any view can be shared as a link:
//   #/?team=sdr              a team
//   #/?team=sdr&role=email   …with one bot selected
// Older links still open the right team: #/sdr, #/sdr?role=email, and
// #/?hired=sdr,marketing (the first team listed).
export interface Route {
  view: 'catalog' | 'driver-tools' | 'business' | 'telemetry'
  teamId: string | null
  roleId: string | null
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '')
  const [path, search = ''] = raw.split('?')
  const p = new URLSearchParams(search)
  const pathSegments = path.split('/').filter(Boolean).map(decodeURIComponent)
  if (pathSegments[0] === 'business' || p.get('view') === 'business') {
    return { view: 'business', teamId: null, roleId: null }
  }
  if (pathSegments[0] === 'driver-tools' || p.get('view') === 'driver-tools') {
    return { view: 'driver-tools', teamId: null, roleId: null }
  }
  const legacyPath = pathSegments[0] ?? null
  const legacyHired = (p.get('hired') ?? '').split(',').map(s => s.trim()).filter(Boolean)[0] ?? null
  const teamId = p.get('team') ?? legacyPath ?? legacyHired
  return { view: 'catalog', teamId, roleId: teamId ? p.get('role') : null }
}

export function toHash(route: Route): string {
  if (route.view === 'telemetry') return '#/telemetry'
  if (route.view === 'business') return '#/business'
  if (route.view === 'driver-tools') return '#/driver-tools'
  if (!route.teamId) return '#/'
  const p = [`team=${encodeURIComponent(route.teamId)}`]
  if (route.roleId) p.push(`role=${encodeURIComponent(route.roleId)}`)
  return `#/?${p.join('&')}`
}

export function useRoute(): [Route, (r: Route) => void] {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  const navigate = (r: Route) => {
    const hash = toHash(r)
    if (hash !== window.location.hash) window.location.hash = hash
  }
  return [route, navigate]
}
