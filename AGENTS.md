# 仓库约定

## 提交身份

本仓库使用维护者 GitHub 身份：`pepedd864 <pepedd864@gmail.com>`。
提交前检查 `git var GIT_AUTHOR_IDENT` 与 `git var GIT_COMMITTER_IDENT`。

## 提交规范

遵循 Conventional Commits，提交描述及正文使用中文。每个提交只包含一个完整目的。

## 开发约定

通过 DSH 插件接口增强回复，不修改会话内容、模型请求或 DSH 安装包。
样式与事件必须由本插件持有并在停止时清理。
运行 `npm run check` 验证真实 DSH 宿主中的渲染、交互与启停。
