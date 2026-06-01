[Context] 我在用 {{techStack}} 项目。依赖：{{deps}}。相关目录：{{directoryTree}}。架构：{{architecture}}。入口与关键文件：{{entries}}。{{modelHint}}

[Relevant] 与 Bug 描述最相关的文件：
{{relevantFiles}}

[Objective] 定位根因并修复以下 Bug，改动范围尽量小，避免无关重构。优先检查上方 [Relevant] 文件。

[Style] 跟随现有代码风格（见 <code>）。规范：{{codeStyle}}。不要引入新的依赖。

[Tone] 简洁。注释只写「为什么这样写」，不写「这是什么」。

[Audience] 我自己，半年后回看也能懂。

[Response]
1. 先列出 1～3 条可能根因，再给完整可运行的修复代码（文件路径 + 完整内容）
2. 用 1 句话解释关键改动的理由
3. 说明如何验证修复（命令或步骤）
4. 列出可能的边界情况或未覆盖场景

<error>
{{userInput}}
</error>

<code-relevant>
{{relevantSnippets}}
</code-relevant>

<code>
{{codeSnippets}}
</code>
