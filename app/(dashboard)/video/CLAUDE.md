[根目录](../../../CLAUDE.md) > [app](../../) > [(dashboard)](../) > **video**

# Video 模块指南

## 模块职责
负责 AI 视频生成的核心流程，包括：
- 文本/图片转视频 (Text/Image to Video)
- 视频 Remix (基于现有视频修改)
- 视频分镜 (Storyboard) 生成
- 任务状态轮询与结果展示

## 架构说明 (重构后)
视频页面已从单体组件重构为**模块化架构**：
- **主编排器**: `page.tsx` (负责布局与组件组装)
- **状态管理**: `lib/hooks/useVideoGeneration.ts` (核心业务逻辑)
- **UI 组件**: `components/` 目录下拆分为独立职责的小组件

## 关键文件
| 文件 | 说明 |
|:---|:---|
| `page.tsx` | 页面入口，组件树根节点 |
| `components/PromptInput.tsx` | 提示词输入与增强 |
| `components/ModelSelector.tsx` | 模型与渠道选择 |
| `components/GenerateButtons.tsx` | 生成按钮与消耗提示 |
| `../../lib/hooks/useVideoGeneration.ts` | **核心 Hook**：处理提交、状态流转 |
| `../../lib/hooks/useTaskPolling.ts` | 任务轮询逻辑 |
| `app/api/v1/videos/route.ts` | **后端接口**：处理生成请求 |

## 后端实现细节 (`api/v1/videos`)

### 1. 接口处理流程
1. **鉴权**: 提取 Bearer Token，通过 `isAuthorized` 校验权限。
2. **解析**: 支持 `multipart/form-data` (文件上传) 和 `application/json` 两种格式。
   - 自动将上传的 File 对象或 Data URL 转换为 Base64 字符串。
   - 规范化参数（如 `seconds` 限制为 10/15/25，Boolean 值转换）。
3. **模式路由**:
   - **Async Mode (默认)**: 调用 `createVideoTask`，返回 Task ID (HTTP 201)，前端需轮询。
   - **Sync Mode**: 调用 `generateVideo`，等待生成完成直接返回结果 (HTTP 200)。

### 2. 数据流
```
Frontend (Prompt/Image) -> API Route -> Normalization -> Auth Check -> sora-api (Lib) -> Provider API
```

## 常见问题
- **如何新增模型？**
  - 不修改代码，请前往 `/admin/video-channels` 后台配置。
- **轮询不更新？**
  - 检查 `lib/hooks/useTaskPolling.ts` 中的间隔设置与 API 响应。
- **上传图片限制？**
  - 接口层会自动将图片转换为 Base64，需注意 Payload 大小限制（由 Next.js body parser 配置控制）。
