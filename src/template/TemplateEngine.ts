/**
 * Mustache 风格模板引擎：变量、条件、循环。
 */
export class TemplateEngine {
  render(
    template: string,
    vars: Record<string, string>,
    flags: Record<string, boolean> = {},
    lists: Record<string, string[]> = {},
  ): string {
    let result = template;
    result = this.renderLoops(result, lists);
    result = this.renderConditionals(result, flags);
    result = this.renderVariables(result, vars);
    return result;
  }

  private renderVariables(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const value = vars[key];
      if (value === undefined) {
        return `[未识别: ${key}]`;
      }
      return value;
    });
  }

  /** {{#if react}}...{{/if}} */
  private renderConditionals(template: string, flags: Record<string, boolean>): string {
    const blockRe = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    return template.replace(blockRe, (_, key: string, body: string) => {
      return flags[key] ? body : '';
    });
  }

  /** {{#each deps}}- {{name}}@{{version}}{{/each}} — 列表项用 {{.}} 或具名占位 */
  private renderLoops(template: string, lists: Record<string, string[]>): string {
    const blockRe = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
    return template.replace(blockRe, (_, key: string, body: string) => {
      const items = lists[key] ?? [];
      if (items.length === 0) {
        return '';
      }
      return items
        .map((item) => body.replace(/\{\{\.\}\}/g, item).replace(/\{\{item\}\}/g, item))
        .join('');
    });
  }
}
