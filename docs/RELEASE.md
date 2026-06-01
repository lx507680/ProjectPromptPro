# 发布指南（VS Code Marketplace）

## 前置条件

1. **Node.js** ≥ 18（推荐 20 LTS）
4. （可选）Marketplace 图标：准备 `resources/icon.png`（128×128 PNG），并在 `package.json` 增加 `"icon": "resources/icon.png"`
2. 注册 [Azure DevOps](https://dev.azure.com) 并创建 **Personal Access Token**（Marketplace: Manage）
3. 创建 Publisher：<https://marketplace.visualstudio.com/manage>

## 一键校验与打包

```bash
npm install
npm run verify
```

产物：`project-prompt-pro-1.0.0.vsix`

## 修改 Publisher

编辑 `package.json`：

```json
"publisher": "你的-publisher-id"
```

首次发布前安装 vsce 并登录：

```bash
npx vsce login <publisher-id>
```

## 发布到 Marketplace

```bash
# 预览（不实际上传）
npx vsce publish --dry-run

# 正式发布（需要 PAT 环境变量）
export VSCE_PAT=<your-token>
npm run publish
```

或手动：

```bash
npx vsce publish -p $VSCE_PAT
```

## 版本号规范

遵循 [SemVer](https://semver.org/)：

- **patch**：修复 bug
- **minor**：新功能、向后兼容
- **major**：破坏性变更

更新 `package.json` 的 `version` 与 `CHANGELOG.md`。

## 发布检查表

- [ ] `npm run verify` 通过
- [ ] `docs/TESTING.md` 手工项已勾选
- [ ] `README.md` 截图/说明与功能一致
- [ ] `CHANGELOG.md` 已更新
- [ ] `publisher` 已改为真实 ID
- [ ] 未将 `.env`、密钥提交到仓库
- [ ] `.vscodeignore` 已排除 `test/`、`docs/`、`.github/`

## 私有分发（不打 Marketplace）

将 `.vsix` 发给团队：

```bash
code --install-extension project-prompt-pro-1.0.0.vsix
```

## 常见问题

| 问题 | 处理 |
|------|------|
| `vsce` 报 engine 不兼容 | 升级 Node 或使用 `nvm use 20` |
| 包体积过大 | 检查 `.vscodeignore` 是否排除 `node_modules`、源码 |
| 扩展未激活 | 确认已打开文件夹工作区，非单文件模式 |
