#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(cmd) {
  console.log(`> ${cmd}`);
  const env = { ...process.env };
  if (nodeMajor >= 18) {
    const homebrewBin = '/opt/homebrew/bin';
    if (fs.existsSync(`${homebrewBin}/node`)) {
      env.PATH = `${homebrewBin}:${env.PATH ?? ''}`;
    }
  }
  execSync(cmd, { cwd: root, stdio: 'inherit', env });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(root, file), 'utf-8'));
}

const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
if (nodeMajor < 18) {
  console.warn(`⚠️  当前 Node ${process.versions.node}，打包 vsix 需要 Node ≥ 18（推荐 20 LTS）`);
  console.warn('   测试与编译将继续；请使用 nvm use 20 后执行 npm run package\n');
}

console.log('=== Project Prompt Pro · Release Verify ===\n');

run('npm run lint');
run('npm run compile');
run('npm test');

const pkg = readJson('package.json');
const vsixName = `${pkg.name}-${pkg.version}.vsix`;
const vsixPath = path.join(root, vsixName);

if (fs.existsSync(vsixPath)) {
  fs.unlinkSync(vsixPath);
}

if (nodeMajor >= 18) {
  run('npm run package');
  if (!fs.existsSync(vsixPath)) {
    console.error(`\n❌ 未找到 ${vsixName}`);
    process.exit(1);
  }
  const sizeKb = Math.round(fs.statSync(vsixPath).size / 1024);
  console.log(`\n✅ 发布校验通过`);
  console.log(`   包: ${vsixName} (${sizeKb} KB)`);
  console.log(`   安装: code --install-extension ${vsixName}`);
} else {
  console.log('\n✅ lint / compile / test 已通过（跳过 vsix 打包，请升级 Node 后执行 npm run package）');
}
