[根目录](../../../CLAUDE.md) > [app](../../) > [(dashboard)](../) > **gallery**

# Gallery 作品广场指南

## 模块状态
⚠️ **Stub / 重定向状态**

当前模块暂未承载实际业务逻辑。`page.tsx` 包含一个 `useEffect` 钩子，将所有访问 `/gallery` 的请求立即重定向至 `/image` 页面。

## 代码摘要
```tsx
// app/(dashboard)/gallery/page.tsx
useEffect(() => {
  router.replace("/image");
}, [router]);
```

## 未来规划 (待定)
如果未来启用作品广场功能：
1. 需移除重定向逻辑。
2. 对接 `lib/sora-api.ts` 中的 `getFeed` (公共流) 和 `getUserFeed` (个人流) 接口。
3. 实现公开/私有可见性过滤。
