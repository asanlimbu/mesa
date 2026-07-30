import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import './index.css';

import { AuthProvider, useAuth } from './state/auth.jsx';
import { ToastProvider } from './state/toast.jsx';
import { Layout } from './components/Layout.jsx';
import { Spinner } from './components/ui.jsx';

import { Landing } from './pages/Landing.jsx';
import { Discover } from './pages/Discover.jsx';
import { RestaurantDetail } from './pages/RestaurantDetail.jsx';
import { MyReservations } from './pages/MyReservations.jsx';
import { ManagerDashboard } from './pages/ManagerDashboard.jsx';
import { SignIn, Register } from './pages/Auth.jsx';
import { NotFound } from './pages/NotFound.jsx';

/**
 * Client-side route guard.
 *
 * A convenience only — it keeps signed-out users out of screens that would
 * immediately fail. The server enforces the real rules on every request and is
 * the only thing that actually protects the data.
 */
function Protected({ children, role }) {
  const { isSignedIn, loading, user } = useAuth();

  if (loading) return <Spinner label="Checking your session" />;
  if (!isSignedIn) return <Navigate to="/sign-in" replace />;
  if (role && user.role !== role) return <Navigate to="/" replace />;

  return children;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Landing />} />
              <Route path="restaurants" element={<Discover />} />
              <Route path="restaurants/:slug" element={<RestaurantDetail />} />

              <Route
                path="reservations"
                element={
                  <Protected>
                    <MyReservations />
                  </Protected>
                }
              />

              <Route
                path="manager"
                element={
                  <Protected role="MANAGER">
                    <ManagerDashboard />
                  </Protected>
                }
              />

              <Route path="sign-in" element={<SignIn />} />
              <Route path="register" element={<Register />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
