// Must stay first: installs the Supabase-backed db before any page module reads it.
import '@/lib/supabaseDb'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/nebula-ui.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
