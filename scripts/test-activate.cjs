/**
 * 模拟 VS Code 环境，验证 extension.js 能否正常 activate 并注册命令
 */
const Module = require('module');
const path = require('path');

const registered = [];

const vscodeMock = {
  window: {
    createOutputChannel: () => ({ appendLine: () => {}, show: () => {} }),
    createStatusBarItem: () => ({ show: () => {}, dispose: () => {} }),
    showErrorMessage: () => {},
    showWarningMessage: () => {},
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.cwd() }, name: 'test' }],
    getConfiguration: () => ({
      get: (_k, def) => def,
    }),
    createFileSystemWatcher: () => ({
      onDidChange: () => {},
      onDidCreate: () => {},
      onDidDelete: () => {},
      dispose: () => {},
    }),
  },
  commands: {
    registerCommand: (id, fn) => {
      registered.push(id);
      return { dispose: () => {} };
    },
    executeCommand: async () => {},
    getCommands: async () => [],
  },
  extensions: { getExtension: () => null },
  Uri: { file: (p) => ({ fsPath: p }) },
  StatusBarAlignment: { Left: 1 },
  EventEmitter: class {
    event = () => {};
    fire() {}
    dispose() {}
  },
  TreeItemCollapsibleState: { None: 0 },
  ThemeIcon: class {},
  ViewColumn: { One: 1, Beside: 2 },
  ProgressLocation: { Notification: 1 },
  env: { clipboard: { writeText: async () => {} } },
};

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') return vscodeMock;
  return origRequire.apply(this, arguments);
};

const extPath = path.join(__dirname, '../dist/extension.js');
const ext = require(extPath);

const subscriptions = [];
const context = {
  extensionPath: path.join(__dirname, '..'),
  extensionUri: { fsPath: path.join(__dirname, '..') },
  subscriptions,
};

try {
  ext.activate(context);
  console.log('activate() OK');
  console.log('registered commands:', registered.length);
  registered.forEach((c) => console.log(' -', c));
  const required = 'project-prompt-pro.generateProjectPrompt';
  if (registered.includes(required)) {
    console.log('\n✅ PASS:', required);
  } else {
    console.log('\n❌ FAIL: missing', required);
    process.exit(1);
  }
} catch (err) {
  console.error('activate() FAILED:', err);
  process.exit(1);
}
