import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import ChoreManager from './components/ChoreManager';
import PrivateRoute from './components/PrivateRoute';
import RedirectToUserSection from './components/RedirectToUserSection';
import LoginPage from './pages/LoginPage';
import { AuthProvider } from './context/AuthContext';
import { appId } from './firebase';
import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route element={<PrivateRoute />}>
            <Route path="/" element={<RedirectToUserSection section="dashboard" />} />
            <Route path="/dashboard" element={<RedirectToUserSection section="dashboard" />} />
            <Route path="/focus" element={<RedirectToUserSection section="focus" />} />
            <Route path="/history" element={<RedirectToUserSection section="history" />} />
            <Route path="/users/:userId/:section" element={<ChoreManager appId={appId} />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
