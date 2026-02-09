import { describe, expect, it } from 'vitest'
import {
  compareSemVer,
  findBestMatch,
  parseRange,
  parseSemVer,
  satisfies,
  semVerToString,
} from '../version'

describe('parseSemVer', () => {
  it('parses valid semver strings', () => {
    const v = parseSemVer('1.2.3')
    expect(v).not.toBeNull()
    expect(v!.major).toBe(1)
    expect(v!.minor).toBe(2)
    expect(v!.patch).toBe(3)

    const v2 = parseSemVer('0.0.0')
    expect(v2).not.toBeNull()
    expect(v2!.major).toBe(0)

    const v3 = parseSemVer('10.20.30')
    expect(v3).not.toBeNull()
    expect(v3!.major).toBe(10)
    expect(v3!.minor).toBe(20)
    expect(v3!.patch).toBe(30)
  })

  it('parses prerelease versions', () => {
    const v = parseSemVer('1.0.0-alpha')
    expect(v).not.toBeNull()
    expect(v!.major).toBe(1)
    expect(v!.prerelease).toEqual(['alpha'])

    const v2 = parseSemVer('1.0.0-beta.1')
    expect(v2).not.toBeNull()
    expect(v2!.prerelease).toEqual(['beta', 1])
  })

  it('returns null for invalid strings', () => {
    expect(parseSemVer('')).toBeNull()
    expect(parseSemVer('abc')).toBeNull()
    expect(parseSemVer('1.2')).toBeNull()
    expect(parseSemVer('1.2.3.4')).toBeNull()
  })
})

describe('compareSemVer', () => {
  it('compares major versions', () => {
    expect(compareSemVer(parseSemVer('2.0.0')!, parseSemVer('1.0.0')!)).toBeGreaterThan(0)
    expect(compareSemVer(parseSemVer('1.0.0')!, parseSemVer('2.0.0')!)).toBeLessThan(0)
  })

  it('compares minor versions', () => {
    expect(compareSemVer(parseSemVer('1.2.0')!, parseSemVer('1.1.0')!)).toBeGreaterThan(0)
  })

  it('compares patch versions', () => {
    expect(compareSemVer(parseSemVer('1.0.2')!, parseSemVer('1.0.1')!)).toBeGreaterThan(0)
  })

  it('equal versions return 0', () => {
    expect(compareSemVer(parseSemVer('1.2.3')!, parseSemVer('1.2.3')!)).toBe(0)
  })

  it('prerelease has lower precedence than release', () => {
    expect(compareSemVer(parseSemVer('1.0.0-alpha')!, parseSemVer('1.0.0')!)).toBeLessThan(0)
    expect(compareSemVer(parseSemVer('1.0.0')!, parseSemVer('1.0.0-alpha')!)).toBeGreaterThan(0)
  })
})

describe('semVerToString', () => {
  it('converts without prerelease', () => {
    expect(semVerToString(parseSemVer('1.2.3')!)).toBe('1.2.3')
  })

  it('converts with prerelease', () => {
    expect(semVerToString(parseSemVer('1.0.0-alpha')!)).toBe('1.0.0-alpha')
  })
})

describe('parseRange', () => {
  it('parses exact ranges', () => {
    const range = parseRange('1.2.3')
    expect(range).not.toBeNull()
  })

  it('parses caret ranges', () => {
    const range = parseRange('^1.2.3')
    expect(range).not.toBeNull()
  })

  it('parses tilde ranges', () => {
    const range = parseRange('~1.2.3')
    expect(range).not.toBeNull()
  })

  it('returns null for invalid ranges', () => {
    expect(parseRange('^abc')).toBeNull()
    expect(parseRange('not-a-version')).toBeNull()
  })
})

describe('satisfies', () => {
  describe('exact range', () => {
    it('matches exact version', () => {
      const range = parseRange('1.2.3')!
      expect(satisfies(parseSemVer('1.2.3')!, range)).toBe(true)
      expect(satisfies(parseSemVer('1.2.4')!, range)).toBe(false)
    })
  })

  describe('caret range', () => {
    it('^1.2.3 allows >=1.2.3 <2.0.0', () => {
      const range = parseRange('^1.2.3')!
      expect(satisfies(parseSemVer('1.2.3')!, range)).toBe(true)
      expect(satisfies(parseSemVer('1.3.0')!, range)).toBe(true)
      expect(satisfies(parseSemVer('1.9.9')!, range)).toBe(true)
      expect(satisfies(parseSemVer('2.0.0')!, range)).toBe(false)
      expect(satisfies(parseSemVer('1.2.2')!, range)).toBe(false)
    })

    it('^0.2.3 allows >=0.2.3 <0.3.0', () => {
      const range = parseRange('^0.2.3')!
      expect(satisfies(parseSemVer('0.2.3')!, range)).toBe(true)
      expect(satisfies(parseSemVer('0.2.9')!, range)).toBe(true)
      expect(satisfies(parseSemVer('0.3.0')!, range)).toBe(false)
    })

    it('^0.0.3 allows only 0.0.3', () => {
      const range = parseRange('^0.0.3')!
      expect(satisfies(parseSemVer('0.0.3')!, range)).toBe(true)
      expect(satisfies(parseSemVer('0.0.4')!, range)).toBe(false)
    })
  })

  describe('tilde range', () => {
    it('~1.2.3 allows >=1.2.3 <1.3.0', () => {
      const range = parseRange('~1.2.3')!
      expect(satisfies(parseSemVer('1.2.3')!, range)).toBe(true)
      expect(satisfies(parseSemVer('1.2.9')!, range)).toBe(true)
      expect(satisfies(parseSemVer('1.3.0')!, range)).toBe(false)
      expect(satisfies(parseSemVer('1.2.2')!, range)).toBe(false)
    })
  })
})

describe('findBestMatch', () => {
  const versions = [
    parseSemVer('1.0.0')!,
    parseSemVer('1.1.0')!,
    parseSemVer('1.2.0')!,
    parseSemVer('2.0.0')!,
  ]

  it('finds the highest matching version for caret range', () => {
    const best = findBestMatch(versions, parseRange('^1.0.0')!)
    expect(best).not.toBeNull()
    expect(best!.format()).toBe('1.2.0')
  })

  it('finds the highest matching version for tilde range', () => {
    const best = findBestMatch(versions, parseRange('~1.0.0')!)
    expect(best).not.toBeNull()
    expect(best!.format()).toBe('1.0.0')
  })

  it('returns null when no version matches', () => {
    const best = findBestMatch(versions, parseRange('^3.0.0')!)
    expect(best).toBeNull()
  })

  it('finds exact match', () => {
    const best = findBestMatch(versions, parseRange('2.0.0')!)
    expect(best).not.toBeNull()
    expect(best!.format()).toBe('2.0.0')
  })
})
