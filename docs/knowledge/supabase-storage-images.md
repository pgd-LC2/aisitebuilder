# Supabase Storage 图片优化

## 概述

Supabase Storage 提供图片转换和优化功能，可以在获取图片时动态调整大小和优化。此功能需要 Pro Plan 及以上。

## 使用方法

### 获取优化后的公开 URL

```typescript
supabase.storage.from('bucket').getPublicUrl('image.jpg', {
  transform: {
    width: 500,
    height: 600,
  },
})
```

### 创建带转换选项的签名 URL

```typescript
supabase.storage.from('bucket').createSignedUrl('image.jpg', 60000, {
  transform: {
    width: 200,
    height: 200,
  },
})
```

### 下载优化后的图片

```typescript
supabase.storage.from('bucket').download('image.jpg', {
  transform: {
    width: 800,
    height: 300,
  },
})
```

## 转换选项

| 参数 | 说明 |
|------|------|
| `width` | 宽度（1-2500） |
| `height` | 高度（1-2500） |
| `quality` | 质量（20-100，默认 80） |
| `resize` | 调整模式：`cover`（默认）、`contain`、`fill` |
| `format` | 格式：`origin` 保持原格式 |

## 自动优化

使用图片转换 API 时，Storage 会自动检测客户端支持的最佳格式（如 WebP）并返回优化后的图片。

## 限制

- 宽高必须在 1-2500 之间
- 图片大小不能超过 25MB
- 图片分辨率不能超过 50MP

## 头像图片优化示例

加载用户头像时应使用 transform 选项优化图片大小：

```typescript
// 获取优化后的头像 URL
const { data } = supabase.storage
  .from('avatars')
  .getPublicUrl(avatarPath, {
    transform: {
      width: 100,
      height: 100,
      resize: 'cover',
    },
  });
```
