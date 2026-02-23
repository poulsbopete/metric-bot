import { NextRequest, NextResponse } from 'next/server'

const DEFAULT_PROMPT_URL = 'https://ela.st/prompt-metrics'

/** Fetch prompt from PROMPT_URL and return plain text for use as system context. */
async function getPromptForContext(): Promise<string> {
  const promptUrl = process.env.PROMPT_URL || DEFAULT_PROMPT_URL
  try {
    const res = await fetch(promptUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; MetricBot/1.0; +https://metric-bot.vercel.app)',
        Accept: 'text/html,text/plain;q=0.9,*/*;q=0.8',
      },
      next: { revalidate: 60 },
    })
    if (!res.ok) return ''
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    let text = await res.text()
    if (contentType.includes('text/html')) {
      text = text
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
    }
    return text.trim()
  } catch {
    return ''
  }
}

// Helper function to clean URLs by removing HTML tags
function cleanUrl(url: string): string {
  if (!url) return ''
  
  // First, try to extract a clean URL pattern before cleaning
  // This handles cases where HTML tags are embedded in the URL
  const urlPattern = /https?:\/\/[^\s<>"]+/
  const urlMatch = url.match(urlPattern)
  if (urlMatch) {
    let cleaned = urlMatch[0]
    // Remove any HTML tags that might be in the URL
    cleaned = cleaned.replace(/<[^>]*>/g, '')
    // Decode HTML entities
    cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    // Remove any remaining whitespace
    cleaned = cleaned.trim()
    
    // Validate it's a valid URL
    try {
      new URL(cleaned)
      return cleaned
    } catch {
      // If validation fails, try to fix common issues
      // Remove trailing invalid characters
      cleaned = cleaned.replace(/[<>"]+$/, '')
      try {
        new URL(cleaned)
        return cleaned
      } catch {
        // Last resort: return the cleaned string even if invalid
        return cleaned
      }
    }
  }
  
  // If no URL pattern found, try cleaning the whole string
  let cleaned = url.replace(/<[^>]*>/g, '')
  cleaned = cleaned.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  cleaned = cleaned.trim()
  
  // Try to find URL in cleaned string
  const finalMatch = cleaned.match(/https?:\/\/[^\s<>"]+/)
  return finalMatch ? finalMatch[0] : cleaned
}

// Helper function to format tabular data into readable text
function formatTabularData(data: any): string {
  if (!data.columns || !data.values || !Array.isArray(data.values)) {
    return ''
  }
  
  // Extract meaningful information from search results
  const urlIndex = data.columns.findIndex((col: any) => col.name === 'url')
  const titleIndex = data.columns.findIndex((col: any) => col.name === 'title')
  const descIndex = data.columns.findIndex((col: any) => col.name === 'meta_description')
  
  if (urlIndex >= 0 && titleIndex >= 0) {
    const totalResults = Math.min(data.values.length, 5) // Limit to top 5 results
    
    // Format as readable links with relevance scores
    const links = data.values
      .slice(0, totalResults)
      .map((row: any[], index: number) => {
        const url = row[urlIndex] || ''
        const title = row[titleIndex] || 'Untitled'
        const desc = descIndex >= 0 ? row[descIndex] : null
        
        if (url && title) {
          // Calculate relevance score based on position (1st = 100%, 2nd = 80%, etc.)
          const relevanceScore = Math.max(20, 100 - (index * 20))
          
          // Clean up URL - remove HTML tags and sanitize
          const cleanUrlValue = cleanUrl(String(url))
          
          // Clean up title (remove version numbers and extra text, and HTML tags)
          const cleanTitle = title.split('|')[0].trim().replace(/<[^>]*>/g, '')
          return `• [${cleanTitle}](${cleanUrlValue}) ⭐ ${relevanceScore}%${desc ? `\n  ${desc.replace(/<[^>]*>/g, '')}` : ''}`
        }
        return null
      })
      .filter((link: string | null) => link !== null)
    
    if (links.length > 0) {
      return links.join('\n\n')
    }
  }
  
  // Fallback: format as simple list if we can't extract links
  return ''
}

// Helper function to extract readable content from MCP response
function extractReadableContent(contentArray: any[]): string {
  const parts: string[] = []
  
  for (const item of contentArray) {
    if (item.type === 'text' && item.text) {
      try {
        const parsed = JSON.parse(item.text)
        
        // Handle structured results
        if (parsed.results && Array.isArray(parsed.results)) {
          for (const result of parsed.results) {
            // Skip internal tool calls (queries, etc.)
            if (result.type === 'query') {
              continue // Don't show internal queries
            }
            
            // Format tabular data (search results)
            if (result.type === 'tabular_data' && result.data) {
              const formatted = formatTabularData(result.data)
              if (formatted) {
                // Add context if we only have search results
                if (parts.length === 0) {
                  parts.push('Based on your question, here are some relevant resources from Elastic documentation:')
                }
                parts.push(formatted)
              }
            }
            // Handle other result types
            else if (result.type === 'text' && result.text) {
              parts.push(result.text)
            }
          }
        } else {
          // If it's not structured results, try to extract meaningful text
          const textStr = JSON.stringify(parsed)
          // Only include if it looks like it has useful content
          if (textStr.length < 500) {
            parts.push(textStr)
          }
        }
      } catch {
        // If it's not JSON, use it as-is
        parts.push(item.text)
      }
    } else if (item.type === 'text') {
      parts.push(item.text || '')
    }
  }
  
  return parts.filter(p => p.trim().length > 0).join('\n\n')
}

export async function POST(request: NextRequest) {
  try {
    const { message, conversationHistory } = await request.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'Message is required and must be a string' },
        { status: 400 }
      )
    }

    const mcpEndpoint = process.env.MCP_ENDPOINT || 'https://ai-assistants-ffcafb.kb.us-east-1.aws.elastic.cloud/api/agent_builder/mcp'
    const apiKey = process.env.MCP_API_KEY || 'SFBCQzlac0JBUENqajRQVTJ5VTM6WjRmYnhvWF9hdnM3aXNMZEpFUWlmZw=='

    // Load prompt from URL for field-engineering sales context (e.g. https://ela.st/prompt-metrics)
    const promptFromUrl = await getPromptForContext()
    const baseContext =
      "You are an expert assistant helping the Elastic field engineering team sell Observability Metrics. Help users understand how Elastic solves observability metrics challenges, including high-cardinality issues, cost optimization, scalability, and migration from other platforms like DataDog, Prometheus, or Grafana. Provide technical, practical guidance on Elastic's metrics capabilities. When searching the documentation index, search across ALL documents; use relevance-based search, not sort by last_crawled_at."
    const context = promptFromUrl
      ? `${baseContext}\n\n--- Prompt from team (use this to guide tone and positioning) ---\n${promptFromUrl}`
      : baseContext + " Do not sort by last_crawled_at - instead use relevance-based search to find the most relevant content regardless of when it was last crawled."

    // Try using platform_core_search first for better control, then fall back to elastic tool
    const searchRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'platform_core_search',
        arguments: {
          query: message,
          index: 'search-elastic'
        }
      }
    }

    // Use JSON-RPC 2.0 MCP format with the "elastic" tool as fallback
    const elasticRequest = {
      jsonrpc: '2.0',
      id: Date.now() + 1,
      method: 'tools/call',
      params: {
        name: 'elastic',
        arguments: {
          message: message,
          context,
          conversationHistory: conversationHistory || []
        }
      }
    }

    const authHeaders = [
      { 'Authorization': `ApiKey ${apiKey}` },
      { 'Authorization': `Bearer ${apiKey}` },
      { 'X-API-Key': apiKey },
    ]

    let lastError: Error | null = null

    // Try platform_core_search first, then fall back to elastic tool
    const requestsToTry = [searchRequest, elasticRequest]

    for (const mcpRequest of requestsToTry) {
      for (const authHeader of authHeaders) {
        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          }
          // Add auth header (only one will be present)
          if ('Authorization' in authHeader && authHeader.Authorization) {
            headers['Authorization'] = authHeader.Authorization
          }
          if ('X-API-Key' in authHeader && authHeader['X-API-Key']) {
            headers['X-API-Key'] = authHeader['X-API-Key']
          }
          
          const response = await fetch(mcpEndpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(mcpRequest),
          })

        if (response.ok) {
          const data = await response.json()
          
          // Handle platform_core_search response format
          if (mcpRequest.params.name === 'platform_core_search' && data.result?.content) {
            // platform_core_search returns results in content array with resource type
            const contentArray = Array.isArray(data.result.content) ? data.result.content : [data.result.content]
            const resources = contentArray
              .filter((item: any) => item.type === 'text' && item.text)
              .flatMap((item: any) => {
                try {
                  const parsed = JSON.parse(item.text)
                  if (parsed.results && Array.isArray(parsed.results)) {
                    return parsed.results.filter((r: any) => r.type === 'resource' && r.data?.reference)
                  }
                } catch {
                  return []
                }
                return []
              })
            
            if (resources.length > 0) {
              // Get document details for each resource
              const formattedResults = resources
                .slice(0, 5)
                .map((resource: any, index: number) => {
                  const relevanceScore = Math.max(20, 100 - (index * 20))
                  const refId = resource.data.reference.id
                  const refIndex = resource.data.reference.index
                  
                  // Extract URL from highlights or reference
                  const highlights = resource.data.content?.highlights || []
                  const urlMatch = highlights.find((h: string) => h.startsWith('http'))
                  let url = urlMatch || `https://www.elastic.co/guide/${refId}`
                  
                  // Clean the URL - remove HTML tags
                  url = cleanUrl(url)
                  
                  // Try to extract title from highlights
                  const titleMatch = highlights.find((h: string) => !h.startsWith('http') && h.length < 200)
                  let title = titleMatch ? titleMatch.replace(/<[^>]*>/g, '').substring(0, 100).trim() : 'Documentation'
                  
                  // If we still don't have a good title, try to get it from the URL or use a default
                  if (title === 'Documentation' && url.includes('elastic.co')) {
                    // Try to extract a meaningful title from the URL path
                    const urlPath = new URL(url).pathname
                    const pathParts = urlPath.split('/').filter(p => p)
                    if (pathParts.length > 0) {
                      title = pathParts[pathParts.length - 1].replace(/-/g, ' ').replace(/\.[^.]+$/, '')
                      title = title.charAt(0).toUpperCase() + title.slice(1)
                    }
                  }
                  
                  return `• [${title}](${url}) ⭐ ${relevanceScore}%`
                })
                .filter((r: string | null) => r !== null)
              
              if (formattedResults.length > 0) {
                return NextResponse.json({
                  content: 'Based on your question, here are some relevant resources from Elastic documentation:\n\n' + formattedResults.join('\n\n'),
                  raw: data
                })
              }
            }
            // If platform_core_search didn't return usable results, continue to next request
            continue
          }
          
          // Extract response content from MCP format (for elastic tool)
          // Format: { result: { content: [{ type: "text", text: "..." }] } }
          let content = ''
          if (data.result?.content) {
            // Handle array of content objects
            if (Array.isArray(data.result.content)) {
              content = extractReadableContent(data.result.content)
            } else if (typeof data.result.content === 'string') {
              content = data.result.content
            }
          } else if (data.result?.text) {
            content = data.result.text
          } else if (data.content) {
            content = typeof data.content === 'string' ? data.content : JSON.stringify(data.content)
          } else if (data.message) {
            content = data.message
          } else if (data.error) {
            content = `Error: ${data.error.message || JSON.stringify(data.error)}`
          }
          
          // If we still don't have content, continue to next request
          if (!content || content.trim().length === 0) {
            continue
          }

          return NextResponse.json({ 
            content: content || 'No response content received',
            raw: data 
          })
        } else {
          const errorText = await response.text()
          lastError = new Error(`HTTP ${response.status}: ${errorText}`)
        }
      } catch (err: any) {
        lastError = err
        continue
      }
      }
    }

    throw lastError || new Error('All authentication methods failed')

  } catch (error: any) {
    console.error('Chat API error:', error)
    return NextResponse.json(
      { 
        error: 'Failed to get response from MCP endpoint',
        message: error.message,
        content: 'I apologize, but I\'m having trouble connecting to the AI service. Please check your MCP endpoint configuration and try again.'
      },
      { status: 500 }
    )
  }
}
