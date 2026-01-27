[根目录](../../../CLAUDE.md) > [app](../../) > [(dashboard)](../) > **workspace**

# Workspace 模块指南

## 模块职责
提供基于节点（Node-based）的可视化工作流编辑器，支持用户通过拖拽连接不同 AI 能力（文生图、图生视频、LLM 聊天）来构建复杂的生成链路。

## 核心架构
- **状态管理**: 基于 React Flow，封装于 `useNodeOperations.ts`。
- **数据流**: 节点间通过 `edges` 传递数据（如图片的 URL、提示词文本）。

## 关键逻辑实现 (`useNodeOperations.ts`)

### 1. 节点类型与初始数据
| 节点类型 | 说明 | 初始数据关键项 |
|:---|:---|:---|
| `image` | 图片生成 | `modelId`, `aspectRatio`, `status` |
| `video` | 视频生成 | `duration`, `aspectRatio`, `status` |
| `chat` | LLM 对话 | `chatModelId`, `chatMessages` |
| `prompt-template` | 提示词模板 | `templateId`, `templateOutput` |

### 2. 连接规则 (Connection Rules)
在 `handleFinishConnect` 中实现了严格的连接校验逻辑：

- **目标：视频节点 (Video)**
  - 允许来源：`image` (作为参考图), `chat` (作为提示词), `prompt-template`.
  - *注意*: 视频节点仅支持特定类型的输入流。

- **目标：图片节点 (Image)**
  - 允许来源：`image` (图生图), `chat`, `prompt-template`.
  - *约束*: 若来源也是 `image`，目标模型的 `features.supportReferenceImage` 必须为真。

- **目标：聊天节点 (Chat)**
  - 允许来源：`image` (多模态输入), `prompt-template`.

- **连接行为**:
  - **排他性**: 对于某些输入槽位（如视频的主输入），新的连接会自动替换旧的连接（`setEdgesDirty` 中的 filter 逻辑）。

## 交互细节
- **数据隔离**: 使用 `updateNodeData` 进行局部更新，避免全量渲染。
- **引用插入**: `insertCharacterMention` 支持在提示词输入框中快速插入引用标记。

## 相关文件
- `components/workspace/hooks/useNodeOperations.ts`: 核心交互逻辑。
- `types.ts`: 定义 `WorkspaceNode`, `WorkspaceEdge` 等类型。
