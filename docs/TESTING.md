# 测试指南

## 自动化测试

```bash
npm test              # 单元 + fixtures 集成测试
npm run verify        # lint + compile + test + 打 vsix 包
```

### 覆盖范围

| 套件 | 路径 | 说明 |
|------|------|------|
| 统一运行器 | `test/runner.ts` | TemplateEngine、TokenBudget、PomXml、Vue/React/Java fixtures |

Fixtures 位于 `test/fixtures/`。

---

## 手工测试清单（发布前）

在 VS Code / Cursor 中 **F5** 启动扩展，逐项勾选。

### 通用

- [ ] 活动栏出现 **Project Prompt Pro** 图标
- [ ] 侧边栏可打开，模板下拉含 5 项
- [ ] **Rescan Project** 后输出通道有 JSON 上下文
- [ ] **Generate Prompt** 生成内容并复制成功
- [ ] **Copy Last Prompt** 可用
- [ ] **Clear Scan Cache** 后二次扫描耗时增加（非缓存）

### Vue 项目

- [ ] `techStack` 含 Vue、Vite（或同类）
- [ ] 目录树含 `src/`、`components` 或 `views`
- [ ] 生成「开发新功能」模板含 `{{userInput}}` 替换结果

### React 项目

- [ ] 识别 React 18
- [ ] 入口 `main.tsx` / `index.tsx` 出现在 entries

### Java / Spring Boot

- [ ] `pom.xml` 被解析，技术栈含 Spring Boot
- [ ] `Application.java` 被标为 entry
- [ ] API 风格含 Controller 相关描述

### Token 与缓存

- [ ] 侧边栏 Token 条在生成后更新
- [ ] `projectPromptPro.maxTokens` 调小后 Prompt 出现截断提示
- [ ] 未改文件时二次扫描显示缓存命中

### 安全

- [ ] 项目根目录 `.env` 不出现在代码片段中
- [ ] `sanitizeSecrets: true` 时含 `password=` 的文件内容被遮蔽

### Cursor 集成

- [ ] **发送 Cursor** 至少完成复制；若环境支持则打开聊天面板

---

## 本地安装 VSIX

```bash
npm run verify
code --install-extension project-prompt-pro-1.0.0.vsix
```

Cursor：

```bash
cursor --install-extension project-prompt-pro-1.0.0.vsix
```
