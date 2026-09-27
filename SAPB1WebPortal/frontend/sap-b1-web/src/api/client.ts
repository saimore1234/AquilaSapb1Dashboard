import axios from 'axios';

// Every module in this app talks to the ASP.NET Core API through this one
// axios instance. This is the ONLY place that knows the API base URL and the
// JWT token — mirrors what a future mobile app's API layer would do too.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://localhost:7010/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' }
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('sapb1_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('sapb1_token');
      localStorage.removeItem('sapb1_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
