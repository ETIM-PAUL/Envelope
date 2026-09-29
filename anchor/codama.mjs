// Three programs share instruction/PDA names ("initialize", "pool", ...), so each gets its own
// generated client folder rather than one combined generation — codama doesn't disambiguate
// same-named instructions across separately-defined programs, and merging them silently dropped
// two of the three `initialize` instructions the first time this was tried. Each program's own
// IDL is self-contained even where it references another's types (Anchor inlines a full copy —
// e.g. envelope_vault's IDL already carries complete `Pool`/`StakePosition` type definitions from
// its `envelope_stake` dependency), so generating separately loses nothing.
function clientConfig(idl, generatedFolder) {
  return {
    idl,
    scripts: {
      js: {
        from: '@codama/renderers-js',
        args: ['anchor/src/client/js', { generatedFolder, kitImportStrategy: 'rootOnly', syncPackageJson: false }],
      },
    },
  }
}

const configs = {
  envelopeStake: clientConfig('target/idl/envelope_stake.json', 'generated/envelopeStake'),
  envelopeVault: clientConfig('target/idl/envelope_vault.json', 'generated/envelopeVault'),
  helloWorld: clientConfig('target/idl/hello_world.json', 'generated/helloWorld'),
}

const program = process.env.CODAMA_PROGRAM
if (!program || !(program in configs)) {
  throw new Error(
    `Set CODAMA_PROGRAM to one of: ${Object.keys(configs).join(', ')} (see package.json's "codama:js" script).`,
  )
}

export default configs[program]
