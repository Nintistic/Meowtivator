import React, { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { useNavigate, useParams } from 'react-router-dom';
import { collection, onSnapshot, doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import SettingsModal from './SettingsModal';
import { useAuth } from '../context/AuthContext';

// Page constants
const PAGE_DASHBOARD = 'dashboard';
const PAGE_FOCUS = 'focus';
const PAGE_HISTORY = 'history';

const sectionToPage = (section) => {
  switch (section) {
    case 'focus':
      return PAGE_FOCUS;
    case 'history':
      return PAGE_HISTORY;
    case 'dashboard':
    default:
      return PAGE_DASHBOARD;
  }
};

const pageToSection = {
  [PAGE_DASHBOARD]: 'dashboard',
  [PAGE_FOCUS]: 'focus',
  [PAGE_HISTORY]: 'history',
};

const ChoreManager = ({ appId = 'default-app' }) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const { userId: routeUserId, section: routeSection = 'dashboard' } = useParams();
  const [showSettings, setShowSettings] = useState(false);
  const [users, setUsers] = useState([]);
  const [signingOut, setSigningOut] = useState(false);
  const currentPage = sectionToPage(routeSection);

  useEffect(() => {
    if (!currentUser) return;

    if (routeUserId && routeUserId !== currentUser.uid) {
      navigate(`/users/${currentUser.uid}/${pageToSection[currentPage]}`, { replace: true });
      return;
    }

    if (!['dashboard', 'focus', 'history'].includes(routeSection)) {
      navigate(`/users/${currentUser.uid}/dashboard`, { replace: true });
    }
  }, [currentUser, routeUserId, routeSection, currentPage, navigate]);

  useEffect(() => {
    const ensureUserDocument = async () => {
      if (!currentUser || !appId) return;

      const userRef = doc(db, `artifacts/${appId}/public/data/users`, currentUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          id: currentUser.uid,
          display_name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Hero',
          total_xp: 0,
          weekly_xp: 0,
          star_coins: 0,
          currentWeek: Math.floor((Date.now() - new Date(2024, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)),
          fairness_threshold: 1000,
          monthly_xp_start: 0,
        });
      } else {
        const userData = userSnap.data();
        const desiredName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Hero';
        if (userData.display_name !== desiredName) {
          await setDoc(userRef, { display_name: desiredName }, { merge: true });
        }
      }
    };

    ensureUserDocument();
  }, [currentUser, appId]);

  useEffect(() => {
    if (!appId) return;

    const usersRef = collection(db, `artifacts/${appId}/public/data/users`);
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const usersData = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setUsers(usersData);
    });

    return () => unsubscribe();
  }, [appId]);

  const handleNavigate = (page) => {
    if (!currentUser) return;
    const targetSection = pageToSection[page] || 'dashboard';
    navigate(`/users/${currentUser.uid}/${targetSection}`);
  };

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await signOut(auth);
      navigate('/login', { replace: true });
    } catch (error) {
      console.error('Sign-out error:', error);
    } finally {
      setSigningOut(false);
    }
  };

  if (!currentUser) {
    // Should not happen because of PrivateRoute, but guard just in case
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-400 to-purple-600 font-pixel">
      {/* Navigation Bar */}
      <nav className="bg-yellow-100 border-b-4 border-yellow-800 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold text-yellow-900">🎮 Meowtivator</h1>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => handleNavigate(PAGE_DASHBOARD)}
              className={`px-4 py-2 border-4 font-bold ${
                currentPage === PAGE_DASHBOARD
                  ? 'bg-green-500 border-green-800 text-white'
                  : 'bg-white border-yellow-800 text-yellow-900 hover:bg-yellow-200'
              }`}
              style={{ fontFamily: 'Courier New, monospace' }}
            >
              🏠 Dashboard
            </button>
            <button
              onClick={() => handleNavigate(PAGE_FOCUS)}
              className={`px-4 py-2 border-4 font-bold ${
                currentPage === PAGE_FOCUS
                  ? 'bg-green-500 border-green-800 text-white'
                  : 'bg-white border-yellow-800 text-yellow-900 hover:bg-yellow-200'
              }`}
              style={{ fontFamily: 'Courier New, monospace' }}
            >
              ⏱️ Focus
            </button>
            <button
              onClick={() => handleNavigate(PAGE_HISTORY)}
              className={`px-4 py-2 border-4 font-bold ${
                currentPage === PAGE_HISTORY
                  ? 'bg-green-500 border-green-800 text-white'
                  : 'bg-white border-yellow-800 text-yellow-900 hover:bg-yellow-200'
              }`}
              style={{ fontFamily: 'Courier New, monospace' }}
            >
              📜 History
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="px-4 py-2 border-4 bg-white border-yellow-800 text-yellow-900 font-bold hover:bg-yellow-200"
              style={{ fontFamily: 'Courier New, monospace' }}
            >
              ⚙️ Settings
            </button>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="px-4 py-2 border-4 bg-red-500 border-red-800 text-white font-bold hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ fontFamily: 'Courier New, monospace' }}
            >
              {signingOut ? '🔄 Signing Out...' : '🚪 Sign Out'}
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto p-4">
        {currentPage === PAGE_DASHBOARD && (
          <div className="bg-yellow-100 border-4 border-yellow-800 p-6 rounded-lg shadow-2xl">
            <h2 className="text-3xl font-bold text-yellow-900 mb-4">Dashboard</h2>
            <div className="space-y-4">
              <div className="bg-white border-4 border-yellow-800 p-4 rounded">
                <h3 className="text-xl font-bold text-yellow-900 mb-2">
                  Welcome, {currentUser.displayName || currentUser.email}!
                </h3>
                <p className="text-yellow-800">Your chore management dashboard</p>
              </div>
              {users.length > 0 && (
                <div className="bg-white border-4 border-yellow-800 p-4 rounded">
                  <h3 className="text-xl font-bold text-yellow-900 mb-2">Users</h3>
                  <ul className="space-y-2">
                    {users.map((user) => (
                      <li key={user.id} className="text-yellow-800">
                        {user.display_name || user.id}: {user.total_xp || 0} XP
                        {user.fairness_threshold && (
                          <span className="ml-2 text-sm">(Threshold: {user.fairness_threshold})</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {currentPage === PAGE_FOCUS && (
          <div className="bg-yellow-100 border-4 border-yellow-800 p-6 rounded-lg shadow-2xl">
            <h2 className="text-3xl font-bold text-yellow-900 mb-4">Focus Mode</h2>
            <p className="text-yellow-800">Focus mode will be implemented here</p>
          </div>
        )}

        {currentPage === PAGE_HISTORY && (
          <div className="bg-yellow-100 border-4 border-yellow-800 p-6 rounded-lg shadow-2xl">
            <h2 className="text-3xl font-bold text-yellow-900 mb-4">History</h2>
            <p className="text-yellow-800">History page will be implemented here</p>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        userId={currentUser.uid}
        appId={appId}
      />
    </div>
  );
};

export default ChoreManager;

