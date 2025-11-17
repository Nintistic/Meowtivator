import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';

const SettingsModal = ({ isOpen, onClose, userId, appId }) => {
  const [fairnessThreshold, setFairnessThreshold] = useState(1000);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && userId && appId) {
      loadFairnessThreshold();
    }
  }, [isOpen, userId, appId]);

  const loadFairnessThreshold = async () => {
    try {
      setLoading(true);
      setError(null);
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        const userData = userSnap.data();
        setFairnessThreshold(userData.fairness_threshold || 1000);
      } else {
        // If user doesn't exist, use default
        setFairnessThreshold(1000);
      }
    } catch (err) {
      console.error('Error loading fairness threshold:', err);
      setError('Failed to load settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!userId || !appId) {
      setError('User ID or App ID is missing');
      return;
    }

    const threshold = parseInt(fairnessThreshold);
    if (isNaN(threshold) || threshold < 0) {
      setError('Please enter a valid number');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', userId);
      await updateDoc(userRef, {
        fairness_threshold: threshold
      });
      onClose();
    } catch (err) {
      console.error('Error saving fairness threshold:', err);
      setError('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-yellow-100 border-4 border-yellow-800 p-6 rounded-lg shadow-2xl max-w-md w-full mx-4 pixel-art">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-yellow-900 font-pixel">
            ⚙️ Settings
          </h2>
          <button
            onClick={onClose}
            className="text-yellow-900 hover:text-yellow-700 text-2xl font-bold font-pixel"
            style={{ fontFamily: 'Courier New, monospace' }}
          >
            ✕
          </button>
        </div>

        <div className="mb-4">
          <label className="block text-yellow-900 font-bold mb-2 font-pixel text-lg">
            Fairness Threshold (XP)
          </label>
          <p className="text-sm text-yellow-800 mb-3 font-pixel">
            Maximum acceptable XP difference before applying 1.5x boost to lowest earner
          </p>
          {loading ? (
            <div className="text-yellow-800 font-pixel">Loading...</div>
          ) : (
            <input
              type="number"
              value={fairnessThreshold}
              onChange={(e) => setFairnessThreshold(e.target.value)}
              className="w-full px-4 py-2 border-4 border-yellow-800 bg-white text-yellow-900 font-pixel text-lg focus:outline-none focus:border-yellow-600"
              min="0"
              style={{ fontFamily: 'Courier New, monospace' }}
            />
          )}
        </div>

        {error && (
          <div className="mb-4 p-2 bg-red-200 border-2 border-red-800 text-red-900 font-pixel text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={loading || saving}
            className="flex-1 px-4 py-2 bg-green-500 border-4 border-green-800 text-white font-bold font-pixel text-lg hover:bg-green-600 active:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ fontFamily: 'Courier New, monospace' }}
          >
            {saving ? 'Saving...' : '💾 Save'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-400 border-4 border-gray-700 text-white font-bold font-pixel text-lg hover:bg-gray-500 active:bg-gray-600"
            style={{ fontFamily: 'Courier New, monospace' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;

