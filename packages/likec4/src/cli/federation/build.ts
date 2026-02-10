import { resolve } from 'node:path'
import k from 'tinyrainbow'
import { LikeC4 } from '../../LikeC4'
import { createLikeC4Logger } from '../../logger'

export async function buildHandler(args: { path: string; version?: string; output?: string }) {
  const logger = createLikeC4Logger('c4:federation')
  logger.info(k.cyan('Building federation manifest...'))

  await using likec4 = await LikeC4.fromWorkspace(args.path, {
    graphviz: 'wasm',
    watch: false,
    logger: false,
  })

  const projectId = likec4.projectsManager.defaultProjectId
  if (!projectId) {
    logger.error('No project found. Ensure a likec4.config.json exists.')
    throw new Error('No project found. Ensure a likec4.config.json exists.')
  }

  const project = likec4.projectsManager.getProject(projectId)
  const federation = project.config.federation
  if (!federation?.exports || federation.exports.length === 0) {
    logger.error('No federation exports configured in the project config.')
    throw new Error('No federation exports configured in the project config.')
  }

  const model = likec4.syncComputedModel(projectId)
  const { buildManifest } = await import('@likec4/federation')

  const manifest = buildManifest(model, federation, { version: args.version })

  const json = JSON.stringify(manifest, null, 2) + '\n'

  if (args.output) {
    const outPath = resolve(args.output)
    const { mkdir, writeFile } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    await mkdir(dirname(outPath), { recursive: true })
    await writeFile(outPath, json, 'utf-8')
    logger.info(k.green(`Manifest written to ${outPath}`))
  } else {
    process.stdout.write(json)
  }
}
