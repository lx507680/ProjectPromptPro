const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const ctx = esbuild.context({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
});

async function main() {
  const context = await ctx;
  if (watch) {
    await context.watch();
    console.log('[esbuild] watching...');
  } else {
    await context.rebuild();
    await context.dispose();
    console.log('[esbuild] build done');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
