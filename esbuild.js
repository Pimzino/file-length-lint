const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

// Make sure the output directories exist
if (!fs.existsSync('out')) {
  fs.mkdirSync('out', { recursive: true });
}
if (!fs.existsSync('server/out')) {
  fs.mkdirSync('server/out', { recursive: true });
}

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

  // Build the server with TypeScript compiler
  console.log('Building server with tsc...');
  try {
    execSync('tsc -p ./server/tsconfig.json', { stdio: 'inherit' });
    console.log('Server build completed successfully');
  } catch (error) {
    console.error('Error building server:', error);
    process.exit(1);
  }

  if (watch) {
    // In watch mode, start the extension watcher
    await extensionCtx.watch();

    // For the server, we'll use tsc watch mode
    console.log('Starting server watch mode...');
    try {
      execSync('tsc -w -p ./server/tsconfig.json', { stdio: 'inherit' });
    } catch (error) {
      console.error('Error in server watch mode:', error);
    }
  } else {
    await extensionCtx.rebuild();
    await extensionCtx.dispose();
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
