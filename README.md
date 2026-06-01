# Project Prompt Pro

[![CI](https://github.com/lx507680/ProjectPromptPro/actions/workflows/ci.yml/badge.svg)](https://github.com/lx507680/ProjectPromptPro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Project Prompt Pro** 是一款 VS Code / Cursor 扩展：自动扫描你的项目（技术栈、目录结构、关键代码），结合你的一句话需求，生成结构化、可落地的 Prompt，一键复制到 Cursor、Copilot 等 AI 编程工具直接使用。

> 默认只在本地扫描项目文件；Assist / Agent 模式需自行配置 AI API Key，代码不会上传到第三方（除你配置的 AI Provider）。

---

## 它能做什么

| 能力 | 说明 |
|------|------|
| **项目扫描** | 识别 React / Vue / Spring Boot / Python / VS Code 扩展等技术栈 |
| **智能匹配** | 从需求关键词自动匹配相关文件，Prompt 更精准 |
| **模板引擎** | 内置 feature / bugfix / refactor / docs / test，支持自动选模板 |
| **三种生成模式** | 仅本地 Prompt · Assist（LLM 精炼）· Agent（MCP 多轮分析） |
| **一键输出** | 生成后自动复制；可注入 Cursor Chat |
| **团队定制** | 工作区模板、`.vscode/project-prompt-templates.json` 团队共享 |

---

## 快速开始（3 步）

1. 用 **Cursor / VS Code** 打开**整个项目文件夹**（不要只开单个文件）
2. 左侧活动栏 → **Project Prompt Pro** → 输入需求 → 选择生成模式 → **生成项目 Prompt**
3. **复制**（默认已自动复制）→ 粘贴到 Cursor 聊天框

**需求示例：**

```text
给用户登录接口加短信验证码，说明要改哪些文件
```

或使用命令面板：`Cmd+Shift+P` → `Project Prompt Pro: 生成项目 Prompt`

---

## 生成模式

| 模式 | 说明 | 是否需要 API |
|------|------|--------------|
| **仅本地 Prompt** | 扫描 + 模板 + 关键词匹配，不调 AI | 否 |
| **Assist** | 本地生成后，LLM 压缩为更精准的 Prompt | 是 |
| **Agent** | MCP 工具多轮分析，输出改造方案 + 推荐 Prompt | 是 |

侧边栏 **生成模式** 下拉框可切换；也可在设置中配置默认模式 `projectPromptPro.generationMode`。

---

## 侧边栏使用

```
Project Prompt Pro 侧边栏
├── Prompt 模板      → 选「自动识别」或指定模板
├── 生成模式         → prompt-only / assist / agent
├── 模型风格         → 影响 Prompt 措辞（GPT / Claude / DeepSeek）
├── 你的需求         → 大白话描述要做什么
├── 生成项目 Prompt  → 开始生成
├── 重新扫描         → 代码变更后刷新上下文
├── Agent 报告       → Agent 模式完成后查看分析报告
├── 复制 / 发送 Cursor
└── 标题栏图标       → AI 设置 ⚙ · MCP 设置 🖥
```

---

## 命令列表

在命令面板（`Cmd+Shift+P` / `Ctrl+Shift+P`）中搜索 **Project Prompt Pro**：

### 常用

| 命令 | 说明 |
|------|------|
| **生成项目 Prompt** | 输入需求 → 扫描 → 生成 → 自动复制 |
| **打开 Prompt 侧边栏** | 打开左侧主界面 |
| **重新扫描项目** | 强制刷新项目上下文 |
| **AI Provider 设置** | 配置 DeepSeek / OpenAI 等 API |
| **MCP Server 设置** | 配置外部 MCP 工具（Agent 模式） |
| **查看 Agent 分析报告** | 打开最近一次 Agent 报告面板 |

### 输出与集成

| 命令 | 说明 |
|------|------|
| **Copy Last Prompt** | 复制上次生成的 Prompt |
| **Send to Cursor Chat** | 尝试注入 Cursor 聊天（失败则复制） |
| **查看 Prompt 历史** | 最近 20 条生成记录 |

### 模板与高级

| 命令 | 说明 |
|------|------|
| **高级向导（分步选择）** | 不依赖 Webview 的分步流程 |
| **Open Workspace Templates** | 打开工作区自定义模板目录 |
| **编辑团队模板 JSON** | 编辑 `.vscode/project-prompt-templates.json` |
| **Show Project Context** | 查看原始扫描 JSON（调试） |

### 维护

| 命令 | 说明 |
|------|------|
| **Clear Scan Cache** | 清除扫描缓存 |
| **Reload Window (Fix Webview)** | 侧边栏异常时重载窗口 |

---

## 配置 AI（Assist / Agent）

1. 命令面板 → **AI Provider 设置**
2. 选择 Provider（如 **DeepSeek**）
3. 填写 **API Key**（存于 VS Code Secret Storage，不会写入 settings.json）
4. **测试连接** → **保存**

DeepSeek 默认：

- Base URL: `https://api.deepseek.com`
- Model: `deepseek-chat`

> 若提示「无法写入用户设置」，Reload Window 后重试；设置会保存在扩展内部存储，功能不受影响。

---

## 配置 MCP（Agent 可选增强）

Agent 内置 5 个工具（项目摘要、搜文件、读文件等）。可额外接入外部 MCP Server（如 filesystem、git）。

**方式 1 — 工作区 `.vscode/mcp.json`（推荐）**

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/你的/项目/绝对路径"]
    }
  }
}
```

**方式 2 — 命令面板 → MCP Server 设置** → 编辑 JSON 并保存

**方式 3 — 复用 Cursor 全局配置** `~/.cursor/mcp.json`（自动合并）

配置优先级：VS Code 设置 > 工作区 `mcp.json` > Cursor 全局 `mcp.json`

---

## 支持的项目类型

| 类型 | 识别内容 |
|------|----------|
| 前端 | React / Vue / Vite / TypeScript |
| Java | Spring Boot / Maven |
| Python | FastAPI / Flask（requirements / pyproject） |
| VS Code 扩展 | extension.ts + Webview + 命令 |

---

## 常见问题

**扫出来的上下文不对？**

1. 侧边栏 → **重新扫描**
2. 命令 → **Clear Scan Cache**
3. 设置 → `projectPromptPro.excludePatterns` 添加排除规则

**Agent 报错「请先配置 API Key」？**

先完成 **AI Provider 设置**，Provider 不能选「关闭」。

**侧边栏空白？**

`Reload Window (Fix Webview)` 或使用命令 **生成项目 Prompt**（不依赖 Webview）。

---

## 主要配置项

| 配置项 | 默认 | 说明 |
|--------|------|------|
| `generationMode` | `prompt-only` | 默认生成模式：`assist` / `agent` |
| `autoSelectTemplate` | `true` | 根据需求自动选 bugfix / feature 等 |
| `autoCopyOnGenerate` | `true` | 生成后自动复制 |
| `maxTokens` | `50000` | Prompt Token 预算 |
| `agent.maxSteps` | `8` | Agent 最大分析轮数 |
| `agent.openReportPanel` | `true` | Agent 完成后打开报告面板 |

完整列表：VS Code 设置 → 搜索 `projectPromptPro`

---

## 从源码安装

### 环境要求

- Node.js >= 18
- VS Code / Cursor >= 1.85

### 本地开发

```bash
git clone https://github.com/lx507680/ProjectPromptPro.git
cd ProjectPromptPro
npm install
npm run compile
```

按 **F5** 启动扩展开发宿主，或：

```bash
bash scripts/install-local.sh   # 编译 + 打包 + 安装 .vsix
```

安装后执行 **Developer: Reload Window**。

### 打包

```bash
npm run package    # 生成 project-prompt-pro-x.x.x.vsix
npm test           # 运行测试
```

---

## 项目结构

```
src/
├── extension.ts          # 入口、命令注册
├── scanner/              # 项目扫描引擎
├── matcher/              # 需求关键词 → 文件匹配
├── template/             # Prompt 模板引擎
├── services/             # Prompt 生成服务
├── ai/                   # Assist / Agent / AI Provider
├── mcp/                  # MCP 客户端与工具注册
├── webview/              # 侧边栏与设置面板
└── integration/          # 剪贴板、Cursor 注入

resources/templates/      # 内置 Prompt 模板
media/                    # Webview HTML
docs/                     # 架构、测试、发布说明（开发者）
```

更多细节见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

---

## 发布到 GitHub

本仓库：[https://github.com/lx507680/ProjectPromptPro](https://github.com/lx507680/ProjectPromptPro)

```bash
git clone git@github.com:lx507680/ProjectPromptPro.git
```

欢迎 Issue / PR。CI 会在 push 时自动运行编译与测试（见 `.github/workflows/ci.yml`）。

---

## License

[MIT](LICENSE)
