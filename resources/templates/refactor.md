[Context] 我在用 {{techStack}} 项目。依赖：{{deps}}。目录结构：{{directoryTree}}。架构分层：{{architecture}}。入口与关键文件：{{entries}}。{{modelHint}}

[Objective] {{userInput}}

[Style] 跟随现有代码风格（见 <code>）。规范：{{codeStyle}}。API 风格：{{apiExample}}。不要引入新的依赖。

[Tone] 简洁。注释只写「为什么这样写」，不写「这是什么」。

[Audience] 我自己，半年后回看也能懂。

[Response]
1. 先给完整可运行的代码 diff（文件路径 + 完整内容）
2. 用 1 句话解释结构改动的理由
3. 简要说明重构前后差异
4. 列出需要回归测试的重点与可能的边界情况

约束：保持对外行为与 API 不变（除非我在 Objective 中明确要求变更）。

<code>
{{codeSnippets}}
</code>
