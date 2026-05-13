import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

function firebaseEnvReady(): boolean {
  const k = String(import.meta.env.VITE_FIREBASE_API_KEY ?? '').trim()
  const p = String(import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '').trim()
  return Boolean(k && p)
}

function showProdConfigHelp(): void {
  const root = document.getElementById('root')
  if (!root) return
  root.innerHTML = `
    <div style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1.5rem;line-height:1.5;color:#1a1a1a">
      <h1 style="font-size:1.25rem;margin-bottom:0.75rem">Firebase não configurado no Netlify</h1>
      <p>As variáveis <code style="background:#f0f0f0;padding:0.1em 0.35em;border-radius:4px">VITE_FIREBASE_*</code> têm de estar definidas <strong>antes do build</strong>.</p>
      <ol style="padding-left:1.25rem;margin:1rem 0">
        <li>Netlify → <strong>Site configuration</strong> → <strong>Environment variables</strong></li>
        <li>Adiciona as mesmas chaves que tens em <code style="background:#f0f0f0;padding:0.1em 0.35em;border-radius:4px">apps/web/.env</code> (ver <code style="background:#f0f0f0;padding:0.1em 0.35em;border-radius:4px">.env.example</code>)</li>
        <li><strong>Deploy</strong> → <strong>Trigger deploy</strong> → <strong>Clear cache and deploy site</strong></li>
      </ol>
      <p style="margin-top:1rem">No Firebase Console → Authentication → Settings → <strong>Authorized domains</strong>, inclui o domínio do Netlify (ex.: <code style="background:#f0f0f0;padding:0.1em 0.35em;border-radius:4px">aurasistemas.netlify.app</code>).</p>
    </div>`
}

async function boot() {
  if (import.meta.env.PROD && !firebaseEnvReady()) {
    showProdConfigHelp()
    return
  }
  const { default: App } = await import('./App.tsx')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
