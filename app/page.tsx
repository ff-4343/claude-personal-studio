'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

const ACCESS_KEY = 'vip2024'

const MODELS = [
  { id: 'claude-opus-4-5', label: 'Claude Opus 4 — الأقوى' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4 — متوازن' },
  { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet — سريع' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku — الأسرع' },
]

type Role = 'user' | 'assistant'
type ContentBlock = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
interface Message { id: string; role: Role; content: ContentBlock[]; ts: number }
interface Conv { id: string; title: string; messages: Message[]; ts: number }

function uid() { return Math.random().toString(36).slice(2) }

function formatTime(ts: number) {
  const d = new Date(ts)
  return d.toLocaleDateString('ar-SA', { month: 'short', day: 'numeric' })
}

function MessageContent({ content }: { content: ContentBlock[] }) {
  return (
    <div>
      {content.map((block, i) => {
        if (block.type === 'image') {
          return <img key={i} src={`data:${block.source.media_type};base64,${block.source.data}`} alt="uploaded" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 8 }} />
        }
        const text = block.text
        // Simple markdown-like rendering
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
                <div key={`code-${li}`} style={{ position: 'relative', marginBottom: 12 }}>
                  {codeLang && <div style={{ position: 'absolute', top: 6, right: 10, fontSize: 11, color: '#888', fontFamily: 'monospace' }}>{codeLang}</div>}
                  <button
                    onClick={() => navigator.clipboard.writeText(codeLines.join('\n'))}
                    style={{ position: 'absolute', top: 4, left: 8, padding: '3px 8px', background: '#3b82f6', border: 'none', borderRadius: 4, color: 'white', fontSize: 11, cursor: 'pointer' }}
                  >نسخ</button>
                  <pre style={{ background: '#0d1117', border: '1px solid #30363d', borderRadius: 8, padding: '32px 12px 12px', overflowX: 'auto', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.5, color: '#e6edf3', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
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
            elements.push(<h3 key={li} style={{ fontSize: 16, fontWeight: 700, margin: '16px 0 8px', color: '#e8e8e8' }}>{line.slice(4)}</h3>)
          } else if (line.startsWith('## ')) {
            elements.push(<h2 key={li} style={{ fontSize: 18, fontWeight: 700, margin: '16px 0 8px', color: '#e8e8e8' }}>{line.slice(3)}</h2>)
          } else if (line.startsWith('# ')) {
            elements.push(<h1 key={li} style={{ fontSize: 20, fontWeight: 700, margin: '16px 0 8px', color: '#e8e8e8' }}>{line.slice(2)}</h1>)
          } else if (line.startsWith('- ') || line.startsWith('* ')) {
            elements.push(<div key={li} style={{ display: 'flex', gap: 8, marginBottom: 4 }}><span style={{ color: '#e94560', flexShrink: 0 }}>•</span><span style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderInline(line.slice(2)) }} /></div>)
          } else if (/^\d+\. /.test(line)) {
            const num = line.match(/^(\d+)\. /)?.[1]
            elements.push(<div key={li} style={{ display: 'flex', gap: 8, marginBottom: 4 }}><span style={{ color: '#e94560', flexShrink: 0, minWidth: 20 }}>{num}.</span><span style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderInline(line.replace(/^\d+\. /, '')) }} /></div>)
          } else if (line === '') {
            elements.push(<div key={li} style={{ height: 8 }} />)
          } else {
            elements.push(<p key={li} style={{ lineHeight: 1.7, marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: renderInline(line) }} />)
          }
        })
        return <div key={i}>{elements}</div>
      })}
    </div>
  )
}

function renderInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:#1e2a3a;padding:2px 6px;border-radius:4px;font-family:monospace;font-size:0.9em">$1</code>')
}

export default function App() {
  const [authed, setAuthed] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [keyErr, setKeyErr] = useState(false)

  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(MODELS[1].id)
  const [systemPrompt, setSystemPrompt] = useState('أنت مساعد ذكاء اصطناعي متعدد المهام. تساعد في البرمجة والكتابة والتحليل وكل شيء. تتكلم بالعربية والإنجليزية حسب ما يطلب المستخدم.')

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
      setTimeout(() => setKeyErr(false), 2000)
    }
  }

  const newConv = () => {
    const c: Conv = { id: uid(), title: 'محادثة جديدة', messages: [], ts: Date.now() }
    setConvs(prev => [c, ...prev])
    setActiveId(c.id)
    setStreaming('')
    setAttachments([])
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
    if (!apiKey) { alert('أضف مفتاح API من الإعدادات أولاً'); setShowSettings(true); return }

    let convId = activeId
    if (!convId) {
      const c: Conv = { id: uid(), title: input.slice(0, 40) || 'محادثة جديدة', messages: [], ts: Date.now() }
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
      title: c.messages.length === 0 ? (input.slice(0, 40) || 'محادثة') : c.title,
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
        throw new Error(err.error || 'خطأ فى الاتصال')
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let full = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
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
      const msg = e instanceof Error ? e.message : 'خطأ'
      const errMsg: Message = { id: uid(), role: 'assistant', content: [{ type: 'text', text: '❌ خطأ: ' + msg }], ts: Date.now() }
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

  if (!authed) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>
      <div style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: 40, width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>🤖</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6, background: 'linear-gradient(135deg,#e94560,#3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Claude Studio</h1>
        <p style={{ color: '#a0a0b0', fontSize: 13, marginBottom: 24 }}>الذكاء الاعطناعي الشخصي</p>
        <input
          type="password"
          placeholder="أدخل المفتاح السري"
          value={keyInput}
          onChange={e => setKeyInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          style={{ width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.08)', border: `1px solid ${keyErr ? '#e94560' : 'rgba(255,255,255,0.15)'}`, borderRadius: 10, color: 'white', fontSize: 16, textAlign: 'center', marginBottom: 12, outline: 'none', transition: 'border-color 0.2s' }}
          autoFocus
        />
        <button onClick={login} style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#e94560,#c2255c)', border: 'none', borderRadius: 10, color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>
          دخول
        </button>
        {keyErr && <p style={{ color: '#e94560', fontSize: 12, marginTop: 8 }}>مفتاح خاطئ</p>}
      </div>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', background: '#1a1a2e', color: '#e8e8e8', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      {/* Sidebar */}
      {showSidebar && (
        <div style={{ width: 260, background: '#111827', borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 12, background: 'linear-gradient(135deg,#e94560,#3b82f6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>🤖 Claude Studio</div>
            <button onClick={newConv} style={{ width: '100%', padding: '9px', background: 'rgba(233,69,96,0.15)', border: '1px solid rgba(233,69,96,0.3)', borderRadius: 8, color: '#e94560', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              + محادثة جديدة
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>
            {convs.map(c => (
              <div key={c.id} onClick={() => setActiveId(c.id)} style={{ padding: '9px 10px', marginBottom: 2, borderRadius: 8, cursor: 'pointer', background: c.id === activeId ? 'rgba(233,69,96,0.12)' : 'transparent', border: c.id === activeId ? '1px solid rgba(233,69,96,0.2)' : '1px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.15s' }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: c.id === activeId ? '#e94560' : '#e8e8e8' }}>{c.title}</div>
                  <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{formatTime(c.ts)}</div>
                </div>
                <button onClick={e => { e.stopPropagation(); deleteConv(c.id) }} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '2px 4px', fontSize: 14, borderRadius: 4, marginRight: 2 }}>×</button>
              </div>
            ))}
            {!convs.length && <p style={{ color: '#6b7280', fontSize: 12, textAlign: 'center', padding: '20px 10px' }}>ابدأ محادثة جديدة</p>}
          </div>
          <div style={{ padding: '10px 8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <button onClick={() => setShowSettings(s => !s)} style={{ width: '100%', padding: '8px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#a0a0b0', fontSize: 12, cursor: 'pointer' }}>
              ⚙️ الإعدادات
            </button>
          </div>
        </div>
      )}

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Topbar */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(0,0,0,0.2)', flexShrink: 0 }}>
          <button onClick={() => setShowSidebar(s => !s)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 18, padding: '2px 6px' }}>☰</button>
          <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: '#e8e8e8' }}>{activeConv?.title || 'Claude Studio'}</div>
          <select value={model} onChange={e => { setModel(e.target.value); localStorage.setItem('claude_model', e.target.value) }}
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#e8e8e8', padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
            {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div style={{ background: '#111827', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 5 }}>مفتاح Anthropic API (sk-ant-...)</label>
                <input type="password" value={apiKey} onChange={e => { setApiKey(e.target.value); localStorage.setItem('claude_api_key', e.target.value) }}
                  placeholder="sk-ant-api03-..." style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', fontSize: 13 }} />
              </div>
              <div style={{ flex: 2, minWidth: 200 }}>
                <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 5 }}>شخصية المساعد (System Prompt)</label>
                <input value={systemPrompt} onChange={e => { setSystemPrompt(e.target.value); localStorage.setItem('claude_system', e.target.value) }}
                  placeholder="أنت مساعد ذكي..." style={{ width: '100%', padding: '8px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'white', fontSize: 13 }} />
              </div>
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer" style={{ padding: '8px 14px', background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)', borderRadius: 8, color: '#3b82f6', fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                احصل عمي مفتاح
              </a>
              <button onClick={() => setShowSettings(false)} style={{ padding: '8px 14px', background: 'none', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#6b7280', fontSize: 12, cursor: 'pointer' }}>إغلاق</button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 0' }}>
          {!activeConv && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16 }}>
              <div style={{ fontSize: 56 }}>🤖</div>
              <h2 style={{ fontSize: 24, fontWeight: 700, color: '#e8e8e8' }}>كيف يمكنني مساعدتك؟</h2>
              <p style={{ color: '#6b7280', fontSize: 14 }}>اكتب رسالة أو ارفع ملفاً للبدء</p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 500 }}>
                {['اكتب لي كوداً','حلل هذا الملف','ترجم نصاً','ساعدني في التفكير'].map(s => (
                  <button key={s} onClick={() => setInput(s)} style={{ padding: '8px 16px', background: 'rgba(233,69,96,0.1)', border: '1px solid rgba(233,69,96,0.2)', borderRadius: 20, color: '#e94560', fontSize: 13, cursor: 'pointer' }}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {activeConv?.messages.map(msg => (
            <div key={msg.id} style={{ padding: '4px 16px', maxWidth: 900, margin: '0 auto' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: msg.role === 'user' ? 'linear-gradient(135deg,#2d5a8e,#1e3a5f)' : 'linear-gradient(135deg,#e94560,#c2255c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, marginTop: 2 }}>
                  {msg.role === 'user' ? '👤' : '🤖'}
                </div>
                <div style={{ maxWidth: '80%', background: msg.role === 'user' ? 'rgba(45,90,142,0.25)' : 'rgba(30,42,58,0.6)', border: `1px solid ${msg.role === 'user' ? 'rgba(45,90,142,0.3)' : 'rgba(255,255,255,0.06)'}`, borderRadius: msg.role === 'user' ? '16px 4px 16px 16px' : '4px 16px 16px 16px', padding: '12px 16px', fontSize: 14, lineHeight: 1.7 }}>
                  <MessageContent content={msg.content} />
                </div>
              </div>
            </div>
          ))}

          {streaming && (
            <div style={{ padding: '4px 16px', maxWidth: 900, margin: '0 auto' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#e94560,#c2255c)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0, marginTop: 2 }}>🤖</div>
                <div style={{ maxWidth: '80%', background: 'rgba(30,42,58,0.6)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '4px 16px 16px 16px', padding: '12px 16px', fontSize: 14, lineHeight: 1.7 }}>
                  <MessageContent content={[{ type: 'text', text: streaming }]} />
                  <span style={{ display: 'inline-block', width: 8, height: 16, background: '#e94560', borderRadius: 2, animation: 'blink 1s infinite', verticalAlign: 'text-bottom', marginRight: 2 }} />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.15)', flexShrink: 0 }}>
          {attachments.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              {attachments.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(233,69,96,0.1)', border: '1px solid rgba(233,69,96,0.2)', borderRadius: 8, padding: '4px 10px', fontSize: 12 }}>
                  {a.type === 'image' ? '🖼️ صورة' : '📄 ملف'}
                  <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#e94560', cursor: 'pointer', fontSize: 14 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, padding: '8px 12px' }}>
            <input ref={fileRef} type="file" accept="image/*,.txt,.pdf,.js,.ts,.py,.html,.css,.json,.md,.csv" multiple style={{ display: 'none' }}
              onChange={e => { Array.from(e.target.files || []).forEach(handleFile); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 20, padding: '4px', flexShrink: 0, lineHeight: 1 }} title="إرفاق ملف">📎</button>
            <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
              placeholder="اكتب رسالتك... (Enter للإرسال� Shift+Enter لسطر جديد)�"
              rows={1}
              style={{ flex: 1, background: 'transparent', border: 'none', color: '#e8e8e8', fontSize: 14, resize: 'none', outline: 'none', lineHeight: 1.6, maxHeight: 200, overflowY: 'auto', fontFamily: 'inherit' }}
              onInput={e => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px' }}
            />
            <button onClick={sendMessage} disabled={loading || (!input.trim() && !attachments.length)}
              style={{ background: loading ? 'rgba(233,69,96,0.3)' : 'linear-gradient(135deg,#e94560,#c2255c)', border: 'none', borderRadius: 10, width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: loading ? 'not-allowed' : 'pointer', flexShrink: 0, transition: 'all 0.2s', fontSize: 16 }}>
              {loading ? '⏳' : '↑'}
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: 11, color: '#374151', marginTop: 6 }}>Claude Studio — مدعوم بـ Anthropic API</p>
        </div>
      </div>

      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </div>
  )
}
