# Requirements Document

## Introduction

根据最新的 API 文档，需要更新前端 Flow 渠道中的 Veo 图像与视频生成模型配置。新的 API 支持多种 Gemini 和 Imagen 图像生成模型，以及 Veo 2.0/3.0/3.1 系列视频生成模型，包括文生视频(T2V)、图生视频(I2V)和多图生成(R2V)等功能。

## Glossary

- **System**: 前端管理后台的渠道配置系统
- **Flow_Channel**: Flow 类型的渠道配置
- **Image_Model**: 图像生成模型配置
- **Video_Model**: 视频生成模型配置
- **Aspect_Ratio**: 画面比例（如 16:9, 9:16, 1:1 等）
- **Resolution**: 分辨率（如 1K, 2K, 4K）
- **T2V**: Text to Video，文生视频
- **I2V**: Image to Video，图生视频（支持首帧或首尾帧）
- **R2V**: Reference Images to Video，多图生成视频

## Requirements

### Requirement 1: 图像生成模型配置

**User Story:** 作为管理员，我想要配置 Gemini 和 Imagen 系列图像生成模型，以便用户可以使用不同的模型和分辨率生成图像。

#### Acceptance Criteria

1. WHEN 管理员访问图像渠道管理页面 THEN THE System SHALL 显示所有 Gemini 和 Imagen 模型的配置选项
2. WHEN 配置 Gemini 2.5 Flash 模型 THEN THE System SHALL 支持横屏(16:9)和竖屏(9:16)两种比例
3. WHEN 配置 Gemini 3.0 Pro 模型 THEN THE System SHALL 支持横屏(16:9)、竖屏(9:16)、正方形(1:1)、4:3 和 3:4 五种比例
4. WHEN 配置 Gemini 3.0 Pro 模型 THEN THE System SHALL 支持 1K、2K 和 4K 三种分辨率档位
5. WHEN 配置 Imagen 4.0 模型 THEN THE System SHALL 支持横屏和竖屏两种比例
6. THE System SHALL 为每个模型配置正确的 API model key
7. THE System SHALL 为每个模型配置合理的积分消耗值

### Requirement 2: 视频生成模型配置 - 文生视频(T2V)

**User Story:** 作为管理员，我想要配置 Veo 文生视频模型，以便用户可以通过文本提示词生成视频。

#### Acceptance Criteria

1. WHEN 管理员配置 Veo 3.1 T2V Fast 模型 THEN THE System SHALL 支持横屏和竖屏两种比例
2. WHEN 管理员配置 Veo 2.1 T2V Fast 模型 THEN THE System SHALL 支持横屏和竖屏两种比例
3. WHEN 管理员配置 Veo 2.0 T2V 模型 THEN THE System SHALL 支持横屏和竖屏两种比例
4. THE System SHALL 标记这些模型不支持图片上传（textToVideo: true, imageToVideo: false）
5. THE System SHALL 为每个模型配置正确的 API model key

### Requirement 3: 视频生成模型配置 - 首尾帧模型(I2V)

**User Story:** 作为管理员，我想要配置 Veo 首尾帧视频生成模型，以便用户可以上传 1-2 张图片生成视频。

#### Acceptance Criteria

1. WHEN 管理员配置 Veo 3.1 I2V Fast 模型 THEN THE System SHALL 支持横屏和竖屏两种比例
2. WHEN 管理员配置 Veo 2.1 I2V Fast 模型 THEN THE System SHALL 支持横屏和竖屏两种比例
3. WHEN 管理员配置 Veo 2.0 I2V 模型 THEN THE System SHALL 支持横屏和竖屏两种比例
4. THE System SHALL 标记这些模型支持图片上传（textToVideo: true, imageToVideo: true）
5. THE System SHALL 在模型描述中说明支持 1-2 张图片（单帧或首尾帧）
6. THE System SHALL 为每个模型配置正确的 API model key

### Requirement 4: 视频生成模型配置 - 多图生成(R2V)

**User Story:** 作为管理员，我想要配置 Veo 多图生成视频模型，以便用户可以上传多张参考图片生成视频。

#### Acceptance Criteria

1. WHEN 管理员配置 Veo 3.0 R2V Fast 模型 THEN THE System SHALL 支持横屏和竖屏两种比例
2. THE System SHALL 标记这些模型支持多图输入（textToVideo: true, imageToVideo: true）
3. THE System SHALL 在模型描述中说明支持多张参考图片
4. THE System SHALL 为每个模型配置正确的 API model key

### Requirement 5: 模型命名与组织

**User Story:** 作为管理员，我想要清晰的模型命名和组织结构，以便快速识别和管理不同的模型。

#### Acceptance Criteria

1. THE System SHALL 使用清晰的中文名称标识每个模型
2. THE System SHALL 在模型名称中包含关键信息（如版本、类型、比例）
3. THE System SHALL 按照模型系列和功能分组显示
4. THE System SHALL 为高级功能模型（如 2K、4K）添加明显标识
5. THE System SHALL 使用合理的排序顺序展示模型

### Requirement 6: 积分消耗配置

**User Story:** 作为管理员，我想要为不同的模型配置合理的积分消耗，以便控制系统资源使用。

#### Acceptance Criteria

1. THE System SHALL 为基础图像生成模型配置基准积分消耗
2. THE System SHALL 为 2K 分辨率模型配置更高的积分消耗
3. THE System SHALL 为 4K 分辨率模型配置最高的积分消耗
4. THE System SHALL 为视频生成模型根据时长配置积分消耗
5. THE System SHALL 允许管理员自定义每个模型的积分消耗值

### Requirement 7: 模型特性标识

**User Story:** 作为管理员，我想要正确标识每个模型的功能特性，以便前端正确展示和使用这些模型。

#### Acceptance Criteria

1. WHEN 配置图像模型 THEN THE System SHALL 正确设置 textToImage 和 imageToImage 特性
2. WHEN 配置视频模型 THEN THE System SHALL 正确设置 textToVideo 和 imageToVideo 特性
3. WHEN 配置支持分辨率选择的模型 THEN THE System SHALL 启用 imageSize 特性
4. THE System SHALL 为每个模型配置默认的画面比例
5. THE System SHALL 为支持分辨率选择的模型配置默认分辨率档位
