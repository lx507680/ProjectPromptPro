[Context] 我在用 {{techStack}} 项目。依赖：{{deps}}。目录结构见下方。架构分层：{{architecture}}。入口与关键文件：{{entries}}。可复用模块：{{reusableList}}。{{modelHint}}

[Relevant] 与本次需求最相关的文件（按关键词匹配）：
{{relevantFiles}}

[Objective] {{userInput}}

[Style] 跟随现有代码风格（见 <code>）。规范：{{codeStyle}}。API/路由风格：{{apiExample}}。不要引入新的依赖，优先复用已有组件与工具函数。优先修改上方 [Relevant] 列出的文件。

[Tone] 简洁。注释只写「为什么这样写」，不写「这是什么」。

[Audience] 我自己，半年后回看也能懂。

[Response]
1. 先给完整可运行的代码（文件路径 + 完整内容）
2. 用 1 句话解释关键改动的理由
3. 列出可能的边界情况

<code-relevant>
{{relevantSnippets}}
</code-relevant>

<code>
{{codeSnippets}}
</code>
