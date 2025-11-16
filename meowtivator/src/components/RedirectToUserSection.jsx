import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const LoadingScreen = ({ message = 'Loading...' }) => (
  <div className="min-h-screen bg-gradient-to-b from-blue-400 to-purple-600 flex items-center justify-center font-pixel">
    <div className="text-white text-2xl">{message}</div>
  </div>
);

const RedirectToUserSection = ({ section = 'dashboard' }) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  const normalizedSection = ['dashboard', 'focus', 'history'].includes(section)
    ? section
    : 'dashboard';

  return <Navigate to={`/users/${currentUser.uid}/${normalizedSection}`} replace />;
};

export default RedirectToUserSection;


