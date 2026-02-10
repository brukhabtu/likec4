import type * as yargs from 'yargs'
import { path } from '../options'
import { buildHandler } from './build'
import { checkHandler } from './check'
import { publishHandler } from './publish'
import { syncHandler } from './sync'

const version = {
  alias: 'v',
  type: 'string',
  desc: 'semver version for the manifest (e.g. "1.0.0")',
  nargs: 1,
} as const satisfies yargs.Options

const federationCmd = (yargs: yargs.Argv) => {
  return yargs
    .command({
      command: 'federation <command>',
      describe: 'Manage federation manifests and registry',
      builder: yargs =>
        yargs
          .command({
            command: 'build [path]',
            describe: 'Build a federation manifest and output to stdout or file',
            builder: yargs =>
              yargs
                .positional('path', path)
                .option('version', version)
                .option('output', {
                  alias: 'o',
                  type: 'string',
                  desc: 'output file path (default: stdout)',
                  nargs: 1,
                }),
            handler: async args => {
              await buildHandler({ path: args.path, version: args.version, output: args.output })
            },
          })
          .command({
            command: 'publish [path]',
            describe: 'Build and publish a federation manifest to the registry',
            builder: yargs =>
              yargs
                .positional('path', path)
                .option('version', version),
            handler: async args => {
              await publishHandler({ path: args.path, version: args.version })
            },
          })
          .command({
            command: 'check [path]',
            describe: 'Check if publishing would break any consumers (dry-run)',
            builder: yargs =>
              yargs
                .positional('path', path)
                .option('version', version),
            handler: async args => {
              await checkHandler({ path: args.path, version: args.version })
            },
          })
          .command({
            command: 'sync [path]',
            describe: 'Sync consumer import contracts to the registry',
            builder: yargs =>
              yargs
                .positional('path', path),
            handler: async args => {
              await syncHandler({ path: args.path })
            },
          })
          .demandCommand(1, 'Please specify a federation subcommand'),
      handler: () => {
        // This handler is required by yargs but won't be called due to demandCommand
      },
    })
}

export default federationCmd
