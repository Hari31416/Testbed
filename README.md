# Testbed

A high-performance, client-only playground for testing and probing OpenAI-compatible large language models (LLMs). Bring your own API keys, stream completions, test multi-tool function calling, inspect reasoning traces, and evaluate vision models directly in your browser with zero middleman servers.

## Features

- **Client-only BYOK (Bring Your Own Key)**: API keys and credentials are stored strictly inside your browser via local IndexedDB and never transmitted to any third-party intermediary.
- **OpenAI-Compatible Providers**: Connect to Ollama, Groq, OpenRouter, Together AI, LM Studio, vLLM, or any custom base URL with flexible header configuration.
- **Streaming & Performance Telemetry**: Real-time response streaming with live token duration timing and generation stats.
- **Multi-Tool Function Calling**: Built-in test tools (calculator, weather + time, instruction follower) to benchmark model reasoning and tool-calling reliability.
- **Vision Probing**: Upload or drag-and-drop images directly into the prompt composer to test multimodal capabilities.
- **Reasoning Trace Inspection**: Dedicated collapsible reasoning trace view with optional prompt strip-reasoning toggles for strict gateways like Groq.
- **Persistent Chat History**: Fast, local chat session storage powered by IndexedDB with instantaneous search and session switching.
- **Offline & PWA Ready**: Includes web application manifest and icons for installation on desktop and mobile home screens.

## Zero Server Requirement

Testbed is a 100% static client-side web application:

- **No Backend Server**: There is no Node.js server, Python backend, proxy, or container required to run the application in production.
- **Direct Browser-to-Model Communication**: Requests are made directly from your browser's fetch runtime to the target OpenAI-compatible endpoint (such as Ollama, Groq, OpenRouter, LM Studio, or your own LLM gateway).
- **Zero Intermediary Logging**: Prompts, API keys, conversation messages, and model parameters never pass through an intermediate server or analytics collector.
- **Deploy Anywhere Static**: Build outputs (`dist/`) can be hosted on any static file server, CDN, or hosting provider (e.g., Cloudflare Pages, GitHub Pages, Vercel, Netlify, or local file servers) without configuring servers or databases.

## Tech Stack

- **Framework**: React 19 + Vite 8
- **Language**: TypeScript with strict mode
- **Styling**: Tailwind CSS v4 with bespoke editorial scientific theme
- **Model Client**: Vercel AI SDK (`ai` and `@ai-sdk/openai-compatible`)
- **Local Database**: Dexie (IndexedDB wrapper)
- **Icons**: Lucide React and custom SVG assets

## Getting Started

### Prerequisites

- Node.js 20 or higher
- `pnpm` package manager

### Installation

Clone the repository and install dependencies:

```bash
pnpm install
```

### Development

Run the local development server:

```bash
pnpm dev
```

The application will start on `http://localhost:5173`.

### Production Build

Create an optimized production bundle:

```bash
pnpm build
```

Preview the production build locally:

```bash
pnpm preview
```
