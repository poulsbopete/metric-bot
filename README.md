# Elastic Metrics Chatbot

A Next.js chatbot hosted on [Vercel](https://metric-bot.vercel.app/) that helps the **Elastic field engineering team sell Observability Metrics**. The bot’s behavior, welcome message, and suggested questions are loaded from a **prompt URL** (e.g. [https://ela.st/prompt-metrics](https://ela.st/prompt-metrics)), so you can update positioning and copy without redeploying.

## Features

- 🤖 AI-powered chatbot using Elastic's MCP endpoint
- 📄 **Prompt-from-URL** — load system prompt, welcome message, and suggested questions from a document (e.g. Google Doc)
- 💬 Interactive chat interface with suggested questions
- 🎨 Modern, responsive UI with dark mode support
- ⚡ Built with Next.js 14 and TypeScript
- 🚀 Ready for Vercel deployment

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <your-repo-url>
cd metric-bot
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` with your MCP endpoint, API key, and optional prompt URL:
```
MCP_ENDPOINT=https://ai-assistants-ffcafb.kb.us-east-1.aws.elastic.cloud/api/agent_builder/mcp
MCP_API_KEY=your-api-key-here
PROMPT_URL=https://ela.st/prompt-metrics
```
`PROMPT_URL` is the document (e.g. Google Doc) that defines the bot’s positioning and suggested questions. If unset, the default is `https://ela.st/prompt-metrics`.

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Deployment to Vercel

1. Push your code to a Git repository (GitHub, GitLab, or Bitbucket).

2. Import your project in Vercel:
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project"
   - Import your Git repository

3. Configure environment variables in Vercel:
   - Go to Project Settings → Environment Variables
   - Add `MCP_ENDPOINT`, `MCP_API_KEY`, and optionally `PROMPT_URL` (default: https://ela.st/prompt-metrics)

4. Deploy! Vercel will automatically build and deploy your application.

## Project Structure

```
metric-bot/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts      # API route for MCP communication
│   ├── globals.css           # Global styles
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Main page
├── components/
│   └── ChatInterface.tsx     # Chat UI component
├── .env.example              # Example environment variables
├── next.config.js            # Next.js configuration
├── package.json              # Dependencies
├── tailwind.config.ts        # Tailwind CSS configuration
└── tsconfig.json             # TypeScript configuration
```

## Customization

- **Prompt (behavior, welcome, suggestions)**: Set `PROMPT_URL` to a public document (e.g. Google Doc). The app fetches it on load and uses the text as the AI system context; the first paragraph is used as the welcome message and lines ending with `?` as suggested questions.
- **Chat behavior fallback**: If the URL is unavailable, the base context in `app/api/chat/route.ts` is used.
- **UI styling**: Update `app/globals.css` and `components/ChatInterface.tsx`.

## License

MIT
