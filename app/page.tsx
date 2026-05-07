'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

const ACCESS_KEY = 'vip2024'

const MODELS = [
  { id: 'claude-opus-4-5', label: 'Claude Opus 4' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 3.5' },
]

type Role = 'user' | 'assistant'
type ContentBlock = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
interface Message { id: string; role: Role; content: ContentBlock[]; ts: number }
interface Conv { id: string; title: string; messages: Message[]; ts: number }

function uid() { return Math.random().toString(36).slice(2) }

function ClaudeLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="20" fill="url(#cg)" />
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D4875F" />
          <stop offset="100%" stopColor="#C5623A" />
        </linearGradient>
      </defs>
      <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fill="white" fontFamily="Georgia,serif" fontSize="22" fontWeight="bold">C</text>
    </svg>
  )
}

function renderInline(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:rgba(255,255,255,0.1);padding:2px 5px;border-radius:4px;font-family:monospace;font-size:0.88em">$1</code>')
}

function MessageContent({ content }: { content: ContentBlock[] }) {
  return (
    <div>
      {content.map((block, i) => {
        if (block.type === 'image') {
          return <img key={i} src={`data:${block.source.media_type};base64,${block.source.data}`} alt="uploaded" style={{ maxWidth: '100%', borderRadius: 10, marginBottom: 8 }} />
        }
        const text = block.text
        const lines = text.split('\n')
        const elements: React.ReactNode[] = []
        let inCode = false
        let codeLines: string[] = []
        let codeLang = ''

        lines.forEach((line, li) => {
          if (line.startsWith('```')) {
            if (!inCode) {
              inCode = true
              codeLang = line.slice(3).trim()
              codeLines = []
            } else {
              inCode = false
              elements.push(
                <div key={`code-${li}`} style={{ position: 'relative', margin: '12px 0' }}>
                  {codeLang && <div style={{ position: 'absolute', top: 8, right: 12, fontSize: 11, color: '#999', fontFamily: 'monospace' }}>{codeLang}</div>}
                  <button onClick={() => navigator.clipboard.writeText(codeLines.join('\n'))}
                    style={{ position: 'absolute', top: 6, left: 10, padding: '3px 10px', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: '#ccc', fontSize: 11, cursor: 'pointer' }}>
                    نسخ
                  </button>
                  <pre style={{ background: '#1e1e1e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '36px 14px 14px', overflowX: 'auto', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.6, color: '#e0e0e0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {codeLines.join('\n')}
                  </pre>
                </div>
              )
              codeLines = []
              codeLang = ''
            }
            return
          }
          if (inCode) { codeLines.push(line); return }

          if (line.startsWith('### ')) {
            elements.push(<h3 key={li} style={{ fontSize: 15, fontWeight: 700, margin: '16px 0 6px', color: '#e8e8e8' }}>{line.slice(4)}</h3>)
          } else if (line.startsWith('## ')) {
            elements.push(<h2 key={li} style={{ fontSize: 17, fontWeight: 700, margin: '18px 0 8px', color: '#e8e8e8' }}>{line.slice(3)}</h2>)
          } else if (line.startsWith('# ')) {
            elements.push(<h1 key={li} style={{ fontSize: 20, fontWeight: 700, margin: '20px 0 10px', color: '#e8e8e8' }}>{line.slice(2)}</h1>)
          } else if (line.startsWith('- ') || line.startsWith('* ')) {
            elements.push(<div key={li} style={{ display: 'flex', gap: 8, marginBottom: 3 }}><span style={{ color: '#cc785c', flexShrink: 0, marginTop: 2 }}>•</span><span dangerouslySetInnerHTML={{ __html: renderInline(line.slice(2)) }} /></div>)
          } else if (/^\d+\. /.test(line)) {
            const num = line.match(/^(\d+)\. /)?.[1]
            elements.push(<div key={li} style={{ display: 'flex', gap: 8, marginBottom: 3 }}><span style={{ color: '#cc785c', flexShrink: 0, minWidth: 18 }}>{num}.</span><span dangerouslySetInnerHTML={{ __html: renderInline(line.replace(/^\d+\. /, '')) }} /></div>)
          } else if (line === '') {
            elements.push(<div key={li} style={{ height: 10 }} />)
          } else {
            elements.push(<p key={li} style={{ margin: '0 0 2px', lineHeight: 1.75 }} dangerouslySetInnerHTML={{ __html: renderInline(line) }} />)
          }
        })
        return <div key={i}>{elements}</div>
      })}
    </div>
  )
}

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [keyErr, setKeyErr] = useState(false)

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(MODELS[1].id)
  const [systemPrompt, setSystemPrompt] = useState('You are Claude, an AI assistant made by Anthropic. You are helpful, harmless, and honest.')

  const [convs, setConvs] = useState<Conv[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showSidebar, setShowSidebar] = useState(true)
  const [attachments, setAttachments] = useState<ContentBlock[]>([])

  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const activeConv = convs.find(c => c.id === activeId)

  useEffect(() => {
    const saved = localStorage.getItem('claude_auth')
    if (saved === ACCESS_KEY) setAuthed(true)
    const savedKey = localStorage.getItem('claude_api_key')
    if (savedKey) setApiKey(savedKey)
    const savedConvs = localStorage.getItem('claude_convs')
    if (savedConvs) { try { setConvs(JSON.parse(savedConvs)) } catch {} }
    const savedModel = localStorage.getItem('claude_model')
    if (savedModel) setModel(savedModel)
    const savedSystem = localStorage.getItem('claude_system')
    if (savedSystem) setSystemPrompt(savedSystem)
  }, [])

  useEffect(() => {
    if (convs.length) localStorage.setItem('claude_convs', JSON.stringify(convs))
  }, [convs])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [activeConv?.messages, streaming])

  const login = () => {
    if (keyInput === ACCESS_KEY) {
      localStorage.setItem('claude_auth', ACCESS_KEY)
      setAuthed(true)
    } else {
      setKeyErr(true)
      setTimeout(() => setKeyErr(false), 1800)
    }
  }

  const newConv = () => {
    const c: Conv = { id: uid(), title: 'محادثة جديدة', messages: [], ts: Date.now() }
    setConvs(prev => [c, ...prev])
    setActiveId(c.id)
    setStreaming('')
    setAttachments([])
    setInput('')
  }

  const deleteConv = (id: string) => {
    setConvs(prev => prev.filter(c => c.id !== id))
    if (activeId === id) setActiveId(null)
  }

  const handleFile = async (file: File) => {
    const reader = new FileReader()
    if (file.type.startsWith('image/')) {
      reader.onload = e => {
        const data = (e.target?.result as string).split(',')[1]
        setAttachments(prev => [...prev, { type: 'image', source: { type: 'base64', media_type: file.type, data } }])
      }
      reader.readAsDataURL(file)
    } else {
      reader.onload = e => {
        const text = e.target?.result as string
        setInput(prev => prev + '\n\n[محتوى الملف: ' + file.name + ']\n' + text)
      }
      reader.readAsText(file)
    }
  }

  const sendMessage = useCallback(async () => {
    if ((!input.trim() && !attachments.length) || loading) return
    if (!apiKey) { setShowSettings(true); return }

    let convId = activeId
    if (!convId) {
      const c: Conv = { id: uid(), title: input.slice(0, 45) || 'محادثة', messages: [], ts: Date.now() }
      setConvs(prev => [c, ...prev])
      convId = c.id
      setActiveId(convId)
    }

    const userContent: ContentBlock[] = [
      ...attachments,
      ...(input.trim() ? [{ type: 'text' as const, text: input.trim() }] : []),
    ]
    const userMsg: Message = { id: uid(), role: 'user', content: userContent, ts: Date.now() }

    setConvs(prev => prev.map(c => c.id === convId ? {
      ...c,
      title: c.messages.length === 0 ? (input.slice(0, 45) || 'محادثة') : c.title,
      messages: [...c.messages, userMsg]
    } : c))

    setInput('')
    setAttachments([])
    setLoading(true)
    setStreaming('')

    const currentConv = convs.find(c => c.id === convId)
    const history = [...(currentConv?.messages || []), userMsg].map(m => ({
      role: m.role,
      content: m.content.map(b => b.type === 'text' ? { type: 'text', text: b.text } : b)
    }))

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, model, apiKey, systemPrompt })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'خطأ في الاتصال')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'content_block_delta' && data.delta?.text) {
                full += data.delta.text
                setStreaming(full)
              }
            } catch {}
          }
        }
      }

      const aiMsg: Message = { id: uid(), role: 'assistant', content: [{ type: 'text', text: full }], ts: Date.now() }
      setConvs(prev => prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, aiMsg] } : c))
      setStreaming('')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'خطأ غير معروف'
      const errMsg: Message = { id: uid(), role: 'assistant', content: [{ type: 'text', text: '⚠️ ' + msg }], ts: Date.now() }
      setConvs(prev => prev.map(c => c.id === convId ? { ...c, messages: [...c.messages, errMsg] } : c))
      setStreaming('')
    } finally {
      setLoading(false)
    }
  }, [input, attachments, loading, apiKey, activeId, convs, model, systemPrompt])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && document.activeElement === textareaRef.current) {
        e.preventDefault()
        sendMessage()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [sendMessage])

  // ─── Login screen ──────────────────────────────────────────
  if (!authed) return (
    <div style={{
      height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#1a1a1a', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        input:-webkit-autofill { -webkit-box-shadow: 0 0 0 30px #2c2c2c inset !important; -webkit-text-fill-color: #e8e8e8 !important; }
      `}</style>
      <div style={{ width: '100%', maxWidth: 360, padding: '0 24px', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <ClaudeLogo size={52} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 700, color: '#e8e8e8', margin: '0 0 6px' }}>Claude Studio</h1>
        <p style={{ color: '#666', fontSize: 14, margin: '0 0 28px' }}>مساعدك الشخصي بالذكاء الاصطناعي</p>

        <input
          type="password"
          placeholder="المفتاح السري"
          value={keyInput}
          onChange={e => setKeyInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          autoFocus
          style={{
            width: '100%', padding: '13px 16px', marginBottom: 12,
            background: '#2c2c2c', border: `1.5px solid ${keyErr ? '#e05c5c' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: 10, color: '#e8e8e8', fontSize: 15, textAlign: 'center',
            outline: 'none', transition: 'border-color 0.2s', boxSizing: 'border-box'
          }}
        />
        {keyErr && <p style={{ color: '#e05c5c', fontSize: 12, margin: '-6px 0 10px' }}>مفتاح غير صحيح</p>}
        <button
          onClick={login}
          style={{
            width: '100%', padding: '13px', background: '#cc785c', border: 'none',
            borderRadius: 10, color: 'white', fontSize: 15, fontWeight: 600, cursor: 'pointer',
            transition: 'background 0.2s'
          }}
          onMouseOver={e => (e.currentTarget.style.background = '#b8664a')}
          onMouseOut={e => (e.currentTarget.style.background = '#cc785c')}
        >
          دخول
        </button>
      </div>
    </div>
  )

  // ─── Main App ──────────────────────────────────────────────
  return (
    <div style={{
      height: '100vh', display: 'flex', background: '#1a1a1a',
      color: '#e8e8e8', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: 15
    }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        ::-webkit-scrollbar { width: 4px }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px }
        .conv-item:hover { background: rgba(255,255,255,0.06) !important }
        .conv-item:hover .del-btn { opacity: 1 !important }
        .chip:hover { background: rgba(255,255,255,0.08) !important; color: #ccc !important }
        .icon-btn:hover { background: rgba(255,255,255,0.08) !important }
        textarea::placeholder { color: #555 }
        select option { background: #2a2a2a }
      `}</style>

      {/* ── Sidebar ── */}
      {showSidebar && (
        <div style={{
          width: 256, background: '#171717', display: 'flex', flexDirection: 'column',
          flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.06)'
        }}>
          {/* Logo */}
          <div style={{ padding: '18px 16px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ClaudeLogo size={26} />
            <span style={{ fontWeight: 700, fontSize: 16, color: '#e8e8e8', letterSpacing: '-0.2px' }}>Claude</span>
          </div>

          {/* New chat */}
          <div style={{ padding: '0 10px 10px' }}>
            <button
              onClick={newConv}
              className="icon-btn"
              style={{
                width: '100%', padding: '8px 12px',
                background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: '#ccc', fontSize: 13, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 8, transition: 'background 0.15s'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              محادثة جديدة
            </button>
          </div>

          {/* Conversation list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
            {convs.length > 0 && (
              <div style={{ fontSize: 10, fontWeight: 600, color: '#555', padding: '6px 8px 4px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                الأخيرة
              </div>
            )}
            {convs.map(c => (
              <div
                key={c.id}
                className="conv-item"
                onClick={() => setActiveId(c.id)}
                style={{
                  padding: '7px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 1,
                  background: c.id === activeId ? 'rgba(255,255,255,0.08)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  transition: 'background 0.12s'
                }}
              >
                <span style={{
                  fontSize: 13, color: c.id === activeId ? '#e8e8e8' : '#999',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1
                }}>
                  {c.title}
                </span>
                <button
                  className="del-btn"
                  onClick={e => { e.stopPropagation(); deleteConv(c.id) }}
                  style={{
                    background: 'none', border: 'none', color: '#666', cursor: 'pointer',
                    fontSize: 15, padding: '0 2px', opacity: 0, transition: 'opacity 0.1s', lineHeight: 1
                  }}
                >×</button>
              </div>
            ))}
            {!convs.length && (
              <p style={{ color: '#444', fontSize: 12, textAlign: 'center', padding: '24px 12px' }}>
                لا توجد محادثات بعد
              </p>
            )}
          </div>

          {/* Bottom */}
          <div style={{ padding: '10px 10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button
              onClick={() => setShowSettings(s => !s)}
              className="icon-btn"
              style={{
                width: '100%', padding: '8px 12px', background: 'transparent', border: 'none',
                color: '#666', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center',
                gap: 8, borderRadius: 8, transition: 'background 0.15s'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              الإعدادات
            </button>
          </div>
        </div>
      )}

      {/* ── Main area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Top bar */}
        <div style={{
          padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10,
          borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#1a1a1a', flexShrink: 0
        }}>
          <button
            onClick={() => setShowSidebar(s => !s)}
            className="icon-btn"
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '6px', borderRadius: 6 }}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          </button>

          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <select
              value={model}
              onChange={e => { setModel(e.target.value); localStorage.setItem('claude_model', e.target.value) }}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, color: '#ccc', padding: '6px 12px', fontSize: 13, cursor: 'pointer',
                outline: 'none'
              }}
            >
              {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>

          <button
            onClick={newConv}
            className="icon-btn"
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '6px', borderRadius: 6 }}
            title="محادثة جديدة"
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div style={{ background: '#1f1f1f', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px 20px', flexShrink: 0 }}>
            <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>
                  Anthropic API Key
                </label>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => { setApiKey(e.target.value); localStorage.setItem('claude_api_key', e.target.value) }}
                  placeholder="sk-ant-api03-..."
                  style={{
                    width: '100%', padding: '8px 12px',
                    background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, color: '#e8e8e8', fontSize: 13, outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ flex: 2, minWidth: 200 }}>
                <label style={{ fontSize: 11, color: '#666', display: 'block', marginBottom: 5 }}>
                  System Prompt
                </label>
                <input
                  value={systemPrompt}
                  onChange={e => { setSystemPrompt(e.target.value); localStorage.setItem('claude_system', e.target.value) }}
                  placeholder="أنت مساعد ذكي..."
                  style={{
                    width: '100%', padding: '8px 12px',
                    background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8, color: '#e8e8e8', fontSize: 13, outline: 'none', boxSizing: 'border-box'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer"
                  style={{ padding: '8px 12px', background: 'rgba(204,120,92,0.15)', border: '1px solid rgba(204,120,92,0.3)', borderRadius: 8, color: '#cc785c', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  احصل على مفتاح
                </a>
                <button onClick={() => setShowSettings(false)}
                  style={{ padding: '8px 12px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#666', fontSize: 12, cursor: 'pointer' }}>
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Messages area ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0 0' }}>

          {/* Empty state */}
          {!activeConv && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '100%', gap: 14, padding: '0 24px'
            }}>
              <ClaudeLogo size={52} />
              <h2 style={{ fontSize: 24, fontWeight: 700, color: '#e0e0e0', margin: 0 }}>
                كيف يمكنني مساعدتك؟
              </h2>
              <p style={{ color: '#555', fontSize: 14, margin: 0 }}>
                ابدأ محادثة أو اختر أحد الخىارات أدماه
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 520, marginTop: 8 }}>
                {[
                  'اكتب لي كوداً',
                  'حلل هذا الملف',
                  'ساعدني في الكتابة',
                  'فسّر لي مفهوماً',
                  'ترجم نصاً',
                ].map(s => (
                  <button
                    key={s}
                    className="chip"
                    onClick={() => { setInput(s); textareaRef.current?.focus() }}
                    style={{
                      padding: '9px 16px', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20,
                      color: '#888', fontSize: 13, cursor: 'pointer', transition: 'all 0.15s'
                    }}
                  >{s}</button>
                ))}
              </div>
            </div>
          )}

          {/* Message list */}
          {activeConv?.messages.map(msg => (
            <div
              key={msg.id}
              style={{
                maxWidth: 680, margin: '0 auto', padding: '4px 24px 12px',
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                gap: 12, alignItems: 'flex-start'
              }}
            >
              {msg.role === 'assistant' && (
                <div style={{ flexShrink: 0, marginTop: 2 }}>
                  <ClaudeLogo size={26} />
                </div>
              )}

              {msg.role === 'user' ? (
                <div style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: '18px 18px 4px 18px',
                  padding: '10px 16px', maxWidth: '75%', fontSize: 15, lineHeight: 1.7, color: '#e8e8e8'
                }}>
                  <MessageContent content={msg.content} />
                </div>
              ) : (
                <div style={{ flex: 1, fontSize: 15, lineHeight: 1.75, color: '#ddd', minWidth: 0 }}>
                  <MessageContent content={msg.content} />
                </div>
              )}
            </div>
          ))}

          {/* Streaming response */}
          {streaming && (
            <div style={{
              maxWidth: 680, margin: '0 auto', padding: '4px 24px 12px',
              display: 'flex', flexDirection: 'row', gap: 12, alignItems: 'flex-start'
            }}>
              <div style={{ flexShrink: 0, marginTop: 2 }}><ClaudeLogo size={26} /></div>
              <div style={{ flex: 1, fontSize: 15, lineHeight: 1.75, color: '#ddd', minWidth: 0 }}>
                <MessageContent content={[{ type: 'text', text: streaming }]} />
                <span style={{
                  display: 'inline-block', width: 2, height: 18,
                  background: '#cc785c', animation: 'blink 0.9s infinite',
                  verticalAlign: 'text-bottom', marginLeft: 2, borderRadius: 1
                }} />
              </div>
            </div>
          )}

          {loading && !streaming && (
            <div style={{ maxWidth: 680, margin: '0 auto', padding: '4px 24px', display: 'flex', gap: 12, alignItems: 'center' }}>
              <ClaudeLogo size={26} />
              <div style={{ display: 'flex', gap: 5 }}>
                {[0, 1, 2].map(i => (
                  <span key={i} style={{
                    width: 7, height: 7, borderRadius: '50%', background: '#555',
                    display: 'inline-block',
                    animation: `blink 1.2s ${i * 0.2}s infinite`
                  }} />
                ))}
              </div>
            </div>
          )}

          <div ref={bottomRef} style={{ height: 24 }} />
        </div>

        {/* ── Input area ── */}
        <div style={{ padding: '12px 20px 20px', flexShrink: 0 }}>
          <div style={{ maxWidth: 680, margin: '0 auto' }}>

            {/* Attachment previews */}
            {attachments.length > 0 && (
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                {attachments.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'rgba(204,120,92,0.12)', border: '1px solid rgba(204,120,92,0.25)',
                    borderRadius: 8, padding: '4px 10px', fontSize: 12, color: '#cc785c'
                  }}>
                    {a.type === 'image' ? '🖼 صورة' : '📄 ملف'}
                    <button
                      onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: '#cc785c', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {/* Main input box */}
            <div style={{
              background: '#2a2a2a', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14, padding: '12px 14px 10px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)'
            }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="أرسل رسال إا ءلى Claude…"
                rows={1}
                style={{
                  width: '100%', background: 'transparent', border: 'none', color: '#e8e8e8',
                  fontSize: 15, resize: 'none', outline: 'none', lineHeight: 1.6,
                  maxHeight: 220, overflowY: 'auto', fontFamily: 'inherit', boxSizing: 'border-box'
                }}
                onInput={e => {
                  const t = e.target as HTMLTextAreaElement
                  t.style.height = 'auto'
                  t.style.height = Math.min(t.scrollHeight, 220) + 'px'
                }}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {/* File attach */}
                  <input ref={fileRef} type="file" accept="image/*,.txt,.pdf,.js,.ts,.py,.html,.css,.json,.md,.csv" multiple style={{ display: 'none' }}
                    onChange={e => { Array.from(e.target.files || []).forEach(handleFile); e.target.value = '' }} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="icon-btn"
                    title="إرفاق ملف"
                    style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', padding: '5px', borderRadius: 6, lineHeight: 1 }}
                  >
                    <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a3 3 0 00-3 3v4a5 5 0 0010 0V7a1 1 0 112 0v4a7 7 0 11-14 0V7a5 5 0 0110 0v4a3 3 0 11-6 0V7a1 1 0 012 0v4a1 1 0 102 0V7a3 3 0 00-3-3z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                {/* Send button */}
                <button
                  onClick={sendMessage}
                  disabled={loading || (!input.trim() && !attachments.length)}
                  style={{
                    width: 34, height: 34, borderRadius: '50%',
                    background: (loading || (!input.trim() && !attachments.length)) ? 'rgba(204,120,92,0.25)' : '#cc785c',
                    border: 'none', cursor: (loading || (!input.trim() && !attachments.length)) ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'all 0.2s', flexShrink: 0
                  }}
                >
                  {loading ? (
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="rgba(255,255,255,0.5)">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="white">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <p style={{ textAlign: 'center', fontSize: 11, color: '#3a3a3a', marginTop: 8 }}>
              Claude قد يرتكب أخطاء. تحقق من المعلومات المهمة.
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
