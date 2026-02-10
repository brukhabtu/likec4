/**
 * Semver parsing and range matching — thin wrapper around the `semver` package.
 */

import semver from 'semver'

export type { SemVer } from 'semver'

export function parseSemVer(version: string): semver.SemVer | null {
  return semver.parse(version)
}

export function compareSemVer(a: semver.SemVer, b: semver.SemVer): number {
  return semver.compare(a, b)
}

export function semVerToString(v: semver.SemVer): string {
  return v.format()
}

export function parseRange(range: string): semver.Range | null {
  try {
    return new semver.Range(range)
  } catch {
    return null
  }
}

export function satisfies(version: semver.SemVer, range: semver.Range): boolean {
  return semver.satisfies(version, range)
}

/**
 * Find the highest version that satisfies the given range
 */
export function findBestMatch(versions: semver.SemVer[], range: semver.Range): semver.SemVer | null {
  const versionStrings = versions.map(v => v.format())
  const best = semver.maxSatisfying(versionStrings, range)
  if (!best) return null
  return semver.parse(best)
}
