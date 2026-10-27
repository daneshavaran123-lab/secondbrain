// build: 2026-06-09 — auth migrated to custom backend
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/estedad/400.css'
import '@fontsource/estedad/500.css'
import '@fontsource/estedad/600.css'
import '@fontsource/estedad/700.css'
import '@fontsource/noto-kufi-arabic/600.css'
import '@fontsource/noto-kufi-arabic/700.css'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './components/ui/theme-provider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { PlatformManager } from './utils/platformUtils'
import { autoExecuteCleanupIfRequested } from './utils/finalCleanupExecutor'
import { autoExecuteCompleteCleanup } from './utils/completeDataCleanup'

// Initialize platform-specific configurations
PlatformManager.initialize().catch(console.warn);

// اجرای پاکسازی خودکار در صورت درخواست
autoExecuteCleanupIfRequested()
autoExecuteCompleteCleanup()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" storageKey="brainforge-theme">
        <App />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
