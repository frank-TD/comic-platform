# TTS 语音合成接入文档

## 📊 豆包 TTS 功能分析

### 核心参数

| 参数 | 类型 | 必填 | 说明 | 默认值 |
|------|------|------|------|--------|
| `uid` | string | ✅ | 用户 ID | - |
| `text` | string | ✅ | 待合成文本（≤5000字符） | - |
| `speaker` | string | ❌ | 音色 ID | `zh_female_xiaohe_uranus_bigtts` |
| `audioFormat` | string | ❌ | 音频格式 (`pcm`/`mp3`/`ogg_opus`) | `mp3` |
| `sampleRate` | number | ❌ | 采样率 (8000/16000/22050/24000/32000/44100/48000) | `24000` |
| `speechRate` | number | ❌ | 语速 (-500 ~ 500) | `0` |
| `volume` | number | ❌ | 音量 (-500 ~ 500) | `0` |
| `pitch` | number | ❌ | 音调 (-500 ~ 500) | `0` |

### 返回值

| 字段 | 类型 | 说明 |
|------|------|------|
| `audioUri` | string | 音频文件 URI（通常是临时 URL，需要转存） |
| `audioSize` | number | 音频大小（字节） |

### 音色 ID 列表（当前已配置 15 种）

#### 通用音色（BigTTS 大参数音色）
| 音色 ID | 显示名称 | 性别 |
|---------|----------|------|
| `zh_female_xiaohe_uranus_bigtts` | 小禾（女声，通用） | 女 |
| `zh_female_vv_uranus_bigtts` | Vivi（女声，中英） | 女 |
| `zh_male_m191_uranus_bigtts` | 云舟（男声） | 男 |
| `zh_male_taocheng_uranus_bigtts` | 小甜（男声） | 男 |

#### 视频配音音色（Saturn 增强音色）
| 音色 ID | 显示名称 | 性别 |
|---------|----------|------|
| `zh_male_dayi_saturn_bigtts` | 大义（男声） | 男 |
| `zh_female_mizai_saturn_bigtts` | 蜜崽（女声） | 女 |
| `zh_female_jitangnv_saturn_bigtts` | 鸡汤女（女声） | 女 |
| `zh_female_meilinvyou_saturn_bigtts` | 魅力女声 | 女 |
| `zh_female_santongyongns_saturn_bigtts` | 三通女声 | 女 |
| `zh_male_ruyayichen_saturn_bigtts` | 儒雅男声 | 男 |

#### 角色扮演音色（TOB 音色）
| 音色 ID | 显示名称 | 性别 |
|---------|----------|------|
| `saturn_zh_female_keainvsheng_tob` | 可爱女孩 | 女 |
| `saturn_zh_female_tiaopigongzhu_tob` | 调皮公主 | 女 |
| `saturn_zh_male_shuanglangshaonian_tob` | 爽朗少年 | 男 |
| `saturn_zh_male_tiancaitongzhuo_tob` | 天才同学 | 男 |
| `saturn_zh_female_cancan_tob` | 才女 | 女 |

---

## 🏗️ 预留接口架构

### 设计模式：Provider 适配器模式

```
┌─────────────────────────────────────────────────────────────┐
│                    TTS API Route                              │
│                  (src/app/api/v1/audio/voice/tts)           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    UnifiedTTSRequest                         │
│              (统一请求格式：userId, text, voice...)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 ITTSProvider 接口                            │
│  - getVoices(): TTSVoiceOption[]                            │
│  - synthesize(request): UnifiedTTSResponse                  │
│  - isConfigured(): boolean                                  │
└─────────────────────────────────────────────────────────────┘
                    ▲           ▲           ▲
                    │           │           │
        ┌───────────┴───┐ ┌─────┴─────┐ ┌───┴───────────┐
        │DoubaoTTSProvider│ │AliyunTTS │ │TencentTTS     │
        │   (已实现)      │ │Provider  │ │Provider       │
        │                 │ │(预留)    │ │(预留)         │
        └─────────────────┘ └───────────┘ └───────────────┘
```

### 核心文件结构

```
src/lib/providers/
├── base.ts          # 接口定义 (ITTSProvider)
├── tts-provider.ts  # TTS Provider 实现（豆包 + 预留扩展）
└── factory.ts       # Provider 工厂函数
```

### 接口定义

```typescript
interface ITTSProvider {
  readonly type: TTSProviderType;
  readonly name: string;
  
  // 获取该提供商支持的所有音色
  getVoices(): TTSVoiceOption[];
  
  // 执行语音合成
  synthesize(request: UnifiedTTSRequest): Promise<UnifiedTTSResponse>;
  
  // 检查配置是否有效
  isConfigured(): boolean;
}
```

---

## 🔧 接入配置

### 环境变量

豆包 TTS SDK 会自动读取以下环境变量（通过 `Config` 类）：

```bash
# .env 或 .env.production
COZE_API_KEY=your_api_key
# 或
DOUBAO_API_KEY=your_api_key
# 或
TTS_API_KEY=your_api_key
```

### 状态说明

| 状态 | 说明 |
|------|------|
| ✅ 已实现 | 豆包 TTS Provider，代码已完成 |
| 🔧 预留 | 接口已定义，需要实现具体 Provider |

---

## 📝 扩展新 TTS 提供商

当需要接入新的 TTS 提供商（如阿里云、腾讯云）时，只需：

1. **创建新的 Provider 类**：

```typescript
// src/lib/providers/aliyun-tts.ts
export class AliyunTTSProvider implements ITTSProvider {
  readonly type: TTSProviderType = 'aliyun';
  readonly name = '阿里云 TTS';
  
  getVoices(): TTSVoiceOption[] {
    // 返回阿里云支持的音色列表
  }
  
  async synthesize(request: UnifiedTTSRequest): Promise<UnifiedTTSResponse> {
    // 调用阿里云 TTS API
  }
  
  isConfigured(): boolean {
    return !!process.env.ALIYUN_TTS_KEY;
  }
}
```

2. **更新工厂函数**：

```typescript
// src/lib/providers/factory.ts
export function getTTSProvider(type: TTSProviderType): ITTSProvider {
  switch (type) {
    case 'doubao':
      return new DoubaoTTSProvider();
    case 'aliyun':  // 新增
      return new AliyunTTSProvider();
    default:
      throw new Error(`不支持的 TTS 提供商: ${type}`);
  }
}
```

3. **根据音色 ID 自动选择 Provider**：

```typescript
// 自动根据音色 ID 选择对应的 Provider
export function getProviderByVoice(voiceId: string): ITTSProvider {
  if (voiceId.includes('bigtts') || voiceId.includes('tob')) {
    return new DoubaoTTSProvider();
  }
  // 可以扩展其他判断逻辑
  return new DoubaoTTSProvider();
}
```

---

## ⚠️ 注意事项

1. **音频 URL 有效期**：豆包 TTS 返回的 `audioUri` 通常是临时 URL，需要及时转存到对象存储

2. **字数限制**：单次合成文本不超过 5000 字符，超长文本需要分段处理

3. **音色选择**：不同提供商的音色 ID 不兼容，切换 Provider 时需要更新前端音色列表

4. **Mock 模式**：当 Provider 未配置时，系统会自动降级到 Mock 模式，返回示例音频
