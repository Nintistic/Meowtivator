import { render, screen, act, waitFor } from '@testing-library/react';
import App from './App';

jest.mock('./firebase', () => {
  const actual = jest.requireActual('./firebase');
  return {
    ...actual,
    auth: {},
  };
});

let authCallback = null;
jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: jest.fn((auth, callback) => {
    authCallback = callback;
    // Call callback in next tick to allow React to mount
    Promise.resolve().then(() => {
      if (authCallback) {
        act(() => {
          authCallback(null);
        });
      }
    });
    return jest.fn();
  }),
}));

test('shows login prompt when no user is signed in', async () => {
  render(<App />);
  await waitFor(() => {
    expect(screen.queryByText(/Loading Quest Log/i)).not.toBeInTheDocument();
  });
  const text = await screen.findByText(/Sign in to continue your quest!/i);
  expect(text).toBeInTheDocument();
});
