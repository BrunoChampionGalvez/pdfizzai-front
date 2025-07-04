import api from '../lib/api';

export interface SignupData {
  email: string;
  password: string;
}

export interface LoginData {
  email: string;
  password: string;
}

export interface User {
  id: string;
  email: string;
}

export const authService = {
  async signup(data: SignupData): Promise<{ user: User }> {
    const response = await api.post('/api/auth/signup', data);
    return response.data;
  },

  async login(data: LoginData): Promise<{ user: User }> {
    const response = await api.post('/api/auth/login', data);
    return response.data;
  },

  async logout(): Promise<void> {
    await api.post('/api/auth/logout');
  },

  async getMe(): Promise<User> {
    const response = await api.get('/api/auth/me');
    return response.data;
  },
};
