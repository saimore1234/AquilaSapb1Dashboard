import axios from 'axios';
import { API_BASE_URL } from '../native/platform';
import { session } from '../native/session';

// Every module in this app talks to the ASP.NET Core API through this one axios instance. This is the ONLY place that knows the API base
// URL and the JWT token. The website uses the relative '/api' (proxied); the installed app uses the absolute HTTPS VITE_API_BASE_URL
// (see native/platform.ts, which also refuses a missing / non-HTTPS / temporary-tunnel address in the app).
export { API_BASE_URL };

const TOKEN_KEY = 'sapb1_token';
const USER_KEY = 'sapb1_user';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' }
});

apiClient.interceptors.request.use((config) => {
  const token = session.get(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      session.remove(TOKEN_KEY);
      session.remove(USER_KEY);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login?reason=expired';
      }
    } else if (!error.response && error.code !== 'ERR_CANCELED') {
      // Clear, non-technical messages for timeouts and no connection (never include the URL, headers or token).
      error.message = error.code === 'ECONNABORTED'
        ? 'The server took too long to respond. Please try again.'
        : 'Unable to reach the server. Check your internet connection and try again.';
    }
    return Promise.reject(error);
  }
);
