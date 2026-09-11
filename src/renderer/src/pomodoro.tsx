import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Pomodoro } from './components/Pomodoro'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="flex h-full items-center bg-bg p-2">
      <Pomodoro />
    </div>
  </StrictMode>
)
