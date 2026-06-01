# Changelog

## [1.2.5] - 2026-05-26

### Fixed

- 扫描排除 `test-out/`、`test/fixtures/`，避免测试样例污染 Prompt 上下文
- 优先采样 `src/` 代码（如 `src/extension.ts`），不再误报 Spring/Vue 测试项目
- 识别 VS Code 扩展项目技术栈

### Changed

- README / 使用说明改为更直白的中文

## [1.2.4] - 2026-05-26

### Fixed

- **根因修复**：移除 `jsonc-parser`（UMD 打包导致 `require('./impl/format')` 崩溃，扩展无法 activate，所有命令 not found）
- tsconfig 解析改用内置 JSONC  strip + `JSON.parse`
- 安装脚本自动清理旧版扩展目录，避免多版本冲突

## [1.2.3] - 2026-05-26

### Fixed

- 命令注册提前至 `activate()` 最前，避免 Webview 失败时 `project-prompt-pro.generate` 等命令不可用
- 补充 `onCommand` 激活事件，确保从命令面板触发时能正确激活扩展

## [1.2.2] - 2026-05-26

### Fixed

- 修复侧边栏 Webview 空白：Webview 提供者改为同步注册，避免扩展未完成初始化时视图无法渲染
- 移除 visibility 切换时重复注入 HTML 导致的闪烁/空白
- Webview 等待服务就绪后再加载模板数据

## [1.2.1] - 2026-05-26

### Changed

- 内置模板统一为 `[Context]` / `[Objective]` / `[Style]` / `[Response]` + `<code>` 结构化格式
- Bug 模板新增 `<error>` 块
- README 与 Marketplace 简介优化（示例输出、对比表）

## [1.2.0] - 2026-05-26

### Changed

- **模块 1**：扫描引擎重构为策略模式（`NodeScanner` / `JavaScanner` / `PythonScanner`）
- 文件索引改用 `fast-glob` + `vscode.workspace.findFiles`，替代递归 `readdir`
- **模块 2**：新增 `TokenController` 智能截断（目录树 → 代码片段 → devDependencies）
- 默认 Token 预算提升至 50K（预留 14K 给 AI 输出）
- **模块 3**：`TemplateEngine` 支持 Mustache 条件 `{{#if}}` 与循环 `{{#each}}`
- 团队 / 工作区模板支持 `TemplateWatcher` 热重载
- **模块 5**：`CursorInjector` 增强（setInput / 粘贴命令 / Markdown 降级）

## [1.1.0] - 2026-05-26

### Changed

- 统一主流程：侧边栏完整 Webview + 命令「生成项目 Prompt」
- PRD / README / 业务流程文档与产品需求对齐
- `feature` 模板按「系统角色 + 严格要求」规范重写

### Added

- 模板变量：`reusableList`、`directoryTree`、`apiExample`
- Python 依赖解析（requirements.txt / pyproject.toml）
- 团队模板：`.vscode/project-prompt-templates.json`
- Prompt 历史（最近 20 条）与上次模板/模型记忆

## [1.0.0] - 2026-05-25

首个可发布版本。

### Added

- 项目深度扫描：`package.json`、`tsconfig.json`、`pom.xml`
- 技术栈识别（Vue / React / Spring Boot 等）
- 目录结构树与架构分层推断
- 关键代码片段采样与 Token 预算截断
- 5 套内置 Prompt 模板 + 工作区模板覆盖
- 侧边栏 Webview：生成、预览、复制、发送 Cursor
- 扫描缓存（文件指纹 + Git HEAD）与变更自动失效
- 敏感文件过滤与密钥脱敏
- 模型风格前缀（GPT / Claude / DeepSeek）

### Notes

- Cursor 聊天框自动粘贴依赖编辑器 API，当前以复制 + 打开聊天面板为主。

## [0.3.0] - Week 3

- 缓存、增量失效、Token 预算、Java 解析

## [0.2.0] - Week 2

- 模板引擎、侧边栏 Webview

## [0.1.0] - Week 1

- 扫描引擎骨架
