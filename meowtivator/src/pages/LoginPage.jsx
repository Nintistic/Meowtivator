import React, { useEffect, useState } from 'react';
import {
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from 'firebase/auth';
import { auth, appId as firebaseAppId, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const LoginPage = () => {
  const { currentUser, loading } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState(null);
  const [staySignedIn, setStaySignedIn] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('meow-stay-signed-in') === 'true';
  });
  const provider = new GoogleAuthProvider();

  const ensureUserDocument = async (user) => {
    if (!firebaseAppId) return;
    const userRef = doc(db, 'artifacts', firebaseAppId, 'public', 'data', 'users', user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      await setDoc(userRef, {
        id: user.uid,
        display_name: user.displayName || user.email?.split('@')[0] || 'Hero',
        total_xp: 0,
        weekly_xp: 0,
        star_coins: 0,
        currentWeek: Math.floor((Date.now() - new Date(2024, 0, 1).getTime()) / (7 * 24 * 60 * 60 * 1000)),
        fairness_threshold: 1000,
        monthly_xp_start: 0,
      });
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('meow-stay-signed-in', staySignedIn ? 'true' : 'false');
    }
  }, [staySignedIn]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      const persistence = staySignedIn ? browserLocalPersistence : browserSessionPersistence;
      await setPersistence(auth, persistence);
      const result = await signInWithPopup(auth, provider);
      await ensureUserDocument(result.user);
    } catch (err) {
      console.error('Sign-in error:', err);
      setError(err.message || 'Failed to sign in. Please try again.');
      setSigningIn(false);
    }
  };

  if (loading || currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-400 to-purple-600 flex items-center justify-center font-pixel">
        <div className="text-white text-2xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-400 to-purple-600 flex items-center justify-center font-pixel">
      <div className="bg-yellow-100 border-4 border-yellow-800 p-8 rounded-lg shadow-2xl max-w-md w-full mx-4">
        <h1 className="text-3xl font-bold text-yellow-900 mb-4 text-center">🎮 Meowtivator</h1>
        <p className="text-yellow-800 mb-6 text-center">Sign in to continue your quest!</p>

        {error && (
          <div className="mb-4 p-3 bg-red-200 border-2 border-red-800 text-red-900 font-pixel text-sm rounded">
            {error}
          </div>
        )}

        <label className="flex items-center gap-2 mb-4 text-yellow-900 font-pixel text-sm">
          <input
            type="checkbox"
            checked={staySignedIn}
            onChange={(e) => setStaySignedIn(e.target.checked)}
            className="accent-green-600 w-4 h-4"
          />
          Stay signed in on this device
        </label>

        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="w-full px-6 py-3 bg-green-500 border-4 border-green-800 text-white font-bold hover:bg-green-600 active:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ fontFamily: 'Courier New, monospace' }}
        >
          {signingIn ? 'Signing in...' : '🔐 Sign In with Google'}
        </button>

        <p className="text-xs text-yellow-700 mt-4 text-center">
          By signing in, you agree to start your chore adventure!
        </p>
      </div>
    </div>
  );
};

export default LoginPage;


