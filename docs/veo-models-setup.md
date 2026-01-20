# Veo Models Setup Guide

## Overview

This guide explains how to set up Gemini, Imagen, and Veo models for the Flow channel in the admin panel.

## Prerequisites

- Admin access to the system
- A Flow channel configured with valid API credentials

## Batch Import Feature

The system provides a batch import feature to quickly add all Veo models to a Flow channel.

### Image Models

The batch import will add **19 image models**:

- **Gemini 2.5 Flash** (2 models): Fast image generation
  - Landscape (16:9)
  - Portrait (9:16)

- **Gemini 3.0 Pro 1K** (5 models): High-quality image generation
  - Landscape (16:9)
  - Portrait (9:16)
  - Square (1:1)
  - 4:3
  - 3:4

- **Gemini 3.0 Pro 2K** (5 models): 2K high-definition
  - Same aspect ratios as 1K
  - Cost: 20 credits per generation

- **Gemini 3.0 Pro 4K** (5 models): 4K ultra-high-definition
  - Same aspect ratios as 1K
  - Cost: 40 credits per generation

- **Imagen 4.0** (2 models): Google Imagen
  - Landscape
  - Portrait

### Video Models

The batch import will add **16 video models**:

- **Veo 3.1 T2V Fast** (2 models): Text-to-video, latest version
- **Veo 2.1 T2V Fast** (2 models): Text-to-video
- **Veo 2.0 T2V** (2 models): Text-to-video
- **Veo 3.1 I2V Fast** (2 models): Image-to-video with keyframe support
- **Veo 2.1 I2V Fast** (2 models): Image-to-video with keyframe support
- **Veo 2.0 I2V** (2 models): Image-to-video with keyframe support
- **Veo 3.0 R2V Fast** (2 models): Multi-image reference video generation

Each video model supports:
- 10s, 15s, and 25s durations
- Landscape (16:9) and Portrait (9:16) aspect ratios

## How to Use

### Step 1: Create or Select a Flow Channel

1. Navigate to **Admin Panel > Image Channels** or **Video Channels**
2. If you don't have a Flow channel:
   - Click "Add Channel"
   - Set Type to "Flow"
   - Enter Base URL (e.g., `http://localhost:8000`)
   - Enter API Key
   - Click "Add"

### Step 2: Batch Import Models

1. Find your Flow channel in the channel list
2. Click the **purple refresh icon** (🔄) next to the channel name
3. Confirm the import dialog
4. Wait for the import to complete
5. Check the toast notification for results

### Step 3: Verify Models

1. Expand the channel by clicking the chevron icon
2. Verify that all models are listed
3. Check that models are enabled and have correct configurations

## Model Configuration

### Cost Structure

- **1K Images**: 10 credits per generation
- **2K Images**: 20 credits per generation
- **4K Images**: 40 credits per generation
- **Videos**: 
  - 10s: 100 credits
  - 15s: 150 credits
  - 25s: 250 credits

### Features

**Image Models**:
- Text-to-image: ✅
- Image-to-image: ✅
- All models support reference images

**Video Models**:
- T2V (Text-to-Video): Text prompts only
- I2V (Image-to-Video): Supports 1-2 keyframe images
- R2V (Reference-to-Video): Supports multiple reference images

## Troubleshooting

### Import Failed

If some models fail to import:
1. Check the error message in the toast notification
2. Verify that the channel's API credentials are correct
3. Ensure the channel is enabled
4. Try importing again - the system will skip already imported models

### Models Not Showing

If models don't appear after import:
1. Refresh the page
2. Check that the channel is expanded
3. Verify that models are enabled in the database

### API Errors

If you encounter API errors during generation:
1. Verify the Flow channel's Base URL is correct
2. Check that the API Key is valid
3. Ensure the model names match the API's expected format

## Manual Configuration

If you prefer to add models manually instead of using batch import:

1. Click the "+" button next to the channel
2. Fill in the model details:
   - Name: Display name (e.g., "Gemini 3.0 Pro 图像生成 (横屏)")
   - Model ID: API model name (e.g., "gemini-3.0-pro-image-landscape")
   - Description: Brief description
   - Features: Enable appropriate features
   - Aspect Ratios: Configure supported ratios
   - Cost: Set credit cost per generation
3. Click "Add"

## API Model Names Reference

### Image Models

```
gemini-2.5-flash-image-landscape
gemini-2.5-flash-image-portrait
gemini-3.0-pro-image-landscape
gemini-3.0-pro-image-portrait
gemini-3.0-pro-image-square
gemini-3.0-pro-image-four-three
gemini-3.0-pro-image-three-four
gemini-3.0-pro-image-landscape-2k
gemini-3.0-pro-image-portrait-2k
gemini-3.0-pro-image-square-2k
gemini-3.0-pro-image-four-three-2k
gemini-3.0-pro-image-three-four-2k
gemini-3.0-pro-image-landscape-4k
gemini-3.0-pro-image-portrait-4k
gemini-3.0-pro-image-square-4k
gemini-3.0-pro-image-four-three-4k
gemini-3.0-pro-image-three-four-4k
imagen-4.0-generate-preview-landscape
imagen-4.0-generate-preview-portrait
```

### Video Models

```
veo_3_1_t2v_fast_portrait
veo_3_1_t2v_fast_landscape
veo_2_1_fast_d_15_t2v_portrait
veo_2_1_fast_d_15_t2v_landscape
veo_2_0_t2v_portrait
veo_2_0_t2v_landscape
veo_3_1_i2v_s_fast_fl_portrait
veo_3_1_i2v_s_fast_fl_landscape
veo_2_1_fast_d_15_i2v_portrait
veo_2_1_fast_d_15_i2v_landscape
veo_2_0_i2v_portrait
veo_2_0_i2v_landscape
veo_3_0_r2v_fast_portrait
veo_3_0_r2v_fast_landscape
```
