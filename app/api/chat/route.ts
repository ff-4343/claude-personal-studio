import { NextRequest, NextResponse } from 'next/server'
export const runtime = 'edge'
export async function POST(req: NextRequest) {
  try {
    const { messages, model, apiKey, systemPrompt } = await req.json()
    if (!apiKey) return NextResponse.json({ error: 'API key required' }, { status: 401 })
    const body: Record<string, unknown> = { model: model || 'claude-3-5-sonnet-20241022', max_tokens: 8096, messages, stream: true }
    if (systemPrompt) body.system = systemPrompt
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    })
    if (!response.ok) {
      const err = await response.json()
      return NextResponse.json({ error: err.error?.message || 'API error' }, { status: response.status })
    }
    return new Response(response.body, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } })
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
