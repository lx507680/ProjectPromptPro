import type { GenerationMode } from '../ai/modes/types';

export interface TemplateMeta {
  id: string;
  name: string;
  description: string;
  icon: string;
  source: 'builtin' | 'workspace';
}

export type ModelStyle = 'default' | 'gpt' | 'claude' | 'deepseek';

export interface RenderOptions {
  templateId: string;
  userInput: string;
  modelStyle: ModelStyle;
  generationMode?: GenerationMode;
  onProgress?: (message: string) => void;
}

export interface TemplateVars extends Record<string, string> {
  techStack: string;
  deps: string;
  structure: string;
  directoryTree: string;
  apiStyle: string;
  apiExample: string;
  codeStyle: string;
  userInput: string;
  modelHint: string;
  architecture: string;
  entries: string;
  codeSnippets: string;
  reusableList: string;
  relevantFiles: string;
  relevantSnippets: string;
}

/** Mustache 条件块 {{#if react}} */
export type TemplateFlags = Record<string, boolean>;

/** Mustache 循环 {{#each deps}} */
export type TemplateLists = Record<string, string[]>;

export interface TemplateRenderContext {
  vars: TemplateVars;
  flags: TemplateFlags;
  lists: TemplateLists;
}
