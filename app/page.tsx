'use client'

import { useState } from 'react'
import ChatInterface from '@/components/ChatInterface'

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold mb-2">Elastic Metrics Chatbot</h1>
          <p className="text-gray-600 dark:text-gray-400">
            AI-powered assistant for the Elastic field engineering team to sell Observability Metrics. Prompt loaded from a URL.
          </p>
        </div>
        <ChatInterface />
      </div>
    </main>
  )
}
