import axios from 'axios';

const api = axios.create({ baseURL: 'http://localhost:4000/api' });
api.interceptors.request.use(config => {
  const token = localStorage.getItem('uat_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401 && !String(error.config?.url || '').includes('/auth/login')) {
      localStorage.removeItem('uat_token');
      localStorage.removeItem('uat_user');
      window.dispatchEvent(new Event('uat:logout'));
    }
    return Promise.reject(error);
  }
);
export default api;
