/**
 * 提示词优化 API
 * 
 * 使用 LLM 流式优化视频生成提示词
 */

import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { extractTokenFromRequest, verifyToken } from '@/lib/auth';
import { LLM_CONFIG } from '@/lib/config';

// 系统提示词
const SYSTEM_PROMPT = `你是一位专业的AI视频生成提示词工程师，专门为视频生成模型优化输入提示词。

## 你的任务
将用户提供的简短描述或创意想法，转化为专业、详细、生动的视频生成提示词。

## 优化原则

1. **细节丰富**：添加场景细节、光照、氛围、颜色等描述
2. **动作明确**：描述主体的具体动作、表情、姿态
3. **镜头语言**：添加镜头运动（推、拉、摇、移、跟等）
4. **画面构图**：描述构图方式、景别（远景、全景、中景、近景、特写）
5. **风格统一**：保持整体风格一致性
6. **去掉水印相关**：不要提及水印

## 输出格式
直接输出优化后的提示词，不要添加解释或其他内容。用中文描述。

## 示例

用户输入：
"女孩跳舞"

优化输出：
"一位优雅的年轻女孩在明亮的舞台上翩翩起舞，她身穿白色连衣裙，长发随风轻轻飘动，镜头缓慢推进对准她的笑脸特写，舞台灯光璀璨，光线从上方洒落，营造出梦幻般的氛围，背景有模糊的观众身影，舞姿流畅优美，充满青春活力。"

用户输入：
"猫咪睡觉"

优化输出：
"一只橘色的英国短毛猫蜷缩在阳光斑驳的窗台上，温暖的金色阳光洒在它柔软的毛发上，猫咪闭着眼睛发出轻轻的呼噜声，镜头从侧面缓缓拉近，捕捉到它粉嫩的爪子和微微颤动的胡须，背景是窗外朦胧的城市景色，画面温馨治愈。"

请直接开始优化用户的输入。`;
export async function POST(request: NextRequest) {
  // 验证 JWT Token
  const token = extractTokenFromRequest(request);
  if (!token) {
    return NextResponse.json(
      { error: '请先登录' },
      { status: 401 }
    );
  }

  const payload = verifyToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: 'Token 已过期，请重新登录' },
      { status: 401 }
    );
  }

  try {
    const { prompt } = await request.json();

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: '请提供有效的提示词' },
        { status: 400 }
      );
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const config = new Config();
    const client = new LLMClient(config, customHeaders);

    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt.trim() }
    ];

    // 使用流式输出
    const stream = client.stream(messages, {
      model: LLM_CONFIG.model,
      temperature: LLM_CONFIG.temperature
    });

    // 创建流式响应
    const encoder = new TextEncoder();
    const streamResponse = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.content) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk.content.toString() })}\n\n`));
            }
          }
          // 发送结束信号
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
          controller.close();
        } catch (error) {
          console.error('Stream error:', error);
          controller.error(error);
        }
      }
    });

    return new Response(streamResponse, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });

  } catch (error) {
    console.error('Optimize prompt error:', error);
    return NextResponse.json(
      { error: '提示词优化失败，请重试' },
      { status: 500 }
    );
  }
}
