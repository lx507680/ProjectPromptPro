[Context] 我在用 {{techStack}} 项目。依赖：{{deps}}。目录结构：{{directoryTree}}。架构：{{architecture}}。入口与关键文件：{{entries}}。{{modelHint}}

[Objective] {{userInput}}

[Style] 文档语言与项目现有注释风格保持一致。规范：{{codeStyle}}。

[Tone] 简洁清晰。补充 WHY，而不仅是 WHAT。

[Audience] 我自己和团队，半年后回看也能懂。

[Response]
1. 输出可直接使用的文档或注释（README 片段 / Markdown 章节 / 代码内注释）
2. 公共 API 需包含：用途、参数、返回值、示例
3. 用 1 句话说明文档覆盖范围
4. 若修改代码文件，给出文件路径 + 完整内容

<code>
{{codeSnippets}}
</code>
