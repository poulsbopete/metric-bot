'use client'

import { useState, useRef, useEffect } from 'react'

// Helper function to format message content with clickable links and relevance scores
function formatMessageContent(content: string): React.ReactNode {
  // Split by lines and process markdown-style links
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  
  lines.forEach((line, lineIndex) => {
    // Match markdown links: [text](url) ⭐ XX%
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)\s*⭐\s*(\d+)%/g
    let lastIndex = 0
    const lineElements: React.ReactNode[] = []
    let match
    
    while ((match = linkRegex.exec(line)) !== null) {
      // Add text before the link
      if (match.index > lastIndex) {
        lineElements.push(line.substring(lastIndex, match.index))
      }
      // Add the link with relevance score
      const relevanceScore = parseInt(match[3])
      const scoreColor = relevanceScore >= 80 ? 'text-green-600 dark:text-green-400' : 
                        relevanceScore >= 60 ? 'text-yellow-600 dark:text-yellow-400' : 
                        'text-orange-600 dark:text-orange-400'
      
      lineElements.push(
        <span key={`link-wrapper-${lineIndex}-${match.index}`}>
          <a
            key={`link-${lineIndex}-${match.index}`}
            href={match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {match[1]}
          </a>
          {' '}
          <span className={`inline-flex items-center ${scoreColor} font-medium`}>
            ⭐ {relevanceScore}%
          </span>
        </span>
      )
      lastIndex = match.index + match[0].length
    }
    
    // If no links with scores found, try regular links
    if (lineElements.length === 0) {
      const regularLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g
      let regLastIndex = 0
      let regMatch
      
      while ((regMatch = regularLinkRegex.exec(line)) !== null) {
        if (regMatch.index > regLastIndex) {
          lineElements.push(line.substring(regLastIndex, regMatch.index))
        }
        lineElements.push(
          <a
            key={`link-${lineIndex}-${regMatch.index}`}
            href={regMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            {regMatch[1]}
          </a>
        )
        regLastIndex = regMatch.index + regMatch[0].length
      }
      
      if (regLastIndex < line.length) {
        lineElements.push(line.substring(regLastIndex))
      }
    } else {
      // Add remaining text after the link
      if (lastIndex < line.length) {
        lineElements.push(line.substring(lastIndex))
      }
    }
    
    // If no links found, just add the line as-is
    if (lineElements.length === 0) {
      lineElements.push(line)
    }
    
    elements.push(
      <span key={`line-${lineIndex}`}>
        {lineElements}
        {lineIndex < lines.length - 1 && <br />}
      </span>
    )
  })
  
  return <>{elements}</>
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

const DEFAULT_WELCOME =
  "Hello! I'm here to help the Elastic field engineering team sell metrics. Ask me about high-cardinality issues, cost optimization, migration strategies, or any questions about Elastic's metrics capabilities. What would you like to know?"

const DEFAULT_SUGGESTIONS = [
  "I'm using DataDog and have a metrics tag (high-cardinality) explosion. How would Elastic resolve this?",
  "How does Elastic handle high-cardinality metrics compared to Prometheus?",
  "What are the cost implications of high-cardinality metrics in Elastic?",
  "How do I migrate from DataDog metrics to Elastic?",
  "What are Elastic's key differentiators for observability metrics?",
]

export default function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: DEFAULT_WELCOME },
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [suggestedQuestions, setSuggestedQuestions] = useState<string[]>(DEFAULT_SUGGESTIONS)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Load prompt from URL (e.g. https://ela.st/prompt-metrics) for welcome message and suggestions
  useEffect(() => {
    fetch('/api/prompt')
      .then((res) => res.json())
      .then((data) => {
        if (data.welcomeMessage && data.welcomeMessage.length > 0) {
          setMessages((prev) =>
            prev.map((m, i) =>
              i === 0 && m.role === 'assistant'
                ? { ...m, content: data.welcomeMessage }
                : m
            )
          )
        }
        if (data.suggestedQuestions && Array.isArray(data.suggestedQuestions) && data.suggestedQuestions.length > 0) {
          setSuggestedQuestions(data.suggestedQuestions)
        }
      })
      .catch(() => {})
  }, [])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)

    // Add user message to chat
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }]
    setMessages(newMessages)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: newMessages.slice(0, -1).map(m => ({
            role: m.role,
            content: m.content
          }))
        }),
      })

      const data = await response.json()

      // Handle MCP response format - API route now returns content field
      let assistantMessage = ''
      if (data.content) {
        assistantMessage = data.content
      } else if (data.result?.content) {
        assistantMessage = data.result.content
      } else if (data.message) {
        assistantMessage = data.message
      } else if (data.error) {
        assistantMessage = data.content || `Error: ${data.error}. ${data.message || ''}`
      } else if (typeof data === 'string') {
        assistantMessage = data
      } else {
        assistantMessage = JSON.stringify(data)
      }

      setMessages([...newMessages, { role: 'assistant', content: assistantMessage }])
    } catch (error: any) {
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: `Sorry, I encountered an error: ${error.message}. Please try again.`
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion)
  }

  return (
    <div className="flex flex-col h-[600px] bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message, index) => (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
              }`}
            >
              <div className="whitespace-pre-wrap">
                {formatMessageContent(message.content)}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-lg px-4 py-2">
              <div className="flex space-x-2">
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested questions - always visible */}
      <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Suggested questions:</p>
        <div className="flex flex-wrap gap-2">
          {suggestedQuestions.map((question, index) => (
            <button
              key={index}
              onClick={() => handleSuggestionClick(question)}
              className="text-xs px-3 py-1 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-full text-gray-700 dark:text-gray-300 transition-colors"
            >
              {question}
            </button>
          ))}
        </div>
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-gray-700 p-4">
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about observability metrics, high-cardinality issues, migrations, or Elastic capabilities..."
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  )
}
