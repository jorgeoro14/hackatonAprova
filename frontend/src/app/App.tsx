import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ApiError } from '@/lib/api/client'
import { ChatPage } from '@/pages/ChatPage'
import { DashboardLayout } from '@/features/dashboard/shell/DashboardLayout'
import { TeamPage } from '@/pages/dashboard/Placeholders'
import { ClientsPage } from '@/pages/dashboard/ClientsPage'
import { ConversationPage } from '@/pages/dashboard/ConversationPage'
import { ProcessDetailPage } from '@/pages/dashboard/ProcessDetailPage'
import { ClientDetailPage } from '@/pages/dashboard/ClientDetailPage'
import { OverviewPage } from '@/pages/dashboard/OverviewPage'
import { RequireAuth, RequireRole } from './guards'
import { LoginPage } from '@/pages/LoginPage'
import { UiShowcasePage } from '@/pages/UiShowcasePage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // não repete erros de cliente (4xx)
      retry: (count, error) => !(error instanceof ApiError && error.status < 500 && error.status !== 0) && count < 2,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="clients" element={<ClientsPage />} />
              <Route path="clients/:id" element={<ClientDetailPage />} />
              <Route path="processes/:id" element={<ProcessDetailPage />} />
              <Route path="conversations/:id" element={<ConversationPage />} />
              <Route element={<RequireRole role="head" />}>
                <Route path="team" element={<TeamPage />} />
              </Route>
            </Route>
          </Route>
          {import.meta.env.DEV && <Route path="/ui" element={<UiShowcasePage />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
