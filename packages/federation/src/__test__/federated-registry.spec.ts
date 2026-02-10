import type { FederationManifest, FederationRegistry } from '@likec4/core/types'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFederatedRegistry } from '../federated-registry'

function createTestManifest(name: string): FederationManifest {
  return {
    schema: 'likec4/federation/v1',
    name,
    specification: { elements: {} },
    elements: {
      [`${name}Root`]: {
        id: `${name}Root`,
        kind: 'service',
        title: `${name} Root`,
        style: {},
      },
    } as FederationManifest['elements'],
    relations: {},
    project: { id: name },
  } as FederationManifest
}

describe('createFederatedRegistry', () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'federated-registry-test-'))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it('publishes manifest and creates registry.json', async () => {
    const registry = createFederatedRegistry(tmpDir)
    const manifest = createTestManifest('auth-service')
    await registry.publishManifest('auth-service', manifest)

    // Verify manifest was written
    const manifestContent = await readFile(join(tmpDir, 'auth-service', 'manifest.json'), 'utf-8')
    const written = JSON.parse(manifestContent)
    expect(written.name).toBe('auth-service')
    expect(written.schema).toBe('likec4/federation/v1')

    // Verify registry.json was updated
    const registryContent = await readFile(join(tmpDir, 'registry.json'), 'utf-8')
    const reg = JSON.parse(registryContent)
    expect(reg.providers['auth-service']).toBeDefined()
    expect(reg.providers['auth-service'].lastPublished).toBeTruthy()
  })

  it('reads published manifest', async () => {
    const registry = createFederatedRegistry(tmpDir)
    const manifest = createTestManifest('auth-service')
    await registry.publishManifest('auth-service', manifest)

    const read = await registry.readManifest('auth-service')
    expect(read.name).toBe('auth-service')
    expect(read.elements['auth-serviceRoot']).toBeDefined()
  })

  it('reads registry with providers and consumers', async () => {
    const registry = createFederatedRegistry(tmpDir)
    await registry.publishManifest('auth-service', createTestManifest('auth-service'))
    await registry.syncConsumer('platform', { 'auth-service': ['auth-serviceRoot'] })

    const reg = await registry.readRegistry()
    expect(reg.schema).toBe('likec4/registry/v1')
    expect(reg.providers['auth-service']).toBeDefined()
    expect(reg.consumers['platform']).toBeDefined()
    expect(reg.consumers['platform']!.imports['auth-service']).toEqual(['auth-serviceRoot'])
  })

  it('returns empty registry when registry.json is missing', async () => {
    const registry = createFederatedRegistry(tmpDir)
    const reg = await registry.readRegistry()
    expect(reg.schema).toBe('likec4/registry/v1')
    expect(Object.keys(reg.providers)).toHaveLength(0)
    expect(Object.keys(reg.consumers)).toHaveLength(0)
  })

  it('throws when reading non-existent manifest', async () => {
    const registry = createFederatedRegistry(tmpDir)
    await expect(registry.readManifest('nonexistent')).rejects.toThrow()
  })

  it('syncs consumer contract', async () => {
    const registry = createFederatedRegistry(tmpDir)
    await registry.syncConsumer('platform', {
      'auth-service': ['authRoot', 'authApi'],
      'payments': ['payRoot'],
    })

    const reg = await registry.readRegistry()
    expect(reg.consumers['platform']!.imports).toEqual({
      'auth-service': ['authRoot', 'authApi'],
      'payments': ['payRoot'],
    })
  })

  it('updates existing provider entry on re-publish', async () => {
    const registry = createFederatedRegistry(tmpDir)
    await registry.publishManifest('auth-service', createTestManifest('auth-service'))

    const reg1 = await registry.readRegistry()
    const ts1 = reg1.providers['auth-service']!.lastPublished

    // Wait a bit to get a different timestamp
    await new Promise(resolve => setTimeout(resolve, 10))

    await registry.publishManifest('auth-service', createTestManifest('auth-service'))
    const reg2 = await registry.readRegistry()
    const ts2 = reg2.providers['auth-service']!.lastPublished

    expect(ts2).not.toBe(ts1)
  })

  it('versioned publish writes both version file and manifest.json', async () => {
    const registry = createFederatedRegistry(tmpDir)
    const manifest = createTestManifest('auth-service')
    await registry.publishManifest('auth-service', manifest, '1.0.0')

    // Verify versioned snapshot was written
    const versionedContent = await readFile(join(tmpDir, 'auth-service', '1.0.0.json'), 'utf-8')
    const versioned = JSON.parse(versionedContent)
    expect(versioned.name).toBe('auth-service')

    // Verify latest manifest was also written
    const latestContent = await readFile(join(tmpDir, 'auth-service', 'manifest.json'), 'utf-8')
    const latest = JSON.parse(latestContent)
    expect(latest.name).toBe('auth-service')

    // Both files should have the same content
    expect(versioned).toEqual(latest)
  })

  it('versioned publish updates registry.json with latestVersion and versions', async () => {
    const registry = createFederatedRegistry(tmpDir)
    await registry.publishManifest('auth-service', createTestManifest('auth-service'), '1.0.0')

    const reg = await registry.readRegistry()
    const entry = reg.providers['auth-service']!
    expect(entry.latestVersion).toBe('1.0.0')
    expect(entry.versions).toEqual(['1.0.0'])
    expect(entry.lastPublished).toBeTruthy()
  })

  it('unversioned publish still works without version fields', async () => {
    const registry = createFederatedRegistry(tmpDir)
    await registry.publishManifest('auth-service', createTestManifest('auth-service'))

    const reg = await registry.readRegistry()
    const entry = reg.providers['auth-service']!
    expect(entry.lastPublished).toBeTruthy()
    expect(entry.latestVersion).toBeUndefined()
    expect(entry.versions).toBeUndefined()

    // No versioned file should exist
    await expect(access(join(tmpDir, 'auth-service', 'undefined.json'))).rejects.toThrow()
  })

  it('multiple versioned publishes accumulate versions', async () => {
    const registry = createFederatedRegistry(tmpDir)
    await registry.publishManifest('auth-service', createTestManifest('auth-service'), '1.0.0')
    await registry.publishManifest('auth-service', createTestManifest('auth-service'), '1.1.0')
    await registry.publishManifest('auth-service', createTestManifest('auth-service'), '2.0.0')

    const reg = await registry.readRegistry()
    const entry = reg.providers['auth-service']!
    expect(entry.latestVersion).toBe('2.0.0')
    expect(entry.versions).toEqual(['1.0.0', '1.1.0', '2.0.0'])

    // All versioned files should exist
    const v1 = JSON.parse(await readFile(join(tmpDir, 'auth-service', '1.0.0.json'), 'utf-8'))
    const v2 = JSON.parse(await readFile(join(tmpDir, 'auth-service', '1.1.0.json'), 'utf-8'))
    const v3 = JSON.parse(await readFile(join(tmpDir, 'auth-service', '2.0.0.json'), 'utf-8'))
    expect(v1.name).toBe('auth-service')
    expect(v2.name).toBe('auth-service')
    expect(v3.name).toBe('auth-service')
  })

  it('re-publishing same version does not duplicate in versions array', async () => {
    const registry = createFederatedRegistry(tmpDir)
    await registry.publishManifest('auth-service', createTestManifest('auth-service'), '1.0.0')
    await registry.publishManifest('auth-service', createTestManifest('auth-service'), '1.0.0')

    const reg = await registry.readRegistry()
    const entry = reg.providers['auth-service']!
    expect(entry.versions).toEqual(['1.0.0'])
  })

  it('unversioned publish after versioned preserves version fields', async () => {
    const registry = createFederatedRegistry(tmpDir)
    await registry.publishManifest('auth-service', createTestManifest('auth-service'), '1.0.0')
    await registry.publishManifest('auth-service', createTestManifest('auth-service'))

    const reg = await registry.readRegistry()
    const entry = reg.providers['auth-service']!
    expect(entry.latestVersion).toBe('1.0.0')
    expect(entry.versions).toEqual(['1.0.0'])
  })
})
