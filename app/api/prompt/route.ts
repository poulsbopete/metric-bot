import { NextResponse } from 'next/server'

const DEFAULT_PROMPT_URL = 'https://ela.st/prompt-metrics'

/** Extract plain text from HTML (e.g. Google Docs view). */
function htmlToPlainText(html: string): string {
  let text = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
  return text
}

/** Parse prompt text into welcome message and suggested questions. */
function parsePrompt(prompt: string): {
  welcomeMessage: string
  suggestedQuestions: string[]
} {
  const defaultWelcome =
    "Hello! I'm here to help the Elastic field engineering team sell metrics. Ask me about high-cardinality issues, cost optimization, migration strategies, or any questions about Elastic's metrics capabilities. What would you like to know?"
  const defaultSuggestions = [
    "I'm using DataDog and have a metrics tag (high-cardinality) explosion. How would Elastic resolve this?",
    "How does Elastic handle high-cardinality metrics compared to Prometheus?",
    "What are the cost implications of high-cardinality metrics in Elastic?",
    "How do I migrate from DataDog metrics to Elastic?",
    "What are Elastic's key differentiators for observability metrics?",
  ]

  if (!prompt || prompt.length < 10) {
    return { welcomeMessage: defaultWelcome, suggestedQuestions: defaultSuggestions }
  }

  const lines = prompt
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)

  // Use first substantial paragraph as welcome (up to first blank or first "Suggested" section)
  let welcomeMessage = defaultWelcome
  const welcomeLines: string[] = []
  for (const line of lines) {
    if (/^suggested\s+questions?/i.test(line) || /^questions?:/i.test(line)) break
    if (line.length > 20) welcomeLines.push(line)
  }
  if (welcomeLines.length > 0) {
    welcomeMessage = welcomeLines.join(' ').slice(0, 800)
    if (welcomeMessage.length < welcomeLines.join(' ').length) welcomeMessage += '…'
  }

  // Lines that look like questions (end with ?) as suggested questions
  const suggestedQuestions = lines
    .filter((l) => l.endsWith('?') && l.length > 15 && l.length < 200)
    .slice(0, 8)
  const questions =
    suggestedQuestions.length >= 2 ? suggestedQuestions : defaultSuggestions

  return { welcomeMessage, suggestedQuestions: questions }
}

export async function GET() {
  try {
    const promptUrl = process.env.PROMPT_URL || DEFAULT_PROMPT_URL

    const res = await fetch(promptUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; MetricBot/1.0; +https://metric-bot.vercel.app)',
        Accept: 'text/html,text/plain;q=0.9,*/*;q=0.8',
      },
      next: { revalidate: 60 },
    })

    if (!res.ok) {
      const fallback = parsePrompt('')
      return NextResponse.json({
        prompt: '',
        ...fallback,
        error: `Prompt URL returned ${res.status}`,
      })
    }

    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    let raw: string = await res.text()

    if (contentType.includes('text/html')) {
      raw = htmlToPlainText(raw)
    }
    // else treat as text/plain or unknown as plain text

    const trimmed = raw.trim()
    const { welcomeMessage, suggestedQuestions } = parsePrompt(trimmed)

    return NextResponse.json({
      prompt: trimmed,
      welcomeMessage,
      suggestedQuestions,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    const fallback = parsePrompt('')
    return NextResponse.json(
      {
        prompt: '',
        ...fallback,
        error: message,
      },
      { status: 200 }
    )
  }
}
