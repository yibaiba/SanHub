# Design Document

## Overview

本设计文档描述如何在前端管理后台中更新 Flow 渠道的 Veo 图像和视频生成模型配置。系统将支持 Gemini 2.5/3.0、Imagen 4.0 图像生成模型，以及 Veo 2.0/2.1/3.1 视频生成模型（包括 T2V、I2V、R2V 三种类型）。

设计采用数据驱动的方式，通过配置数据结构来定义所有模型，然后在管理后台页面中批量创建或更新这些模型配置。

## Architecture

系统架构保持现有的三层结构：

1. **数据层** - 使用现有的 `image_channels`、`image_models`、`video_channels`、`video_models` 数据库表
2. **API 层** - 使用现有的 `/api/admin/image-channels`、`/api/admin/image-models`、`/api/admin/video-channels`、`/api/admin/video-models` 接口
3. **UI 层** - 在 `app/admin/image-channels/page.tsx` 和 `app/admin/video-channels/page.tsx` 中添加批量导入功能

不需要修改数据库 schema 或 API 接口，只需要在 UI 层添加批量导入功能。

## Components and Interfaces

### 1. Model Configuration Data Structure

定义标准化的模型配置数据结构：

```typescript
// Image Model Configuration
interface ImageModelConfig {
  name: string;
  apiModel: string;
  description: string;
  features: {
    textToImage: boolean;
    imageToImage: boolean;
    upscale: boolean;
    matting: boolean;
    multipleImages: boolean;
    imageSize: boolean;
  };
  aspectRatios: string[];
  imageSizes?: string[];
  resolutions: Record<string, string | Record<string, string>>;
  defaultAspectRatio: string;
  defaultImageSize?: string;
  costPerGeneration: number;
  sortOrder: number;
  enabled: boolean;
  highlight: boolean;
}

// Video Model Configuration
interface VideoModelConfig {
  name: string;
  apiModel: string;
  description: string;
  features: {
    textToVideo: boolean;
    imageToVideo: boolean;
    videoToVideo: boolean;
    supportStyles: boolean;
  };
  aspectRatios: Array<{ value: string; label: string }>;
  durations: Array<{ value: string; label: string; cost: number }>;
  defaultAspectRatio: string;
  defaultDuration: string;
  sortOrder: number;
  enabled: boolean;
  highlight: boolean;
}
```

### 2. Batch Import Component

在管理后台页面中添加批量导入按钮和逻辑：

```typescript
// Component structure
const BatchImportButton = () => {
  const handleBatchImport = async () => {
    // 1. Show confirmation dialog
    // 2. Iterate through predefined model configs
    // 3. Call API to create/update models
    // 4. Show progress and results
  };
  
  return <button onClick={handleBatchImport}>批量导入 Veo 模型</button>;
};
```

### 3. Model Configuration Constants

创建配置常量文件来存储所有模型定义：

```typescript
// constants/veo-models.ts
export const VEO_IMAGE_MODELS: ImageModelConfig[] = [
  // Gemini 2.5 Flash models
  {
    name: 'Gemini 2.5 Flash 图像生成 (横屏)',
    apiModel: 'gemini-2.5-flash-image-landscape',
    // ... other config
  },
  // ... more models
];

export const VEO_VIDEO_MODELS: VideoModelConfig[] = [
  // Veo 3.1 T2V models
  {
    name: 'Veo 3.1 文生视频 Fast (横屏)',
    apiModel: 'veo_3_1_t2v_fast_landscape',
    // ... other config
  },
  // ... more models
];
```

## Data Models

### Image Models Configuration

根据 API 文档，定义以下图像模型：

**Gemini 2.5 Flash 系列** (2 个模型):
- `gemini-2.5-flash-image-landscape` - 横屏 16:9
- `gemini-2.5-flash-image-portrait` - 竖屏 9:16

**Gemini 3.0 Pro 系列** (15 个模型):
- 基础版本 (5 个): landscape, portrait, square, four-three, three-four
- 2K 版本 (5 个): 同上比例 + 2K 后缀
- 4K 版本 (5 个): 同上比例 + 4K 后缀

**Imagen 4.0 系列** (2 个模型):
- `imagen-4.0-generate-preview-landscape` - 横屏
- `imagen-4.0-generate-preview-portrait` - 竖屏

### Video Models Configuration

**Veo 3.1 T2V Fast** (2 个模型):
- `veo_3_1_t2v_fast_portrait` - 竖屏，文生视频
- `veo_3_1_t2v_fast_landscape` - 横屏，文生视频

**Veo 2.1 T2V Fast** (2 个模型):
- `veo_2_1_fast_d_15_t2v_portrait` - 竖屏，文生视频
- `veo_2_1_fast_d_15_t2v_landscape` - 横屏，文生视频

**Veo 2.0 T2V** (2 个模型):
- `veo_2_0_t2v_portrait` - 竖屏，文生视频
- `veo_2_0_t2v_landscape` - 横屏，文生视频

**Veo 3.1 I2V Fast** (2 个模型):
- `veo_3_1_i2v_s_fast_fl_portrait` - 竖屏，图生视频（首尾帧）
- `veo_3_1_i2v_s_fast_fl_landscape` - 横屏，图生视频（首尾帧）

**Veo 2.1 I2V Fast** (2 个模型):
- `veo_2_1_fast_d_15_i2v_portrait` - 竖屏，图生视频（首尾帧）
- `veo_2_1_fast_d_15_i2v_landscape` - 横屏，图生视频（首尾帧）

**Veo 2.0 I2V** (2 个模型):
- `veo_2_0_i2v_portrait` - 竖屏，图生视频（首尾帧）
- `veo_2_0_i2v_landscape` - 横屏，图生视频（首尾帧）

**Veo 3.0 R2V Fast** (2 个模型):
- `veo_3_0_r2v_fast_portrait` - 竖屏，多图生成视频
- `veo_3_0_r2v_fast_landscape` - 横屏，多图生成视频

### Resolution Mapping

**图像模型分辨率映射**:

对于不支持分辨率选择的模型（Gemini 2.5 Flash, Imagen 4.0）:
```typescript
{
  '16:9': '1792x1024',
  '9:16': '1024x1792',
  '1:1': '1024x1024',
  '4:3': '1024x768',
  '3:4': '768x1024'
}
```

对于支持分辨率选择的模型（Gemini 3.0 Pro）:
```typescript
{
  '1K': {
    '16:9': '1792x1024',
    '9:16': '1024x1792',
    '1:1': '1024x1024',
    '4:3': '1024x768',
    '3:4': '768x1024'
  },
  '2K': {
    '16:9': '2560x1440',
    '9:16': '1440x2560',
    '1:1': '2048x2048',
    '4:3': '2048x1536',
    '3:4': '1536x2048'
  },
  '4K': {
    '16:9': '3840x2160',
    '9:16': '2160x3840',
    '1:1': '4096x4096',
    '4:3': '4096x3072',
    '3:4': '3072x4096'
  }
}
```

### Cost Configuration

**图像生成积分消耗**:
- 基础版本 (1K): 10 积分
- 2K 版本: 20 积分
- 4K 版本: 40 积分

**视频生成积分消耗** (按时长):
- 10 秒: 100 积分
- 15 秒: 150 积分
- 25 秒: 250 积分

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Model Configuration Completeness

*For any* model configuration in the predefined list, when imported into the system, all required fields (name, apiModel, features, aspectRatios, resolutions, defaults) should be present and valid.

**Validates: Requirements 1.1, 1.6, 2.5, 3.5, 4.4, 7.1, 7.2, 7.4, 7.5**

### Property 2: Resolution Mapping Consistency

*For any* image model with imageSize feature enabled, the resolutions map should contain entries for all imageSizes, and each size should have entries for all aspectRatios.

**Validates: Requirements 1.4, 7.3, 7.5**

### Property 3: API Model Key Uniqueness

*For any* two models within the same channel, their apiModel keys should be different to avoid conflicts.

**Validates: Requirements 1.6, 2.5, 3.5, 4.4**

### Property 4: Default Value Validity

*For any* model configuration, the defaultAspectRatio should exist in aspectRatios list, and if imageSize is enabled, defaultImageSize should exist in imageSizes list.

**Validates: Requirements 7.4, 7.5**

### Property 5: Feature Flag Consistency

*For any* T2V video model, textToVideo should be true and imageToVideo should be false; for any I2V or R2V model, both textToVideo and imageToVideo should be true.

**Validates: Requirements 2.4, 3.4, 4.2, 7.2**

### Property 6: Cost Configuration Validity

*For any* model configuration, costPerGeneration (for images) or duration costs (for videos) should be positive numbers.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**

### Property 7: Naming Convention Consistency

*For any* model in the same series (e.g., Veo 3.1 T2V), the naming pattern should be consistent and include key information (version, type, orientation).

**Validates: Requirements 5.1, 5.2, 5.3**

## Error Handling

### Import Errors

1. **Network Errors**: Retry failed API calls up to 3 times with exponential backoff
2. **Validation Errors**: Show detailed error message indicating which model failed and why
3. **Partial Success**: If some models import successfully but others fail, show summary of successes and failures
4. **Duplicate Models**: Check if model with same apiModel already exists, offer to update or skip

### User Feedback

1. **Progress Indicator**: Show progress bar during batch import (e.g., "Importing 5/19 models...")
2. **Success Summary**: Display count of successfully imported models
3. **Error Details**: List failed models with specific error messages
4. **Rollback Option**: Offer to delete newly created models if user cancels mid-import

## Testing Strategy

### Unit Tests

1. **Configuration Validation**: Test that all model configurations have required fields
2. **Resolution Mapping**: Test resolution mapping logic for different model types
3. **Cost Calculation**: Test cost configuration for different resolutions and durations
4. **API Payload Generation**: Test that generated API payloads match expected format

### Property-Based Tests

使用 property-based testing 验证配置的正确性：

1. **Property 1 Test**: Generate random model configs and verify all required fields are present
2. **Property 2 Test**: For models with imageSize, verify resolution map completeness
3. **Property 3 Test**: Verify no duplicate apiModel keys within same channel
4. **Property 4 Test**: Verify default values exist in their respective lists
5. **Property 5 Test**: Verify feature flags match model type (T2V vs I2V vs R2V)
6. **Property 6 Test**: Verify all costs are positive numbers
7. **Property 7 Test**: Verify naming patterns are consistent within model series

### Integration Tests

1. **Batch Import Flow**: Test complete batch import process from button click to success
2. **API Integration**: Test that created models can be retrieved via API
3. **UI Display**: Test that imported models display correctly in the admin panel
4. **Model Usage**: Test that imported models can be used for actual generation requests

### Manual Testing

1. **Visual Verification**: Manually verify model names and descriptions are clear and accurate
2. **Sort Order**: Verify models appear in logical order in the UI
3. **Feature Flags**: Verify correct features are enabled/disabled for each model type
4. **Cost Display**: Verify costs are displayed correctly in the UI
