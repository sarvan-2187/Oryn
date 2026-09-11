import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { PopoutNote } from './PopoutNote'
import './styles.css'

const noteId = new URLSearchParams(window.location.search).get('note')

createRoot(document.getElementById('root')!).render(
  <StrictMode>{noteId ? <PopoutNote noteId={Number(noteId)} /> : <App />}</StrictMode>
)
