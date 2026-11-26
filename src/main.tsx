import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import StudentLayout from './components/StudentLayout';
import { ErrorState, PageSkeleton } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import { ToastProvider } from './lib/toast';
import { Devolutiva, Historico, Status } from './pages/DocFlow';
import Documentos from './pages/Documentos';
import Inicio from './pages/Inicio';
import { FirstAccess, Login, NewPassword, StaffLogin } from './pages/Login';
import NovaAnalise from './pages/NovaAnalise';
import Lote from './pages/Lote';
import Calendario from './pages/Calendario';
import Harvey from './pages/Harvey';
import Suits from './pages/Suits';
import { FeedbackMentoria, Gamificacao, Perfil, Sessoes } from './pages/OtherPages';
import { NovoRelatorio, RelatorioDetalhe, Relatorios } from './pages/Relatorios';
import { AlunoFicha, Configuracoes, Painel } from './pages/staff/Painel';
import { Fila, Revisao, StaffLayout } from './pages/staff/Staff';
import { Agenda } from './pages/staff/Agenda';
import './styles.css';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 15_000 } } });

/** Exige sessão e perfil carregado. `staff` restringe à equipe. */
function Guard({ staff, children }: { staff?: boolean; children: ReactNode }) {
  const { ready, session, profile, profileLoading, profileError, reloadProfile } = useAuth();
  const loc = useLocation();
  if (!ready) return null;
  if (!session) return <Navigate to={staff ? '/equipe/entrar' : '/login'} replace state={{ from: loc.pathname }} />;
  if (profileLoading) return <div className="page"><PageSkeleton /></div>;
  if (profileError || !profile) return <div className="page"><ErrorState onRetry={reloadProfile} /></div>;
  if (staff && profile.role !== 'staff') return <Navigate to="/" replace />;
  if (!staff && profile.role === 'staff' && !loc.pathname.startsWith('/equipe')) return <Navigate to="/equipe" replace />;
  return <>{children}</>;
}

function PublicOnly({ to = '/', children }: { to?: string; children: ReactNode }) {
  const { ready, session } = useAuth();
  if (!ready) return null;
  if (session) return <Navigate to={to} replace />;
  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/equipe/entrar" element={<PublicOnly to="/equipe"><StaffLogin /></PublicOnly>} />
      <Route path="/primeiro-acesso" element={<PublicOnly><FirstAccess /></PublicOnly>} />
      <Route path="/nova-senha" element={<NewPassword />} />
      <Route path="/equipe" element={<Guard staff><StaffLayout /></Guard>}>
        <Route index element={<Painel />} />
        <Route path="fila" element={<Fila />} />
        <Route path="revisao/:id" element={<Revisao />} />
        <Route path="aluno/:id" element={<AlunoFicha />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="config" element={<Configuracoes />} />
      </Route>
      <Route element={<Guard><StudentLayout /></Guard>}>
        <Route index element={<Inicio />} />
        <Route path="documentos" element={<Documentos />} />
        <Route path="documentos/nova" element={<NovaAnalise />} />
        <Route path="documentos/lote" element={<Lote />} />
        <Route path="documentos/:slot/status" element={<Status />} />
        <Route path="documentos/:slot/devolutiva" element={<Devolutiva />} />
        <Route path="documentos/:slot/historico" element={<Historico />} />
        <Route path="gamificacao" element={<Gamificacao />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="relatorios/novo" element={<NovoRelatorio />} />
        <Route path="relatorios/:id" element={<RelatorioDetalhe />} />
        <Route path="relatorios/:id/editar" element={<NovoRelatorio />} />
        <Route path="sessoes" element={<Sessoes />} />
        <Route path="calendario" element={<Calendario />} />
        <Route path="feedback" element={<FeedbackMentoria />} />
        <Route path="perfil" element={<Perfil />} />
        <Route path="harvey" element={<Harvey />} />
        <Route path="suits" element={<Suits />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
