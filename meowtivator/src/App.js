import React from 'react';
import ChoreManager from './components/ChoreManager';
import LoginPage from './pages/LoginPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { appId } from './firebase';
import './App.css';

const AppContent = () => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-400 to-purple-600 flex items-center justify-center font-pixel text-white text-2xl">
        Loading Quest Log...
      </div>
    );
  }

  if (!currentUser) {
    return <LoginPage />;
  }

  return <ChoreManager appId={appId} />;
};

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
