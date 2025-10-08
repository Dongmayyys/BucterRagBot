# 流式对话实现：传统写法 vs AI SDK 简化写法

本文档对比两种实现流式对话的方式，帮助你理解底层原理和 SDK 的封装价值。

---

## 核心概念：Server-Sent Events (SSE)

流式对话的本质是 **SSE 协议**：服务端持续向客户端推送数据，而不是一次性返回。

```
┌─────────┐                    ┌─────────┐
│ Client  │ ──── POST ────────▶│ Server  │
│         │                    │         │
│         │◀── data: chunk1 ──│         │
│         │◀── data: chunk2 ──│         │
│         │◀── data: chunk3 ──│         │
│         │◀── data: [DONE] ──│         │
└─────────┘                    └─────────┘
```

---

## 一、服务端 API 路由对比

### 传统写法（我们当前的实现）

```typescript
// 1. 调用 LLM API，开启流式模式
const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'Qwen/Qwen3-8B',
    messages: chatMessages,
    stream: true,  // ← 关键：开启流式输出
  }),
});

// 2. 手动解析 SSE 格式
const reader = response.body.getReader();
const decoder = new TextDecoder();

const stream = new ReadableStream({
  async start(controller) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      // SSE 格式: "data: {...}\n\n"
      const lines = text.split('\n');
    
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const json = JSON.parse(line.slice(6));
          const content = json.choices?.[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(content));
          }
        }
      }
    }
    controller.close();
  },
});

return new Response(stream);
```

**你需要理解的底层知识：**

- `ReadableStream` / `WritableStream`：Web Streams API
- `getReader()` / `read()`：逐块读取响应体
- SSE 数据格式：`data: {json}\n\n`
- `TextDecoder` / `TextEncoder`：字节与字符串转换

---

### AI SDK 简化写法

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = streamText({
  model: openai('gpt-4'),
  messages: chatMessages,
});

return result.toTextStreamResponse();
```

**SDK 帮你做了什么：**

1. 自动构造 HTTP 请求
2. 自动处理 SSE 解析
3. 自动拼接 `delta.content`
4. 自动构造 `ReadableStream`
5. 自动设置响应头

> 💡 **本质**：SDK 是对传统写法的封装，让你写更少的代码。

---

## 二、客户端对比

### 传统写法（我们当前的实现）

```typescript
// 1. 发送请求
const response = await fetch('/api/chat', {
  method: 'POST',
  body: JSON.stringify({ messages }),
});

// 2. 手动读取流
const reader = response.body.getReader();
const decoder = new TextDecoder();
let fullContent = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  const chunk = decoder.decode(value, { stream: true });
  fullContent += chunk;

  // 3. 手动更新 React 状态
  setMessages(prev => 
    prev.map(msg => 
      msg.id === assistantId 
        ? { ...msg, content: fullContent } 
        : msg
    )
  );
}
```

**你需要理解的知识：**

- `fetch` API 的流式读取
- React 状态更新机制
- 闭包和异步状态同步问题

---

### AI SDK 简化写法 (useChat hook)

```typescript
import { useChat } from '@ai-sdk/react';

const { messages, sendMessage, status } = useChat({
  api: '/api/chat',
});

// 发送消息
sendMessage({ text: 'Hello!' });

// 渲染消息（自动更新）
{messages.map(msg => <div>{msg.content}</div>)}
```

**SDK 帮你做了什么：**

1. 自动管理 `messages` 状态
2. 自动处理 `fetch` 和流读取
3. 自动拼接流式内容到消息
4. 自动处理 `loading` / `error` 状态
5. 自动处理消息 ID 生成

---

## 三、数据流对比图

### 传统写法

```
┌──────────────────────────────────────────────────────────────────┐
│ 前端                                                              │
│ ┌─────────────────┐                                              │
│ │ React 组件       │                                              │
│ │                 │                                              │
│ │ 1. fetch()      │───────────────────────────────────────────┐  │
│ │ 2. reader.read()│◀──────────────────────────────────────────│  │
│ │ 3. decode()     │                                           │  │
│ │ 4. setState()   │                                           │  │
│ └─────────────────┘                                           │  │
└───────────────────────────────────────────────────────────────│──┘
                                                                │
┌───────────────────────────────────────────────────────────────│──┐
│ 后端 API                                                      ▼  │
│ ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐│
│ │ 接收请求         │───▶│ 调用 LLM API     │───▶│ 解析 SSE        ││
│ │                 │    │ (stream: true)  │    │ 构造 Stream     ││
│ └─────────────────┘    └─────────────────┘    └─────────────────┘│
└──────────────────────────────────────────────────────────────────┘
```

### AI SDK 写法

```
┌──────────────────────────────────────────────────────────────────┐
│ 前端                                                              │
│ ┌─────────────────┐                                              │
│ │ useChat()       │  ← 自动管理所有状态和网络请求                  │
│ │ - messages      │                                              │
│ │ - sendMessage   │                                              │
│ │ - status        │                                              │
│ └─────────────────┘                                              │
└──────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────│──────────────────────────────┐
│ 后端 API                          ▼                              │
│ ┌─────────────────────────────────────────────────────────────┐  │
│ │ streamText({ model, messages }).toTextStreamResponse()      │  │
│ │                                                             │  │
│ │  ← 自动处理: 请求构造、SSE 解析、流响应                        │  │
│ └─────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 四、为什么我们没用 AI SDK？

AI SDK v5 的问题：

1. **端点不兼容**：默认使用 `/v1/responses`（OpenAI 新 API），SiliconFlow 只支持 `/v1/chat/completions`
2. **角色映射问题**：`convertToModelMessages` 将 `system` 转成 `developer`，SiliconFlow 不识别

```
AI SDK v5 默认行为:
  POST https://api.siliconflow.cn/v1/responses  ← 404 Not Found

我们需要的行为:
  POST https://api.siliconflow.cn/v1/chat/completions  ← 200 OK
```

---

## 五、学习路径建议

| 阶段 | 学习内容                                                 | 目标                      |
| ---- | -------------------------------------------------------- | ------------------------- |
| 1    | Web Streams API (`ReadableStream`, `WritableStream`) | 理解流式数据的底层机制    |
| 2    | SSE 协议格式 (`data: ...\n\n`)                         | 理解服务端推送的标准格式  |
| 3    | `fetch` 的流式读取 (`response.body.getReader()`)     | 掌握客户端消费流的方法    |
| 4    | AI SDK 源码阅读                                          | 理解 SDK 如何封装这些操作 |

---

## 六、代码位置参考

| 功能                 | 文件位置                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| 后端 API（传统写法） | [route.ts](file:///c:/Users/Dongmay/.gemini/antigravity/playground/azimuthal-zodiac/web/src/app/api/chat/route.ts) |
| 前端页面（传统写法） | [page.tsx](file:///c:/Users/Dongmay/.gemini/antigravity/playground/azimuthal-zodiac/web/src/app/page.tsx)          |
