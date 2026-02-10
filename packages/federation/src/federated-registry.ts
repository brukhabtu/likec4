import type { FederationManifest, FederationRegistry } from '@likec4/core/types'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export interface FederatedRegistryReader {
  /** Read the latest manifest for a project */
  readManifest(projectName: string): Promise<FederationManifest>
  /** Read the registry index */
  readRegistry(): Promise<FederationRegistry>
}

export interface FederatedRegistryWriter extends FederatedRegistryReader {
  /** Publish a manifest and update the registry index. If version is provided, writes a versioned snapshot. */
  publishManifest(projectName: string, manifest: FederationManifest, version?: string): Promise<void>
  /** Update a consumer's import contract in the registry */
  syncConsumer(consumerName: string, imports: Record<string, string[]>): Promise<void>
}

/**
 * Create a federated registry that reads/writes:
 * - `<dir>/<project>/manifest.json` for manifests
 * - `<dir>/registry.json` for the central index
 */
export function createFederatedRegistry(registryDir: string): FederatedRegistryWriter {
  const registryJsonPath = join(registryDir, 'registry.json')

  return {
    async readManifest(projectName: string): Promise<FederationManifest> {
      const manifestPath = join(registryDir, projectName, 'manifest.json')
      const content = await readFile(manifestPath, 'utf-8')
      const manifest = JSON.parse(content) as FederationManifest
      if (
        !manifest || typeof manifest !== 'object' || !('schema' in manifest) || !('name' in manifest) ||
        !('elements' in manifest)
      ) {
        throw new Error(
          `Invalid manifest in ${manifestPath}: missing required fields (schema, name, elements).`,
        )
      }
      if (manifest.schema !== 'likec4/federation/v1') {
        throw new Error(
          `Unsupported manifest schema "${manifest.schema}" in ${manifestPath}. Expected "likec4/federation/v1".`,
        )
      }
      return manifest
    },

    async readRegistry(): Promise<FederationRegistry> {
      try {
        const content = await readFile(registryJsonPath, 'utf-8')
        const registry = JSON.parse(content) as FederationRegistry
        if (!registry || typeof registry !== 'object' || !('schema' in registry)) {
          throw new Error(
            `Invalid registry JSON in ${registryJsonPath}: missing required "schema" field.`,
          )
        }
        if (registry.schema !== 'likec4/registry/v1') {
          throw new Error(
            `Unsupported registry schema "${registry.schema}". Expected "likec4/registry/v1".`,
          )
        }
        return registry
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
          return { schema: 'likec4/registry/v1', providers: {}, consumers: {} }
        }
        throw err
      }
    },

    /**
     * Publish a manifest and update the registry index.
     * If version is provided, writes a versioned snapshot alongside the latest pointer.
     * Not safe for concurrent writes — callers must ensure sequential access.
     * This is acceptable for the current CLI use case where operations are sequential commands.
     */
    async publishManifest(projectName: string, manifest: FederationManifest, version?: string): Promise<void> {
      const manifestDir = join(registryDir, projectName)
      await mkdir(manifestDir, { recursive: true })

      const content = JSON.stringify(manifest, null, 2) + '\n'

      // Always write the latest manifest
      const manifestPath = join(manifestDir, 'manifest.json')
      await writeFile(manifestPath, content, 'utf-8')

      // If versioned, also write a versioned snapshot
      if (version) {
        const versionedPath = join(manifestDir, `${version}.json`)
        await writeFile(versionedPath, content, 'utf-8')
      }

      const registry = await this.readRegistry()
      const existing = registry.providers[projectName]
      const entry: typeof registry.providers[string] = {
        lastPublished: new Date().toISOString(),
      }
      if (version) {
        entry.latestVersion = version
        const existingVersions = existing?.versions ?? []
        entry.versions = existingVersions.includes(version) ? existingVersions : [...existingVersions, version]
      } else if (existing) {
        // Preserve version fields from previous versioned publishes
        if (existing.latestVersion) {
          entry.latestVersion = existing.latestVersion
        }
        if (existing.versions) {
          entry.versions = existing.versions
        }
      }
      registry.providers[projectName] = entry
      await writeFile(registryJsonPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8')
    },

    /**
     * Update a consumer's import contract in the registry.
     * Not safe for concurrent writes — callers must ensure sequential access.
     */
    async syncConsumer(consumerName: string, imports: Record<string, string[]>): Promise<void> {
      const registry = await this.readRegistry()
      registry.consumers[consumerName] = { imports }
      await writeFile(registryJsonPath, JSON.stringify(registry, null, 2) + '\n', 'utf-8')
    },
  }
}
