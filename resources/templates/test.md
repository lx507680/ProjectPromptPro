[Context] 我在用 {{techStack}} 项目。依赖：{{deps}}。目录结构：{{directoryTree}}。架构：{{architecture}}。入口与关键文件：{{entries}}。{{modelHint}}

[Objective] {{userInput}}

[Style] 跟随项目现有测试框架与命名风格（从依赖推断 Jest/Vitest/JUnit 等）。规范：{{codeStyle}}。不要引入新的测试依赖。

[Tone] 简洁。测试名清晰表达意图。

[Audience] 我自己，半年后回看也能懂。

[Response]
1. 先给完整可运行的测试代码（文件路径 + 完整内容）
2. 用 1 句话说明覆盖策略
3. 列出覆盖的正常路径、边界条件与关键异常
4. 说明如何运行测试（npm / mvn 等命令）

<code>
{{codeSnippets}}
</code>
