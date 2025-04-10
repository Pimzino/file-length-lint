const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  // Build the extension
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    logLevel: 'warning',
    plugins: [esbuildProblemMatcherPlugin]
  });

  // Build the server
  const serverCtx = await esbuild.context({
    entryPoints: ['server/src/server.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'server/out/server.js',
    external: ['vscode', 'vscode-languageserver', 'vscode-languageserver-textdocument'],
    logLevel: 'warning',
    plugins: [esbuildProblemMatcherPlugin]
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), serverCtx.watch()]);
  } else {
    await Promise.all([extensionCtx.rebuild(), serverCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), serverCtx.dispose()]);
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: 'esbuild-problem-matcher',

  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd(result => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location == null) return;
        console.error(`    ${location.file}:${location.line}:${location.column}:`);
      });
      console.log('[watch] build finished');
    });
  }
};

main().catch(e => {
  console.error(e);
  process.exit(1);
});
