[根目录](../../CLAUDE.md) > [app](../) > **admin**

# Admin 管理后台指南

## 模块职责
系统核心配置与管理中心，控制用户权限、模型计费、渠道路由及系统公告。

## 目录结构
- `users/`: 用户列表、余额管理、封禁/解封。
- `models/`: 全局模型定义（基础元数据）。
- `video-channels/`: 视频生成渠道配置（价格、供应商、模型映射）。
- `image-channels/`: 图像生成渠道配置。
- `tokens/`: Sora/Veo 等服务的 Token 池管理。
- `site/`: 站点全局配置（SEO、Logo、注册开关）。
- `announcement/`: 系统公告发布。
- `generations/`: 生成记录审计。

## 关键接口
所有管理端接口位于 `app/api/admin/` 下：
- `GET /api/admin/stats`: 仪表盘统计数据。
- `POST /api/admin/video-channels`: 更新视频渠道配置。
- `POST /api/admin/users/[id]`: 修改用户状态。

## 权限控制与鉴权
### 1. 页面级保护 (`layout.tsx`)
- 强制登录检查 (`getServerSession`)。
- **角色白名单**：仅允许 `admin` (超级管理员) 和 `moderator` (协管员) 访问。
- 非法访问会重定向至首页 `/` 或登录页 `/login`。

### 2. Session 策略 (`lib/auth.ts`)
- **实时性**：`session` callback 每次被调用时，都会触发 `getUserById` 查询数据库。
- **强制登出**：如果发现用户字段 `disabled: true`，会立即返回 null session，强制前端登出。
- **余额同步**：不在 Token 中缓存余额，每次读取最新值，防止计费不一致。

## 开发注意
- **安全性**: 修改任何 Admin 页面或 API 时，必须再次确认权限校验逻辑存在。
- **数据一致性**: 修改渠道配置会实时影响用户计费，需谨慎操作。
