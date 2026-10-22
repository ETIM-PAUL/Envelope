// Rewrites a link Android opens the app with before the router sees it: a verified web link to a gift
// or tip becomes the route that screen lives at (utils/app-link.ts). Everything else passes through.
import { routeForAppLink } from '../utils/app-link'

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return routeForAppLink(path) ?? path
}
