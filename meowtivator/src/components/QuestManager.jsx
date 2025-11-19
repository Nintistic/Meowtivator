import React, { useEffect, useMemo, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import {
  formatMs,
  coerceDate,
  calculateXpWithFairness,
} from '../utils/questHelpers';

const PAGES = {
  DASHBOARD: 'DASHBOARD',
  QUEST_LOG: 'QUEST_LOG',
  FOCUS_MODE: 'FOCUS_MODE',
  PROFILE: 'PROFILE_PAGE',
  REWARD_HALL: 'REWARD_HALL',
  HISTORY: 'HISTORY_LOG',
};

const difficultyPresets = {
  easy: { label: 'Easy Quest (100 XP)', xp: 100 },
  medium: { label: 'Medium Quest (250 XP)', xp: 250 },
  hard: { label: 'Hard Quest (500 XP)', xp: 500 },
};

const initialTaskForm = {
  title: '',
  difficulty: 'easy',
  frequencyType: 'daily',
  frequencyInterval: 1,
};

const DEFAULT_SPOTIFY_EMBED =
  'https://open.spotify.com/embed/playlist/37i9dQZF1DX4WYpdgoIcn6?utm_source=generator';

const SPOTIFY_SCOPES = ['playlist-read-private', 'user-read-private'];
const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';

const generateRandomString = (length = 128) => {
  const possible =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < length; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

const base64UrlEncode = (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return window
    .btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
};

const sha256 = async (plain) => {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
};

const createCodeChallenge = async (verifier) => {
  const hashed = await sha256(verifier);
  return base64UrlEncode(hashed);
};

const getSpotifyConfig = () => {
  const clientId = process.env.REACT_APP_SPOTIFY_CLIENT_ID || '';
  let redirectUri = process.env.REACT_APP_SPOTIFY_REDIRECT_URI || '';
  if (!redirectUri && typeof window !== 'undefined') {
    redirectUri = `${window.location.origin}/`;
  }
  return { clientId, redirectUri };
};

const generateFriendCode = (rawId = '') => {
  const base = (rawId || 'MEOWTIVATR').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const padded = (base + 'MEOWTIVATRULES').slice(0, 8);
  return `${padded.slice(0, 4)}-${padded.slice(4, 8)}`;
};

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const getWeekKey = (date) => {
  const d = new Date(date);
  const firstDayOfYear = new Date(d.getFullYear(), 0, 1);
  const pastDaysOfYear = (d - firstDayOfYear) / 86400000;
  const week = Math.floor((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
};

const getMonthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${d.getMonth() + 1}`;
};

const normalizeQuestDoc = (docData = {}) => {
  const difficulty = docData.difficulty || docData.difficulty_level || 'easy';
  // Support both old (frequency) and new (frequencyType) formats
  const frequencyType =
    docData.frequencyType ||
    (docData.frequency === 'once' ? 'once' : docData.frequency || 'daily') ||
    'daily';
  const frequencyInterval = docData.frequencyInterval ?? 1;
  const lastCompletedAt =
    docData.lastCompletedAt ||
    docData.last_completed_at ||
    docData.last_completed ||
    null;
  const normalizedLastCompleted = lastCompletedAt ? coerceDate(lastCompletedAt) : null;
  const nextDueAt = docData.nextDueAt ? coerceDate(docData.nextDueAt) : null;
  const isActive = docData.isActive !== undefined ? docData.isActive : true;
  const xp =
    docData.xp ??
    docData.xp_value ??
    difficultyPresets[difficulty]?.xp ??
    difficultyPresets.easy.xp;
  return {
    ...docData,
    title: docData.title || docData.name || 'Quest',
    difficulty,
    xp,
    frequencyType,
    frequencyInterval,
    nextDueAt,
    isActive,
    lastCompletedById:
      docData.lastCompletedById ||
      docData.last_completed_by_id ||
      docData.completed_by_id ||
      null,
    lastCompletedByName:
      docData.lastCompletedByName ||
      docData.last_completed_by_name ||
      docData.completed_by_name ||
      null,
    createdById:
      docData.createdById || docData.created_by_id || docData.createdBy || docData.created_by || '',
    createdByName:
      docData.createdByName ||
      docData.created_by_name ||
      docData.created_by ||
      docData.createdBy ||
      '',
    reservedById: docData.reservedById ?? docData.reserved_by_id ?? null,
    reservedByName: docData.reservedByName ?? docData.reserved_by_name ?? null,
    lastCompletedAt: normalizedLastCompleted,
    lastFocusDurationSeconds:
      docData.lastFocusDurationSeconds ?? docData.last_focus_duration_seconds ?? null,
  };
};

const calculateNextDueAt = (frequencyType, frequencyInterval, fromDate = new Date()) => {
  const date = new Date(fromDate);
  switch (frequencyType) {
    case 'once':
      return date; // For one-time quests, nextDueAt is set to creation time
    case 'daily':
      date.setDate(date.getDate() + frequencyInterval);
      return date;
    case 'weekly':
      date.setDate(date.getDate() + frequencyInterval * 7);
      return date;
    case 'monthly':
      date.setMonth(date.getMonth() + frequencyInterval);
      return date;
    default:
      return date;
  }
};

const isQuestDue = (quest, now = new Date()) => {
  // New model: check isActive and nextDueAt
  if (quest.isActive === false) return false;
  if (quest.nextDueAt) {
    const nextDue = coerceDate(quest.nextDueAt);
    return nextDue && now >= nextDue;
  }
  // Fallback to old model for backward compatibility
  const lastCompleted = quest.lastCompletedAt;
  const frequencyType = quest.frequencyType || quest.frequency || 'once';
  switch (frequencyType) {
    case 'once':
      return !lastCompleted;
    case 'daily':
      if (!lastCompleted) return true;
      return startOfDay(now) > startOfDay(lastCompleted);
    case 'weekly':
      if (!lastCompleted) return true;
      return getWeekKey(now) !== getWeekKey(lastCompleted);
    case 'monthly':
      if (!lastCompleted) return true;
      return getMonthKey(now) !== getMonthKey(lastCompleted);
    default:
      return true;
  }
};

const AVATAR_OPTIONS = [
  {
    id: 'cat',
    label: 'Mint Mischief',
    emoji: '🐱',
    data: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImJhY2tncm91bmQ6IzE2MTYxNiI+PHJlY3QgeD0iNSIgeT0iMiIgd2lkdGg9IjYiIGhlaWdodD0iMiIgZmlsbD0id2hpdGUiLz48cmVjdCB4PSI0IiB5PSI0IiB3aWR0aD0iOCIgaGVpZ2h0PSIyIiBmaWxsPSIjRkZBMTEyIi8+PHJlY3QgeD0iMyIgeT0iNiIgd2lkdGg9IjEwIiBoZWlnaHQ9IjIiIGZpbGw9IiNGRkExMTIiLz48cmVjdCB4PSI1IiB5PSI4IiB3aWR0aD0iMiIgaGVpZ2h0PSIyIiBmaWxsPSIjRkY0NjQ2Ii8+PHJlY3QgeD0iOSIgeT0iOCIgd2lkdGg9IjIiIGhlaWdodD0iMiIgZmlsbD0iI0ZGNDY0NiIvPjxyZWN0IHg9IjQiIHk9IjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjYiIGZpbGw9IiNGRkExMTIiLz48cmVjdCB4PSI2IiB5PSIxMCIgd2lkdGg9IjQiIGhlaWdodD0iMiIgZmlsbD0id2hpdGUiLz48cmVjdCB4PSI3IiB5PSIxMiIgd2lkdGg9IjIiIGhlaWdodD0iMiIgZmlsbD0iIzk5OTkiLz48cmVjdCB4PSIwIiB5PSIwIiB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHN0eWxlPSJmaWxsOm5vbmU7c3Ryb2tlOiMzMzMiIHN0cm9va2Utd2lkdGg6Mn08L3N2Zz4=',
  },
  {
    id: 'dog',
    label: 'Coalition Pup',
    emoji: '🐶',
    data: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiIgc3R5bGU9ImJhY2tncm91bmQ6IzE2MTYxNiI+PHJlY3QgeD0iMiIgeT0iMTAiIHdpZHRoPSI0IiBoZWlnaHQ9IjYiIGZpbGw9IiNFMkYwRjQiLz48cmVjdCB4PSI2IiB5PSIyIiB3aWR0aD0iOCIgaGVpZ2h0PSI0IiBmaWxsPSIjQjIxMjE3Ii8+PHJlY3QgeD0iMTAiIHk9IjYiIHdpZHRoPSI0IiBoZWlnaHQ9IjIiIGZpbGw9IiNFMkYwRjQiLz48cmVjdCB4PSI4IiB5PSI4IiB3aWR0aD0iNiIgaGVpZ2h0PSI2IiBmaWxsPSIjQjIxMjE3Ii8+PHJlY3QgeD0iOCIgeT0iMTAiIHdpZHRoPSIyIiBoZWlnaHQ9IjIiIGZpbGw9ImJsYWNrIi8+PHJlY3QgeD0iMTIiIHk9IjEwIiB3aWR0aD0iMiIgaGVpZ2h0PSIyIiBmaWxsPSJ3aGl0ZSIvPjxyZWN0IHg9IjUiIHk9IjgiIHdpZHRoPSIyIiBoZWlnaHQ9IjIiIGZpbGw9IiNCMjEyMTciLz48cmVjdCB4PSI3IiB5PSIyIiB3aWR0aD0iMiIgaGVpZ2h0PSIyIiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjUiIHk9IjIiIHdpZHRoPSIyIiBoZWlnaHQ9IjIiIGZpbGw9IiNCMjEyMTciLz48L3N2Zz4=',
  },
  {
    id: 'robot',
    label: 'Vacuum Bot 3000',
    emoji: '🤖',
    data: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHJlY3QgeD0iNSIgeT0iMiIgd2lkdGg9IjYiIGhlaWdodD0iMiIgZmlsbD0iIzAwRjAwMCIvPjxyZWN0IHg9IjMiIHk9IjQiIHdpZHRoPSIxMCIgaGVpZ2h0PSI4IiBmaWxsPSIjQUFBRkZGIi8+PHJlY3QgeD0iNSIgeT0iNiIgd2lkdGg9IjIiIGhlaWdodD0iMiIgZmlsbD0iIzAwRjAwMCIvPjxyZWN0IHg9IjkiIHk9IjYiIHdpZ2h0PSIyIiBoZWlnaHQ9IjIiIGZpbGw9IiMwMEYwMDAiLz48cmVjdCB4PSI1IiB5PSIxMCIgd2lkdGg9IjYiIGhlaWdodD0iMiIgZmlsbD0iI0ZGMDAwMCIvPjxyZWN0IHg9IjAiIHk9IjQiIHdpZHRoPSIyIiBoZWlnaHQ9IjgiIGZpbGw9IiNBQUFG RkYiLz48cmVjdCB4PSIxNCIgeT0iNCIgd2lkdGg9IjIiIGhlaWdodD0iOCIgZmlsbD0iI0FBQUZGRiIvPjxyZWN0IHg9IjUiIHk9IjAiIHdpZHRoPSI2IiBoZWlnaHQ9IjIiIGZpbGw9IiNGRkZGMDAiLz48L3N2Zz4=',
  },
  {
    id: 'bunny',
    label: 'Laundry Bunny',
    emoji: '🐰',
    data: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHJlY3QgeD0iNSIgeT0iMCIgd2lkdGg9IjIiIGhlaWdodD0iNCIgZmlsbD0id2hpdGUiLz48cmVjdCB4PSI5IiB5PSIwIiB3aWR0aD0iMiIgaGVpZ2h0PSI0IiBmaWxsPSJ3aGl0ZSIvPjxyZWN0IHg9IjIiIHk9IjQiIHdpZHRoPSIxMiIgaGVpZ2h0PSI4IiBmaWxsPSJ3aGl0ZSIvPjxyZWN0IHg9IjUiIHk9IjYiIHdpZHRoPSIyIiBoZWlnaHQ9IjIiIGZpbGw9ImJsYWNrIi8+PHJlY3QgeD0iOSIgeT0iNiIgd2lkdGg9IjIiIGhlaWdodD0iMiIgZmlsbD0iYmxhY2siLz48cmVjdCB4PSI2IiB5PSIxMCIgd2lkdGg9IjQiIGhlaWdodD0iMiIgZmlsbD0iI0ZGMDAwMCIvPjxyZWN0IHg9IjYiIHk9IjQiIHdpZHRoPSI0IiBoZWlnaHQ9IjIiIGZpbGw9IiNEQ0RDRkYiLz48L3N2Zz4=',
  },
  {
    id: 'ghost',
    label: 'Procrastination Ghost',
    emoji: '👻',
    data: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHJlY3QgeD0iMyIgeT0iNCIgd2lkdGg9IjEwIiBoZWlnaHQ9IjgiIGZpbGw9IiMwMEZGMkYiLz48cmVjdCB4PSI1IiB5PSI2IiB3aWR0aD0iMiIgaGVpZ2h0PSIyIiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjkiIHk9IjYiIHdpZWR0aD0iMiIgaGVpZ2h0PSIyIiBmaWxsPSJibGFjayIvPjxyZWN0IHg9IjIiIHk9IjEyIiB3aWR0aD0iMiIgaGVpZ2h0PSIyIiBmaWxsPSIjMEVG RjJGIi8+PHJlY3QgeD0iNCIgeT0iMTIiIHdpZHRoPSIzIiBoZWlnaHQ9IjIiIGZpbGw9IiNG RjAwMDAiLz48cmVjdCB4PSI3IiB5PSIxMiIgd2lkdGg9IjIiIGhlaWdodD0iMiIgZmlsbD0iI0ZGMDAwMCIvPjxyZWN0IHg9IjkiIHk9IjEyIiB3aWR0aD0iMiIgaGVpZ2h0PSIyIiBmaWxsPSIjMEVGRjJGIi8+PHJlY3QgeD0iMSIgeT0iMTIiIHdpZHRoPSIyIiBoZWlnaHQ9IjIiIGZpbGw9IiNGRjAwMDAiLz48L3N2Zz4=',
  },
  {
    id: 'wizard',
    label: 'Laundry Wizard',
    emoji: '🧙‍♂️',
    data: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNiAxNiI+PHJlY3QgeD0iMCIgeT0iOCIgd2lkdGg9IjE2IiBoZWlnaHQ9IjgiIGZpbGw9IiM1NTU1RkYiLz48cmVjdCB4PSI0IiB5PSIxMCIgd2lkdGg9IjgiIGhlaWdodD0iMiIgZmlsbD0id2hpdGUiLz48cmVjdCB4PSI2IiB5PSI0IiB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjRkY3NzAwIi8+PHJlY3QgeD0iNyIgeT0iMiIgd2lkdGg9IjIiIGhlaWdodD0iMiIgZmlsbD0iIzU1RkZGNiIvPjxyZWN0IHg9IjQiIHk9IjYiIHdpZHRoPSIyIiBoZWlnaHQ9IjIiIGZpbGw9ImJsYWNrIi8+PHJlY3QgeD0iMTAiIHk9IjYiIHdpZHRoPSIyIiBoZWlnaHQ9IjIiIGZpbGw9ImJsYWNrIi8+PC9zdmc+',
  },
];

const QuestManager = ({ appId = 'default-app' }) => {
  const { currentUser } = useAuth();
  const [activePage, setActivePage] = useState(PAGES.DASHBOARD);
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [chores, setChores] = useState([]);
  const [newQuestModal, setNewQuestModal] = useState(false);
  const [newQuestForm, setNewQuestForm] = useState(initialTaskForm);
  const [completionModal, setCompletionModal] = useState({ open: false, choreId: null });
  const [completionUserId, setCompletionUserId] = useState('');
  const [notes, setNotes] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [selectedReservedChoreId, setSelectedReservedChoreId] = useState(null);
  const [timerState, setTimerState] = useState({ choreId: null, isRunning: false, elapsedMs: 0 });
  const timerStartRef = useRef(null);
  const monthlySyncRef = useRef({});
  const [fairnessInput, setFairnessInput] = useState(1000);
  const [rewardNote, setRewardNote] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingFairness, setSavingFairness] = useState(false);
  const [savingReward, setSavingReward] = useState(false);
  const [spotifyUrl, setSpotifyUrl] = useState(DEFAULT_SPOTIFY_EMBED);
  const [spotifyInput, setSpotifyInput] = useState('');
  const [savingSpotify, setSavingSpotify] = useState(false);
  const [spotifyAuthState, setSpotifyAuthState] = useState(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem('spotify_auth_state_v1');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [spotifyPlaylists, setSpotifyPlaylists] = useState([]);
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState('');
  const [historyEntries, setHistoryEntries] = useState([]);

  const currentUserDoc = useMemo(
    () => users.find((u) => u.id === currentUser?.uid),
    [users, currentUser]
  );

  const userCollectionPath = useMemo(
    () => ['artifacts', appId, 'public', 'data', 'users'],
    [appId]
  );
  const choreCollectionPath = useMemo(
    () => ['artifacts', appId, 'public', 'data', 'chores'],
    [appId]
  );
  const historyCollectionPath = useMemo(
    () => ['artifacts', appId, 'public', 'data', 'quest_history'],
    [appId]
  );

  useEffect(() => {
    if (currentUserDoc) {
      setFairnessInput(currentUserDoc.fairness_threshold || 1000);
      setRewardNote(currentUserDoc.monthly_reward_title || '');
      const savedSpotify = currentUserDoc.spotify_playlist_url || DEFAULT_SPOTIFY_EMBED;
      setSpotifyUrl(savedSpotify);
      setSpotifyInput(savedSpotify);
    }
  }, [currentUserDoc]);

  useEffect(() => {
    if (!spotifyUrl) return;
    const match = spotifyUrl.match(/playlist\/([A-Za-z0-9]+)/);
    if (match && match[1] !== selectedPlaylistId) {
      setSelectedPlaylistId(match[1]);
    }
  }, [spotifyUrl, selectedPlaylistId]);

  const saveSpotifyAuthState = (state) => {
    setSpotifyAuthState(state);
    if (typeof window !== 'undefined') {
      if (state) {
        window.localStorage.setItem('spotify_auth_state_v1', JSON.stringify(state));
      } else {
        window.localStorage.removeItem('spotify_auth_state_v1');
      }
    }
  };

  const exchangeSpotifyCode = async (code) => {
    const { clientId, redirectUri } = getSpotifyConfig();
    if (!clientId || !redirectUri || typeof window === 'undefined') {
      throw new Error('Missing Spotify client configuration');
    }
    const verifier = window.localStorage.getItem('spotify_code_verifier');
    if (!verifier) {
      throw new Error('Missing Spotify PKCE verifier');
    }
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      throw new Error('Spotify token exchange failed');
    }
    return response.json();
  };

  const refreshSpotifyToken = async (refreshToken) => {
    const { clientId } = getSpotifyConfig();
    if (!clientId) throw new Error('Missing Spotify client ID');
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
    const response = await fetch(SPOTIFY_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!response.ok) {
      throw new Error('Spotify token refresh failed');
    }
    return response.json();
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    const expectedState = window.localStorage.getItem('spotify_auth_state_nonce');
    if (!code || state !== expectedState) return;
    let isMounted = true;
    setSpotifyLoading(true);
    exchangeSpotifyCode(code)
      .then((data) => {
        if (!isMounted) return;
        const authState = {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + data.expires_in * 1000,
        };
        saveSpotifyAuthState(authState);
        setSpotifyError('');
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error(err);
        setSpotifyError('Spotify login failed.');
        saveSpotifyAuthState(null);
      })
      .finally(() => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem('spotify_code_verifier');
          window.localStorage.removeItem('spotify_auth_state_nonce');
          const cleanParams = new URLSearchParams(window.location.search);
          cleanParams.delete('code');
          cleanParams.delete('state');
          const newQuery = cleanParams.toString();
          const newUrl = `${window.location.pathname}${newQuery ? `?${newQuery}` : ''}`;
          window.history.replaceState({}, '', newUrl);
        }
        if (isMounted) setSpotifyLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ensurePlaylists = async () => {
      if (!spotifyAuthState?.accessToken) return;
      try {
        setSpotifyLoading(true);
        let token = spotifyAuthState.accessToken;
        if (
          spotifyAuthState.expiresAt &&
          Date.now() > spotifyAuthState.expiresAt - 60_000 &&
          spotifyAuthState.refreshToken
        ) {
          const refreshed = await refreshSpotifyToken(spotifyAuthState.refreshToken);
          token = refreshed.access_token;
          saveSpotifyAuthState({
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token || spotifyAuthState.refreshToken,
            expiresAt: Date.now() + refreshed.expires_in * 1000,
          });
        }
        const response = await fetch('https://api.spotify.com/v1/me/playlists?limit=50', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error('Failed to load playlists');
        }
        const data = await response.json();
        if (!cancelled) {
          setSpotifyPlaylists(data.items || []);
          setSpotifyError('');
        }
      } catch (error) {
        if (!cancelled) {
          console.error(error);
          setSpotifyError(
            'Unable to load Spotify playlists. Please reconnect your Spotify account.'
          );
        }
      } finally {
        if (!cancelled) setSpotifyLoading(false);
      }
    };
    ensurePlaylists();
    return () => {
      cancelled = true;
    };
  }, [spotifyAuthState]);

  const startSpotifyLogin = async () => {
    const { clientId, redirectUri } = getSpotifyConfig();
    if (!clientId || !redirectUri) {
      setSpotifyError('Spotify client has not been configured.');
      return;
    }
    if (typeof window === 'undefined' || !window.crypto?.subtle) {
      setSpotifyError('This browser does not support the required crypto APIs for Spotify login.');
      return;
    }
    const verifier = generateRandomString(128);
    const challenge = await createCodeChallenge(verifier);
    const state = generateRandomString(16);
    window.localStorage.setItem('spotify_code_verifier', verifier);
    window.localStorage.setItem('spotify_auth_state_nonce', state);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: SPOTIFY_SCOPES.join(' '),
      redirect_uri: redirectUri,
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
    });
    window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
  };

  useEffect(() => {
    const ensureUserDocument = async () => {
      if (!currentUser || !appId) return;
      const userRef = doc(db, ...userCollectionPath, currentUser.uid);
      const snap = await getDoc(userRef);
      const now = new Date();
      const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
      if (!snap.exists()) {
        await setDoc(userRef, {
          id: currentUser.uid,
          display_name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Hero',
          avatarUrl: '',
          total_xp: 0,
          weekly_xp: 0,
          star_coins: 0,
          fairness_threshold: 1000,
          monthly_xp_start: 0,
          monthly_start_month: monthKey,
          monthly_reward_title: '',
        });
      }
      // Set loading to false after ensuring user document exists
      setUsersLoading(false);
    };
    ensureUserDocument();
  }, [currentUser, appId, userCollectionPath]);

  useEffect(() => {
    if (!appId) return;
    const usersRef = collection(db, ...userCollectionPath);
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const u = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      setUsers(u);
      setUsersLoading(false);
    });
    return () => unsubscribe();
  }, [appId, userCollectionPath]);

  useEffect(() => {
    if (!appId) return;
    const choresRef = collection(db, ...choreCollectionPath);
    const unsubscribe = onSnapshot(choresRef, (snapshot) => {
      const data = snapshot.docs.map((docSnap) =>
        normalizeQuestDoc({
          id: docSnap.id,
          ...docSnap.data(),
        })
      );
      setChores(data);
    });
    return () => unsubscribe();
  }, [appId, choreCollectionPath]);

  useEffect(() => {
    if (!appId) return;
    const historyRef = collection(db, ...historyCollectionPath);
    const unsubscribe = onSnapshot(historyRef, (snapshot) => {
      const entries = snapshot.docs
        .map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
        .sort((a, b) => {
          const aDate = coerceDate(a.completedAt || a.completed_at)?.getTime() || 0;
          const bDate = coerceDate(b.completedAt || b.completed_at)?.getTime() || 0;
          return bDate - aDate;
        });
      setHistoryEntries(entries);
    });
    return () => unsubscribe();
  }, [appId, historyCollectionPath]);

  useEffect(() => {
    if (!users.length) return;
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${now.getMonth() + 1}`;
    users.forEach((user) => {
      if (!user.id || monthlySyncRef.current[user.id] === monthKey) return;
      if (user.monthly_start_month !== monthKey) {
        const userRef = doc(db, ...userCollectionPath, user.id);
        updateDoc(userRef, {
          monthly_xp_start: user.total_xp || 0,
          monthly_start_month: monthKey,
        });
      }
      monthlySyncRef.current[user.id] = monthKey;
    });
  }, [users, appId]);

  const weeklyStats = useMemo(() => {
    if (!users.length) return { highest: 0, lowest: null };
    let highest = 0;
    let lowestUser = null;
    users.forEach((u) => {
      const weekly = u.weekly_xp || 0;
      if (weekly > highest) highest = weekly;
      if (!lowestUser || weekly < (lowestUser.weekly_xp || 0)) {
        lowestUser = u;
      }
    });
    return { highest, lowest: lowestUser };
  }, [users]);

  const monthlyLeaderboard = useMemo(() => {
    return [...users]
      .map((u) => ({
        ...u,
        monthlyXp: (u.total_xp || 0) - (u.monthly_xp_start || 0),
      }))
      .sort((a, b) => b.monthlyXp - a.monthlyXp);
  }, [users]);

  const quests = chores;

  const dueQuests = useMemo(() => {
    const now = new Date();
    return quests.filter((quest) => isQuestDue(quest, now));
  }, [quests]);

  const sortByTitle = (a, b) => a.title.localeCompare(b.title);

  const myReservedDueQuests = useMemo(
    () =>
      dueQuests
        .filter((quest) => quest.reservedById === currentUser?.uid)
        .sort(sortByTitle),
    [dueQuests, currentUser]
  );

  useEffect(() => {
    if (!myReservedDueQuests.length) {
      setSelectedReservedChoreId(null);
      if (timerState.isRunning) {
        setTimerState({ choreId: null, isRunning: false, elapsedMs: 0 });
      }
      return;
    }
    if (!selectedReservedChoreId) {
      setSelectedReservedChoreId(myReservedDueQuests[0].id);
    }
  }, [myReservedDueQuests, selectedReservedChoreId, timerState.isRunning]);

  useEffect(() => {
    if (!timerState.isRunning || !timerState.choreId) {
      timerStartRef.current = null;
      return;
    }
    if (!timerStartRef.current) {
      timerStartRef.current = Date.now() - timerState.elapsedMs;
    }
    const handle = setInterval(() => {
      setTimerState((prev) => ({
        ...prev,
        elapsedMs: Date.now() - (timerStartRef.current || Date.now()),
      }));
    }, 1000);
    return () => clearInterval(handle);
  }, [timerState.isRunning, timerState.choreId]);

  const reservedQuests = useMemo(
    () =>
      dueQuests
        .filter(
          (quest) =>
            quest.isActive !== false &&
            Boolean(quest.reservedById)
        )
        .sort(sortByTitle),
    [dueQuests]
  );
  const availableQuests = useMemo(
    () =>
      dueQuests
        .filter(
          (quest) =>
            quest.isActive !== false &&
            !quest.reservedById
        )
        .sort(sortByTitle),
    [dueQuests]
  );
  const completedQuestsRecent = useMemo(() => {
    // Get recent completions from history (last 10 entries, sorted by most recent)
    if (!historyEntries || historyEntries.length === 0) return [];
    
    return historyEntries
      .map((entry) => {
        // Ensure we have a valid entry with questTitle
        const completedAt = coerceDate(entry.completedAt || entry.completed_at);
        return {
          ...entry,
          _sortDate: completedAt ? completedAt.getTime() : 0,
        };
      })
      .filter((entry) => {
        // Include entries that have a questTitle (required field)
        return entry.questTitle || entry.quest_title;
      })
      .sort((a, b) => {
        // Sort by date (most recent first), fallback to 0 if no date
        return (b._sortDate || 0) - (a._sortDate || 0);
      })
      .slice(0, 10)
      .map(({ _sortDate, ...entry }) => entry); // Remove temporary sort field
  }, [historyEntries]);

  const handleCreateQuest = async () => {
    if (!newQuestForm.title.trim()) return;
    
    console.log('handleCreateQuest called, creating quest...');
    
    try {
      await addDoc(collection(db, ...choreCollectionPath), {
        title: newQuestForm.title.trim(),
        difficulty: newQuestForm.difficulty,
        xp: difficultyPresets[newQuestForm.difficulty].xp,
        frequencyType: newQuestForm.frequencyType,
        frequencyInterval: newQuestForm.frequencyInterval,
        isActive: true,
        nextDueAt: serverTimestamp(), // Set to now so quest appears immediately
        createdById: currentUser.uid,
        createdByName:
          currentUserDoc?.display_name ||
          currentUser.displayName ||
          currentUser.email?.split('@')[0] ||
          'Hero',
        reservedById: null,
        reservedByName: null,
        lastCompletedAt: null,
        lastFocusDurationSeconds: null,
        lastCompletedById: null,
        lastCompletedByName: null,
        createdAt: serverTimestamp(),
      });
      console.log('Quest created successfully');
    } catch (error) {
      console.error('Error creating quest', error);
    } finally {
      console.log('Closing modal and resetting form...');
      setNewQuestForm(initialTaskForm);
      setNewQuestModal(false);
      console.log('Modal should be closed now');
    }
  };

  const toggleReservation = async (quest) => {
    if (!isQuestDue(quest)) return;
    if (quest.reservedById && quest.reservedById !== currentUser.uid) return;
    const questRef = doc(db, ...choreCollectionPath, quest.id);
    const alreadyReserved = quest.reservedById === currentUser.uid;
    await updateDoc(questRef, {
      reservedById: alreadyReserved ? null : currentUser.uid,
      reservedByName: alreadyReserved
        ? null
        : player.display_name || currentUser.displayName || currentUser.email,
    });
  };

  const handleFocusQuest = async (quest) => {
    if (!isQuestDue(quest)) return;
    if (quest.reservedById && quest.reservedById !== currentUser.uid) return;
    if (!quest.reservedById) {
      await toggleReservation(quest);
    }
    setSelectedReservedChoreId(quest.id);
    setActivePage(PAGES.FOCUS_MODE);
  };

  const startTimer = () => {
    if (!selectedReservedChoreId) return;
    setTimerState((prev) => ({
      choreId: selectedReservedChoreId,
      isRunning: true,
      elapsedMs: prev.choreId === selectedReservedChoreId ? prev.elapsedMs : 0,
    }));
  };

  const pauseTimer = () => {
    setTimerState((prev) => ({ ...prev, isRunning: false }));
  };

  const resetTimer = () => {
    setTimerState({ choreId: null, isRunning: false, elapsedMs: 0 });
    timerStartRef.current = null;
  };

  const openCompletion = (choreId, preserveNotes = false) => {
    setCompletionUserId(currentUser?.uid || '');
    if (!preserveNotes) {
      setNotes('');
    }
    setCompletionModal({ open: true, choreId });
  };

  const updateUserProgress = async (userId, xpDelta) => {
    const user = users.find((u) => u.id === userId);
    const baseTotal = user?.total_xp || 0;
    const baseWeekly = user?.weekly_xp || 0;
    const newTotal = baseTotal + xpDelta;
    const newWeekly = baseWeekly + xpDelta;
    const newStarCoins = Math.floor(newTotal / 10);
    const userRef = doc(db, ...userCollectionPath, userId);
    await setDoc(
      userRef,
      {
        total_xp: newTotal,
        weekly_xp: newWeekly,
        star_coins: newStarCoins,
      },
      { merge: true }
    );
  };

  const handleConfirmCompletion = async () => {
    if (!completionModal.choreId || !completionUserId) return;
    const quest = chores.find((c) => c.id === completionModal.choreId);
    if (!quest) return;
    if (!isQuestDue(quest)) {
      setCompletionModal({ open: false, choreId: null });
      return;
    }
    const focusDurationSeconds =
      timerState.choreId === quest.id ? Math.floor(timerState.elapsedMs / 1000) : null;
    const { xpAward } = calculateXpWithFairness(completionUserId, quest.xp || 0, weeklyStats);
    const completedUser = users.find((u) => u.id === completionUserId);
    const completedByName = completedUser?.display_name || completedUser?.id || 'Hero';
    try {
      await updateUserProgress(completionUserId, xpAward);
      const questRef = doc(db, ...choreCollectionPath, quest.id);
      
      // Create QuestHistoryEntry
      await addDoc(collection(db, ...historyCollectionPath), {
        questId: quest.id,
        questTitle: quest.title,
        completedById: completionUserId,
        completedByName,
        completedAt: serverTimestamp(),
        xpAwarded: xpAward,
        reservedById: quest.reservedById || null,
        reservedByName: quest.reservedByName || null,
        focusDurationSeconds,
        notes: notes || null,
      });
      
      // Update quest based on frequency type
      const frequencyType = quest.frequencyType || quest.frequency || 'once';
      const frequencyInterval = quest.frequencyInterval ?? 1;
      const now = new Date();
      
      const updateData = {
        reservedById: null,
        reservedByName: null,
        lastCompletedAt: serverTimestamp(),
        lastFocusDurationSeconds: focusDurationSeconds,
        lastCompletedById: completionUserId,
        lastCompletedByName: completedByName,
      };
      
      if (frequencyType === 'once') {
        // One-time quest: set isActive = false
        updateData.isActive = false;
      } else {
        // Recurring quest: calculate nextDueAt
        const nextDueAt = calculateNextDueAt(frequencyType, frequencyInterval, now);
        updateData.nextDueAt = Timestamp.fromDate(nextDueAt);
      }
      
      await updateDoc(questRef, updateData);
    } catch (error) {
      console.error('Completion error', error);
    } finally {
      setCompletionModal({ open: false, choreId: null });
      setCompletionUserId('');
      setNotes('');
      resetTimer();
    }
  };

  const handleAvatarSave = async (nextUrl) => {
    if (!nextUrl) return;
    setSavingProfile(true);
    try {
      const userRef = doc(db, ...userCollectionPath, currentUser.uid);
      await setDoc(userRef, { avatarUrl: nextUrl }, { merge: true });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleFairnessSave = async () => {
    setSavingFairness(true);
    try {
      const userRef = doc(db, ...userCollectionPath, currentUser.uid);
      await setDoc(
        userRef,
        { fairness_threshold: Number(fairnessInput) || 1000 },
        { merge: true }
      );
    } finally {
      setSavingFairness(false);
    }
  };

  const handleRewardSave = async () => {
    setSavingReward(true);
    try {
      const userRef = doc(db, ...userCollectionPath, currentUser.uid);
      await setDoc(userRef, { monthly_reward_title: rewardNote }, { merge: true });
    } finally {
      setSavingReward(false);
    }
  };

  const normalizeSpotifyUrl = (url) => {
    if (!url) return DEFAULT_SPOTIFY_EMBED;
    if (url.includes('/embed/')) return url;
    if (url.includes('open.spotify.com/playlist/')) {
      const [base] = url.split('?');
      const playlistId = base.split('/playlist/')[1];
      return `https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator`;
    }
    return url;
  };

  const persistSpotifyUrl = async (nextUrl) => {
    const normalized = normalizeSpotifyUrl(nextUrl);
    setSavingSpotify(true);
    try {
      const userRef = doc(db, ...userCollectionPath, currentUser.uid);
      await setDoc(userRef, { spotify_playlist_url: normalized }, { merge: true });
      setSpotifyUrl(normalized);
      setSpotifyInput(normalized);
      setSpotifyError('');
    } catch (error) {
      console.error(error);
      setSpotifyError('Unable to save Spotify playlist.');
    } finally {
      setSavingSpotify(false);
    }
  };

  const handleSpotifySave = () => {
    const trimmed = spotifyInput.trim();
    if (!trimmed) return;
    persistSpotifyUrl(trimmed);
  };

  const handlePlaylistSelect = (playlistId) => {
    setSelectedPlaylistId(playlistId);
    if (!playlistId) return;
    const embed = `https://open.spotify.com/embed/playlist/${playlistId}?utm_source=generator`;
    persistSpotifyUrl(embed);
  };

  const handleSignOut = async () => {
    try {
      setSigningOut(true);
      await signOut(auth);
    } catch (error) {
      console.error('Sign-out error', error);
    } finally {
      setSigningOut(false);
    }
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-400 to-purple-600 flex items-center justify-center text-white font-pixel">
        Loading...
      </div>
    );
  }

  const player = currentUserDoc || {
    id: currentUser.uid,
    display_name: currentUser.displayName || currentUser.email?.split('@')[0] || 'Hero',
    avatarUrl: currentUser.photoURL || '',
    total_xp: 0,
    weekly_xp: 0,
    star_coins: 0,
    fairness_threshold: 1000,
    monthly_xp_start: 0,
    monthly_reward_title: '',
  };

  const profileUser = {
    id: player.id,
    displayName: player.display_name || player.displayName || 'Hero',
    avatarUrl: player.avatarUrl || AVATAR_OPTIONS[0].data,
    totalXp: player.total_xp || 0,
    weeklyXp: player.weekly_xp || 0,
    starCoins: player.star_coins || 0,
    friendCodeShort: generateFriendCode(player.friend_code || player.id),
  };

  // Profile page is now rendered inline with the main layout, not as a separate component

  const gradientBackground = {
    background: 'linear-gradient(135deg, #34216d 0%, #5176fd 45%, #2fb1a8 100%)',
  };

  const vignetteLayer = {
    background: 'radial-gradient(circle at center, rgba(0,0,0,0) 40%, rgba(0,0,0,0.35) 100%)',
  };

  const pixelGridLayer = {
    backgroundImage:
      'linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)',
    backgroundSize: '4px 4px',
  };

  const scanlineLayer = {
    backgroundImage: 'linear-gradient(rgba(0,0,0,0.25) 1px, transparent 1px)',
    backgroundSize: '100% 6px',
  };

  const panelClass =
    'bg-gradient-to-br from-[#1c1133] to-[#251744] border-[3px] border-[#49297E] shadow-[0_0_0_3px_#000,0_8px_0_#000] p-5 space-y-4 text-white';

  const statCardClass =
    'bg-[#190f33] border-2 border-black text-center px-4 py-5 shadow-[0_4px_0_#000]';

  const neonButton = (variant = 'primary') => {
    if (variant === 'primary') {
      return 'border-4 border-black bg-[#E10086] text-white px-4 py-2 text-xs tracking-[0.2em] uppercase shadow-[4px_4px_0_#000] hover:-translate-y-0.5 transition';
    }
    if (variant === 'ghost') {
      return 'border-4 border-[#90DCFF] text-[#90DCFF] px-4 py-2 text-xs tracking-[0.2em] uppercase hover:bg-[#90DCFF]/10 transition';
    }
    return 'border-4 border-[#00DB96] text-[#00DB96] px-4 py-2 text-xs tracking-[0.2em] uppercase hover:bg-[#00DB96]/10 transition';
  };

  const navButton = (label, page) => {
    const isActive = activePage === page;
    return (
      <button
        key={page}
        onClick={() => setActivePage(page)}
        className={`px-4 py-2 text-[10px] tracking-[0.25em] uppercase border-4 ${
          isActive
            ? 'bg-[#E10086] border-black text-white shadow-[4px_4px_0_#000]'
            : 'border-[#90DCFF] text-[#90DCFF] hover:bg-[#90DCFF]/10'
        }`}
      >
        {label}
      </button>
    );
  };

  const focusChore = myReservedDueQuests.find((c) => c.id === selectedReservedChoreId);

  const renderDashboard = () => (
    <section className={panelClass}>
      <div>
        <p className="text-[#FDFB76] text-sm uppercase tracking-[0.2em]">Quest Dashboard</p>
        <p className="text-[#90DCFF] text-[10px] mt-1">Household status overview</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className={statCardClass}>
          <div className="h-2 mb-3 rounded-full bg-gradient-to-r from-[#00DB96] via-[#90DCFF] to-[#FDFB76]" />
          <p className="text-[#90DCFF] text-[10px] tracking-[0.2em]">TOTAL XP</p>
          <p className="text-[#FDFB76] text-2xl mt-2">{player.total_xp?.toLocaleString() || 0}</p>
          <p className="text-gray-300 text-[9px] mt-1">Lifetime quests</p>
        </div>
        <div className={statCardClass}>
          <div className="h-2 mb-3 rounded-full bg-gradient-to-r from-[#FDE48A] to-[#E10086]" />
          <p className="text-[#90DCFF] text-[10px] tracking-[0.2em]">WEEKLY XP</p>
          <p className="text-[#FDFB76] text-2xl mt-2">
            {player.weekly_xp?.toLocaleString() || 0}
          </p>
          <p className="text-gray-300 text-[9px] mt-1">This week&apos;s grind</p>
        </div>
        <div className={statCardClass}>
          <div className="h-2 mb-3 rounded-full bg-gradient-to-r from-[#00DB96] to-[#2fb1a8]" />
          <p className="text-[#90DCFF] text-[10px] tracking-[0.2em]">STAR COINS</p>
          <p className="text-[#FDFB76] text-2xl mt-2">
            {Math.floor(player.star_coins || 0).toLocaleString()}
          </p>
          <p className="text-gray-300 text-[9px] mt-1">Reward Hall currency</p>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-[#0b0717] border-[3px] border-[#00DB96] p-4 shadow-[0_4px_0_#000]">
          <p className="text-[#FDFB76] text-xs uppercase tracking-[0.2em]">Fairness meter</p>
          <p className="text-[#90DCFF] text-[10px] mt-2">
            Gap: {weeklyStats.highest - (weeklyStats.lowest?.weekly_xp || 0)} XP /{' '}
            {player.fairness_threshold || 1000}
          </p>
          <div className="w-full bg-[#1c1133] border-2 border-black h-4 rounded mt-3">
            <div
              className="h-full bg-gradient-to-r from-[#00DB96] via-[#90DCFF] to-[#E10086]"
              style={{
                width: `${Math.min(
                  100,
                  ((weeklyStats.highest - (weeklyStats.lowest?.weekly_xp || 0)) /
                    (player.fairness_threshold || 1)) *
                    100
                ).toFixed(1)}%`,
              }}
            />
          </div>
        </div>
        <div className="bg-[#0b0717] border-[3px] border-[#49297E] p-4 shadow-[0_4px_0_#000]">
          <p className="text-[#FDFB76] text-xs uppercase tracking-[0.2em] mb-3">
            Leaderboard
          </p>
          <ul className="space-y-2 text-sm">
            {users
              .slice()
              .sort((a, b) => (b.total_xp || 0) - (a.total_xp || 0))
              .map((u, idx) => (
                <li
                  key={u.id}
                  className="flex justify-between text-[#FDFB76] bg-[#1a1030] border-2 border-black px-3 py-2"
                >
                  <span>
                    #{idx + 1} {u.display_name || u.id}
                  </span>
                  <span className="text-[#90DCFF]">{u.total_xp || 0} XP</span>
                </li>
              ))}
          </ul>
        </div>
      </div>
    </section>
  );

  const renderQuestLog = () => {
    const renderQuestCard = (quest, showActions = true) => {
      const reservedByOther =
        quest.reservedById && quest.reservedById !== currentUser?.uid;
      return (
        <div
          key={quest.id}
          className="bg-[#1a1030] border-2 border-black shadow-[0_4px_0_#000] p-4 space-y-2"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <p className="text-[#FDFB76] text-lg">{quest.title}</p>
              <p className="text-[#90DCFF] text-xs">
                Difficulty: {quest.difficulty} · XP: {quest.xp} ·{' '}
                {quest.frequencyType === 'once'
                  ? 'Once'
                  : `${quest.frequencyType.charAt(0).toUpperCase() + quest.frequencyType.slice(1)} · every ${quest.frequencyInterval || 1} ${quest.frequencyType === 'daily' ? 'day' : quest.frequencyType === 'weekly' ? 'week' : 'month'}${(quest.frequencyInterval || 1) > 1 ? 's' : ''}`}
              </p>
              <p className="text-[#90DCFF] text-[10px] mt-1">
                Created by: {quest.createdByName || quest.createdById || 'Unknown'}
              </p>
              <p className="text-[#90DCFF] text-[10px]">
                Reserved by: {quest.reservedByName || '—'}
              </p>
              {quest.lastCompletedAt && (
                <p className="text-[#90DCFF] text-[10px]">
                  Last completed by {quest.lastCompletedByName || '—'} on{' '}
                  {quest.lastCompletedAt.toLocaleString()}
                </p>
              )}
            </div>
            {showActions && (
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => toggleReservation(quest)}
                  disabled={reservedByOther}
                  className={`border-4 border-black px-4 py-2 text-xs tracking-[0.2em] uppercase shadow-[3px_3px_0_#000] ${
                    quest.reservedById === currentUser?.uid
                      ? 'bg-[#E10086] text-white'
                      : 'bg-[#00DB96] text-black'
                  } ${reservedByOther ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {quest.reservedById === currentUser?.uid ? 'Release' : 'Reserve'}
                </button>
                <button
                  onClick={() => openCompletion(quest.id)}
                  disabled={reservedByOther}
                  className={`border-4 border-black bg-[#FDFB76] text-black px-4 py-2 text-xs tracking-[0.2em] uppercase shadow-[3px_3px_0_#000] ${
                    reservedByOther ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  Complete
                </button>
                <button
                  onClick={() => handleFocusQuest(quest)}
                  disabled={reservedByOther}
                  className={`border-4 border-black bg-[#5176fd] text-white px-4 py-2 text-xs tracking-[0.2em] uppercase shadow-[3px_3px_0_#000] ${
                    reservedByOther ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  Focus
                </button>
              </div>
            )}
          </div>
        </div>
      );
    };

    const renderHistoryCard = (entry) => {
      const completedDate = coerceDate(entry.completedAt || entry.completed_at);
      return (
        <div
          key={entry.id}
          className="bg-[#1a1030] border-2 border-black shadow-[0_4px_0_#000] p-4 space-y-2"
        >
          <p className="text-[#FDFB76] text-lg">{entry.questTitle || entry.quest_title}</p>
          <p className="text-[#90DCFF] text-xs">
            Completed by: {entry.completedByName || entry.completed_by_name || entry.completedById || '—'}
          </p>
          <p className="text-[#90DCFF] text-xs">XP Awarded: {entry.xpAwarded || entry.xp_awarded || 0}</p>
          {entry.reservedByName && (
            <p className="text-[#90DCFF] text-xs">
              Reserved by: {entry.reservedByName || entry.reserved_by_name || '—'}
            </p>
          )}
          {completedDate && (
            <p className="text-[#90DCFF] text-xs">
              Date: {completedDate.toLocaleString()}
            </p>
          )}
          {entry.focusDurationSeconds != null && (
            <p className="text-[#90DCFF] text-xs">
              Focus duration: {formatMs((entry.focusDurationSeconds || 0) * 1000)}
            </p>
          )}
        </div>
      );
    };

    return (
      <section className={panelClass}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[#FDFB76] text-sm uppercase tracking-[0.2em]">Quest Log</p>
            <p className="text-[#90DCFF] text-[10px] mt-1">
              Manage active quests for the household
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setNewQuestModal(true)} className={neonButton('primary')}>
              Create Quest
            </button>
            <button
              onClick={() => setActivePage(PAGES.FOCUS_MODE)}
              className={neonButton('accent')}
            >
              Focus Mode
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Reserved Quests Panel */}
          <div className="bg-[#0b0717] border-[3px] border-[#49297E] p-4 shadow-[0_4px_0_#000]">
            <h3 className="text-[#FDFB76] text-sm uppercase tracking-[0.2em] mb-4">
              Reserved Quests
            </h3>
            <div className="space-y-3">
              {reservedQuests.length > 0
                ? reservedQuests.map((quest) => renderQuestCard(quest, true))
                : (
                  <p className="text-[#90DCFF] text-xs">No quests are reserved right now.</p>
                )}
            </div>
          </div>

          {/* Available Quests Panel */}
          <div className="bg-[#0b0717] border-[3px] border-[#49297E] p-4 shadow-[0_4px_0_#000]">
            <h3 className="text-[#FDFB76] text-sm uppercase tracking-[0.2em] mb-4">
              Available Quests
            </h3>
            <div className="space-y-3">
              {availableQuests.length > 0
                ? availableQuests.map((quest) => renderQuestCard(quest, true))
                : (
                  <p className="text-[#90DCFF] text-xs">No quests are currently available.</p>
                )}
            </div>
          </div>

          {/* Completed Quests Panel */}
          <div className="bg-[#0b0717] border-[3px] border-[#49297E] p-4 shadow-[0_4px_0_#000]">
            <h3 className="text-[#FDFB76] text-sm uppercase tracking-[0.2em] mb-4">
              Completed Quests (recent)
            </h3>
            <div className="space-y-3">
              {completedQuestsRecent.length > 0
                ? completedQuestsRecent.map((entry) => renderHistoryCard(entry))
                : (
                  <p className="text-[#90DCFF] text-xs">No quests completed recently.</p>
                )}
            </div>
          </div>
        </div>
      </section>
    );
  };

  const spotifyConfig = getSpotifyConfig();
  const spotifyConnected = Boolean(spotifyAuthState?.accessToken);

  const renderFocusMode = () => (
    <section className={panelClass}>
      <div>
        <p className="text-[#FDFB76] text-sm uppercase tracking-[0.2em]">Focus Mode</p>
        <p className="text-[#90DCFF] text-[10px] mt-1">Time your quest streak</p>
      </div>
      <div className="bg-[#0b0717] border-[3px] border-[#49297E] p-4 shadow-[0_4px_0_#000]">
        <label className="block text-[10px] uppercase tracking-[0.2em] text-[#FDFB76] mb-2">
          Reserved quest
        </label>
        <select
          value={selectedReservedChoreId || ''}
          onChange={(e) => setSelectedReservedChoreId(e.target.value)}
          className="w-full bg-black border-2 border-[#90DCFF] text-white px-3 py-2 text-xs"
        >
          <option value="">Select a quest</option>
          {myReservedDueQuests.map((quest) => (
            <option value={quest.id} key={quest.id}>
              {quest.title}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-[#1a1030] border-2 border-black shadow-[0_4px_0_#000] p-5">
          <p className="text-[#FDFB76] text-xs uppercase tracking-[0.2em]">Timer</p>
          {focusChore ? (
            <>
              <p className="text-5xl text-[#FDE48A] mt-4">{formatMs(timerState.elapsedMs)}</p>
              <p className="text-[#90DCFF] text-[10px] mt-2">Current quest: {focusChore.title}</p>
              <div className="flex gap-2 flex-wrap mt-4">
                {!timerState.isRunning && (
                  <button onClick={startTimer} className={neonButton('primary')}>
                    Start
                  </button>
                )}
                {timerState.isRunning && (
                  <button onClick={pauseTimer} className={neonButton('accent')}>
                    Pause
                  </button>
                )}
                <button
                  onClick={resetTimer}
                  className="border-4 border-black bg-[#E10086] text-white px-4 py-2 text-xs tracking-[0.2em] uppercase shadow-[3px_3px_0_#000]"
                >
                  Reset
                </button>
              </div>
            </>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-[#90DCFF] text-sm">Reserve a quest to enable the timer.</p>
              <button
                onClick={() => setActivePage(PAGES.QUEST_LOG)}
                className={neonButton('accent')}
              >
                Open Quest Log
              </button>
            </div>
          )}
        </div>
        <div className="bg-[#1a1030] border-2 border-black shadow-[0_4px_0_#000] p-5 space-y-3">
          <p className="text-[#FDFB76] text-xs uppercase tracking-[0.2em]">Spotify Playlist</p>
          {!spotifyConfig.clientId ? (
            <p className="text-[#E10086] text-xs">
              Spotify integration not configured. Set REACT_APP_SPOTIFY_CLIENT_ID and
              REACT_APP_SPOTIFY_REDIRECT_URI in your environment.
            </p>
          ) : !spotifyConnected ? (
            <div className="space-y-2">
              <p className="text-[#90DCFF] text-xs">
                Connect your Spotify account to access private playlists, or use a shareable link
                below.
              </p>
              <button onClick={startSpotifyLogin} className={neonButton('primary')}>
                Connect Spotify
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {spotifyError && <p className="text-[#E10086] text-xs">{spotifyError}</p>}
              {spotifyLoading ? (
                <p className="text-[#90DCFF] text-xs">Loading playlists...</p>
              ) : (
                <>
                  <label className="text-[#FDFB76] text-[10px] uppercase tracking-[0.2em]">
                    Choose playlist
                  </label>
                  <select
                    value={selectedPlaylistId}
                    onChange={(e) => handlePlaylistSelect(e.target.value)}
                    className="w-full bg-black border-2 border-[#90DCFF] text-white px-3 py-2 text-xs"
                  >
                    <option value="">Manual or public link</option>
                    {spotifyPlaylists.map((playlist) => (
                      <option key={playlist.id} value={playlist.id}>
                        {playlist.name} {playlist.public ? '' : '(Private)'}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <label className="text-[#FDFB76] text-[10px] uppercase tracking-[0.2em]">
              Playlist link or embed URL
            </label>
            <input
              value={spotifyInput}
              onChange={(e) => setSpotifyInput(e.target.value)}
              placeholder="Paste Spotify playlist link"
              className="bg-black border-2 border-[#90DCFF] text-white px-3 py-2 text-xs"
            />
            <button
              onClick={handleSpotifySave}
              disabled={savingSpotify}
              className={`border-4 border-black bg-[#00DB96] text-black px-4 py-2 text-xs tracking-[0.2em] uppercase shadow-[3px_3px_0_#000] ${
                savingSpotify ? 'opacity-60' : ''
              }`}
            >
              {savingSpotify ? 'Saving...' : 'Sync Playlist'}
            </button>
          </div>
          <iframe
            title="Focus soundtrack"
            src={spotifyUrl}
            width="100%"
            height="172"
            frameBorder="0"
            allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
            loading="lazy"
            className="border-2 border-black bg-black"
          ></iframe>
        </div>
      </div>
      {focusChore && (
        <div className="bg-[#0b0717] border-[3px] border-[#49297E] p-4 shadow-[0_4px_0_#000] space-y-3">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Focus notes..."
            className="w-full bg-black border-2 border-[#90DCFF] text-white px-3 py-2 text-xs min-h-[120px]"
          />
            <button
              onClick={() => openCompletion(focusChore.id, true)}
              className="border-4 border-black bg-[#00DB96] text-black px-4 py-2 text-xs tracking-[0.2em] uppercase shadow-[3px_3px_0_#000]"
            >
              Complete Quest
            </button>
        </div>
      )}
    </section>
  );

  const renderRewardHall = () => (
    <div className="space-y-6">
      <section className={panelClass}>
        <div>
          <p className="text-[#FDFB76] text-sm uppercase tracking-[0.2em]">Weekly XP Leaderboard</p>
          <p className="text-[#90DCFF] text-[10px] mt-1">Who&apos;s cleaning up the most</p>
        </div>
        <ul className="space-y-2">
          {users
            .slice()
            .sort((a, b) => (b.weekly_xp || 0) - (a.weekly_xp || 0))
            .map((u, idx) => (
              <li
                key={u.id}
                className="flex justify-between bg-[#1a1030] border-2 border-black px-3 py-2 shadow-[0_3px_0_#000]"
              >
                <span className="text-[#FDFB76]">
                  #{idx + 1} {u.display_name || u.id}
                </span>
                <span className="text-[#90DCFF]">{u.weekly_xp || 0} XP</span>
              </li>
            ))}
        </ul>
      </section>
      <section className={panelClass}>
        <div>
          <p className="text-[#FDFB76] text-sm uppercase tracking-[0.2em]">Monthly Contest</p>
          <p className="text-[#90DCFF] text-[10px] mt-1">XP earned since the first of the month</p>
        </div>
        <ul className="space-y-2">
          {monthlyLeaderboard.map((u, idx) => (
            <li
              key={u.id}
              className="flex justify-between bg-[#1a1030] border-2 border-black px-3 py-2 shadow-[0_3px_0_#000]"
            >
              <span className="text-[#FDFB76]">
                #{idx + 1} {u.display_name || u.id}
              </span>
              <span className="text-[#90DCFF]">{u.monthlyXp} XP</span>
            </li>
          ))}
        </ul>
      </section>
      <section className={panelClass}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-[#FDFB76] text-xs uppercase tracking-[0.2em] mb-2">
              Fairness threshold
            </p>
            <input
              type="number"
              min={100}
              value={fairnessInput}
              onChange={(e) => setFairnessInput(Number(e.target.value))}
              className="w-full bg-black border-2 border-[#90DCFF] text-white px-3 py-2 text-xs"
            />
            <button
              onClick={handleFairnessSave}
              disabled={savingFairness}
              className={`mt-3 ${neonButton('accent')} ${savingFairness ? 'opacity-60' : ''}`}
            >
              {savingFairness ? 'Saving...' : 'Update Fairness'}
            </button>
          </div>
          <div>
            <p className="text-[#FDFB76] text-xs uppercase tracking-[0.2em] mb-2">
              Monthly prize
            </p>
            <input
              type="text"
              value={rewardNote}
              onChange={(e) => setRewardNote(e.target.value)}
              className="w-full bg-black border-2 border-[#90DCFF] text-white px-3 py-2 text-xs"
              placeholder="Custom reward (e.g., Sushi Night)"
            />
            <button
              onClick={handleRewardSave}
              disabled={savingReward}
              className={`mt-3 ${neonButton('primary')} ${savingReward ? 'opacity-60' : ''}`}
            >
              {savingReward ? 'Saving...' : 'Save Reward'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );

  const renderHistory = () => (
    <section className={panelClass}>
      <div>
        <p className="text-[#FDFB76] text-sm uppercase tracking-[0.2em]">History Log</p>
        <p className="text-[#90DCFF] text-[10px] mt-1">Every quest completion across the house</p>
      </div>
      <div className="space-y-3">
        {historyEntries.map((entry) => {
          const completedDate = coerceDate(entry.completedAt || entry.completed_at);
          return (
            <div
              key={entry.id}
              className="bg-[#1a1030] border-2 border-black shadow-[0_4px_0_#000] p-4 space-y-1"
            >
              <p className="text-[#FDFB76] text-lg">{entry.questTitle}</p>
              <p className="text-[#90DCFF] text-xs">
                Completed by: {entry.completedByName || entry.completedById}
              </p>
              <p className="text-[#90DCFF] text-xs">
                XP Awarded: {entry.xpAwarded || 0}
              </p>
              <p className="text-[#90DCFF] text-xs">
                Reserved by: {entry.reservedByName || '—'}
              </p>
              <p className="text-[#90DCFF] text-xs">
                Date: {completedDate ? completedDate.toLocaleString() : '—'}
              </p>
              {entry.focusDurationSeconds != null && (
                <p className="text-[#90DCFF] text-xs">
                  Focus duration: {formatMs((entry.focusDurationSeconds || 0) * 1000)}
                </p>
              )}
              {entry.notes && (
                <p className="text-[#90DCFF] text-xs">Notes: {entry.notes}</p>
              )}
            </div>
          );
        })}
        {historyEntries.length === 0 && (
          <p className="text-center text-[#90DCFF] text-sm">No quests completed yet.</p>
        )}
      </div>
    </section>
  );

  const renderProfile = () => {
    return (
      <div className="space-y-6">
        <section className={panelClass}>
          <div>
            <p className="text-[#FDFB76] text-sm uppercase tracking-[0.2em]">Player Stats</p>
            <p className="text-[#90DCFF] text-[10px] mt-1">Your current quest résumé</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className={statCardClass}>
              <div className="h-2 mb-3 rounded-full bg-gradient-to-r from-[#00DB96] via-[#90DCFF] to-[#FDFB76]" />
              <p className="text-[#90DCFF] text-[10px] tracking-[0.2em]">TOTAL XP</p>
              <p className="text-[#FDFB76] text-2xl mt-2">{profileUser.totalXp.toLocaleString()}</p>
              <p className="text-gray-300 text-[9px] mt-1">Lifetime quests</p>
            </div>
            <div className={statCardClass}>
              <div className="h-2 mb-3 rounded-full bg-gradient-to-r from-[#FDE48A] to-[#E10086]" />
              <p className="text-[#90DCFF] text-[10px] tracking-[0.2em]">WEEKLY XP</p>
              <p className="text-[#FDFB76] text-2xl mt-2">{profileUser.weeklyXp.toLocaleString()}</p>
              <p className="text-gray-300 text-[9px] mt-1">This week&apos;s grind</p>
            </div>
            <div className={statCardClass}>
              <div className="h-2 mb-3 rounded-full bg-gradient-to-r from-[#00DB96] to-[#2fb1a8]" />
              <p className="text-[#90DCFF] text-[10px] tracking-[0.2em]">STAR COINS</p>
              <p className="text-[#FDFB76] text-2xl mt-2">{profileUser.starCoins.toLocaleString()}</p>
              <p className="text-gray-300 text-[9px] mt-1">Reward Hall currency</p>
            </div>
          </div>
          <div className="bg-[#0b0717] border-[3px] border-[#00DB96] p-4 space-y-3">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="text-[#FDFB76] text-[10px] uppercase tracking-widest">
                Friend Code
              </div>
              <div className="text-[12px] bg-black border-2 border-[#90DCFF] px-3 py-1 text-[#90DCFF]">
                {profileUser.friendCodeShort}
              </div>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(profileUser.friendCodeShort);
                  } catch (err) {
                    console.error('Failed to copy:', err);
                  }
                }}
                className="border-[3px] border-black bg-[#00DB96] text-black px-3 py-1 text-[10px] shadow-[2px_2px_0_#000]"
              >
                Copy
              </button>
            </div>
          </div>
        </section>

        <section className={panelClass}>
          <div>
            <p className="text-[#FDFB76] text-sm uppercase tracking-[0.2em]">Avatar Selection</p>
            <p className="text-[#90DCFF] text-[10px] mt-1">Pick your pixel alter ego</p>
          </div>
          <div className="flex items-center gap-4 mb-4">
            <img
              src={profileUser.avatarUrl}
              alt="Current avatar"
              className="w-24 h-24 border-4 border-black bg-black"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AVATAR_OPTIONS.map((avatar) => {
              const isSelected = profileUser.avatarUrl === avatar.data;
              return (
                <button
                  key={avatar.id}
                  onClick={() => handleAvatarSave(avatar.data)}
                  disabled={savingProfile}
                  className={`relative px-4 py-5 text-left border-[3px] border-black shadow-[0_4px_0_#000] transition-transform ${
                    isSelected
                      ? 'bg-gradient-to-br from-[#49297E] to-[#12091f] border-[#00DB96]'
                      : 'bg-[#1a1030] hover:-translate-y-1'
                  } ${savingProfile ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSelected && (
                    <span className="absolute -top-3 right-2 text-[8px] bg-[#00DB96] text-black px-2 border-2 border-black">
                      Equipped
                    </span>
                  )}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 border-2 border-black bg-black flex items-center justify-center"
                      style={{ imageRendering: 'pixelated' }}
                    >
                      <span className="text-2xl">{avatar.emoji}</span>
                    </div>
                    <div>
                      <p className="text-xs text-[#FDFB76]">{avatar.label}</p>
                      <p className="text-[9px] text-[#90DCFF] mt-1">
                        Pixel alter ego
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    );
  };

  const renderPage = () => {
    switch (activePage) {
      case PAGES.DASHBOARD:
        return renderDashboard();
      case PAGES.QUEST_LOG:
        return renderQuestLog();
      case PAGES.FOCUS_MODE:
        return renderFocusMode();
      case PAGES.REWARD_HALL:
        return renderRewardHall();
      case PAGES.HISTORY:
        return renderHistory();
      case PAGES.PROFILE:
        return renderProfile();
      default:
        return null;
    }
  };

  return (
    <div className="relative min-h-screen font-pixel text-white overflow-hidden">
      <div className="absolute inset-0" style={gradientBackground} />
      <div className="absolute inset-0 opacity-70" style={pixelGridLayer} />
      <div className="absolute inset-0 opacity-60" style={scanlineLayer} />
      <div className="absolute inset-0" style={vignetteLayer} />
      <div className="relative min-h-screen py-2 px-1 flex items-start justify-center">
        <div className="w-full max-w-[95%]">
          <div className="border-4 border-black shadow-[0_20px_0_#000]">
            <div className="border-4 border-[#49297E] bg-[#12091f] min-h-[calc(100vh-80px)] flex flex-col">
              <header className="border-b-4 border-[#251744] p-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[#FDE48A] text-lg tracking-[0.3em]">
                    MEOWTIVATOR: QUEST LOG
                  </p>
                  <p className="text-[#90DCFF] text-xs mt-2">&gt; SELECT PAGE</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {navButton('Dashboard', PAGES.DASHBOARD)}
                  {navButton('Quest Log', PAGES.QUEST_LOG)}
                  {navButton('Focus Mode', PAGES.FOCUS_MODE)}
                  {navButton('Reward Hall', PAGES.REWARD_HALL)}
                  {navButton('History', PAGES.HISTORY)}
                  {navButton('Profile', PAGES.PROFILE)}
                </div>
                <button
                  onClick={handleSignOut}
                  disabled={signingOut}
                  className={`border-4 border-black bg-[#E10086] text-white px-4 py-2 text-[10px] tracking-[0.25em] uppercase shadow-[4px_4px_0_#000] ${
                    signingOut ? 'opacity-60' : ''
                  }`}
                >
                  {signingOut ? 'Signing Out...' : 'Sign Out'}
                </button>
              </header>
              <main className="flex-1 p-6 space-y-6">{renderPage()}</main>
            </div>
          </div>
        </div>
      </div>

      {newQuestModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#12091f] border-[3px] border-[#49297E] shadow-[0_0_0_3px_#000,0_8px_0_#000] w-full max-w-lg p-6 space-y-4 text-white">
            <h3 className="text-2xl text-[#FDE48A] tracking-[0.2em]">Create Quest</h3>
            <input
              type="text"
              placeholder="Quest title"
              value={newQuestForm.title}
              onChange={(e) => setNewQuestForm((prev) => ({ ...prev, title: e.target.value }))}
              className="w-full bg-black border-2 border-[#90DCFF] px-3 py-2 text-xs"
            />
            <label className="text-[10px] uppercase tracking-[0.2em] text-[#FDFB76]">
              Difficulty
            </label>
            <select
              value={newQuestForm.difficulty}
              onChange={(e) =>
                setNewQuestForm((prev) => ({
                  ...prev,
                  difficulty: e.target.value,
                }))
              }
              className="w-full bg-black border-2 border-[#90DCFF] px-3 py-2 text-xs"
            >
              {Object.entries(difficultyPresets).map(([key, value]) => (
                <option value={key} key={key}>
                  {value.label}
                </option>
              ))}
            </select>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-[#FDFB76] block mb-2">
                Frequency
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <select
                    value={newQuestForm.frequencyType}
                    onChange={(e) =>
                      setNewQuestForm((prev) => ({
                        ...prev,
                        frequencyType: e.target.value,
                        frequencyInterval: e.target.value === 'once' ? 1 : prev.frequencyInterval,
                      }))
                    }
                    className="w-full bg-black border-2 border-[#90DCFF] px-3 py-2 text-xs"
                  >
                    <option value="once">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <input
                    type="number"
                    min={1}
                    value={newQuestForm.frequencyInterval}
                    onChange={(e) =>
                      setNewQuestForm((prev) => ({
                        ...prev,
                        frequencyInterval: Math.max(1, Number(e.target.value) || 1),
                      }))
                    }
                    disabled={newQuestForm.frequencyType === 'once'}
                    className="w-full bg-black border-2 border-[#90DCFF] px-3 py-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="Every"
                  />
                  {newQuestForm.frequencyType !== 'once' && (
                    <p className="text-[8px] text-[#90DCFF] mt-1">
                      {newQuestForm.frequencyType === 'daily' && `Every ${newQuestForm.frequencyInterval} day${newQuestForm.frequencyInterval > 1 ? 's' : ''}`}
                      {newQuestForm.frequencyType === 'weekly' && `Every ${newQuestForm.frequencyInterval} week${newQuestForm.frequencyInterval > 1 ? 's' : ''}`}
                      {newQuestForm.frequencyType === 'monthly' && `Every ${newQuestForm.frequencyInterval} month${newQuestForm.frequencyInterval > 1 ? 's' : ''}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setNewQuestModal(false)}
                className="border-4 border-black bg-gray-500 text-white px-4 py-2 text-xs tracking-[0.2em] uppercase shadow-[3px_3px_0_#000]"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateQuest}
                className="border-4 border-black bg-[#00DB96] text-black px-4 py-2 text-xs tracking-[0.2em] uppercase shadow-[3px_3px_0_#000]"
              >
                Save Quest
              </button>
            </div>
          </div>
        </div>
      )}

      {completionModal.open && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#12091f] border-[3px] border-[#49297E] shadow-[0_0_0_3px_#000,0_8px_0_#000] w-full max-w-md p-6 space-y-4 text-white">
            <h3 className="text-2xl text-[#FDE48A] tracking-[0.2em]">
              Complete Quest
            </h3>
            <p className="text-[#90DCFF] text-xs">
              {chores.find((q) => q.id === completionModal.choreId)?.title || 'Quest'}
            </p>
            <select
              value={completionUserId}
              onChange={(e) => setCompletionUserId(e.target.value)}
              className="w-full bg-black border-2 border-[#90DCFF] px-3 py-2 text-xs"
            >
              <option value="">Select player</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.display_name || u.id}
                </option>
              ))}
            </select>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes (optional)"
              className="w-full bg-black border-2 border-[#90DCFF] px-3 py-2 text-xs min-h-[80px]"
            />
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setCompletionModal({ open: false, choreId: null })}
                className="border-4 border-black bg-gray-500 text-white px-4 py-2 text-xs tracking-[0.2em] uppercase shadow-[3px_3px_0_#000]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCompletion}
                className="border-4 border-black bg-[#00DB96] text-black px-4 py-2 text-xs tracking-[0.2em] uppercase shadow-[3px_3px_0_#000]"
              >
                Apply XP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestManager;
