#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

echo ">>> 编译扩展..."
npm run compile

echo ">>> 验证 activate..."
node scripts/test-activate.cjs

echo ">>> 打包 vsix..."
npm run package

VSIX=$(ls -t project-prompt-pro-*.vsix 2>/dev/null | head -1)
if [[ -z "${VSIX}" ]]; then
  echo "未找到 vsix 文件"
  exit 1
fi

resolve_cli() {
  if command -v cursor >/dev/null 2>&1; then
    command -v cursor
    return
  fi
  if command -v code >/dev/null 2>&1; then
    command -v code
    return
  fi
  # macOS：Cursor / VS Code 默认安装路径
  local candidates=(
    "/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
    "$HOME/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
    "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code"
  )
  for bin in "${candidates[@]}"; do
    if [[ -x "$bin" ]]; then
      echo "$bin"
      return
    fi
  done
  return 1
}

CLI=""
if CLI=$(resolve_cli); then
  :
else
  echo ""
  echo "未找到 cursor / code 命令行工具。"
  echo ""
  echo "方式 1 — 在 Cursor 中安装 Shell 命令："
  echo "  Cmd+Shift+P → Shell Command: Install 'cursor' command in PATH"
  echo "  然后重新运行: bash scripts/install-local.sh"
  echo ""
  echo "方式 2 — 手动安装 VSIX："
  echo "  Cursor → 扩展 → ⋯ → Install from VSIX..."
  echo "  选择: $(pwd)/${VSIX}"
  echo ""
  exit 1
fi

echo ">>> 安装 ${VSIX}（使用 ${CLI}）..."

# 清理旧版本，避免多版本冲突
for dir in "$HOME/.cursor/extensions"/project-prompt-pro.project-prompt-pro-*; do
  if [[ -d "$dir" ]]; then
    echo "    移除旧版: $(basename "$dir")"
    rm -rf "$dir"
  fi
done

"${CLI}" --install-extension "$(pwd)/${VSIX}" --force

echo ""
echo "✅ 安装完成: ${VSIX}"
echo ""
echo "下一步："
echo "  1. Cursor 中 Cmd+Shift+P → Developer: Reload Window"
echo "  2. 打开任意项目文件夹"
echo "  3. 左侧活动栏 → Project Prompt Pro → 生成 Prompt"
