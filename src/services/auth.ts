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
  name?: string;
  // Add any other user properties
}

export interface LoginResponse {
  user: User;
  // Note: token is now set as HTTP-only cookie, not in response body
}

// Auth service methods
export const authService = {
  async signup(data: SignupData): Promise<{ user: User }> {
    const response = await api.post('/api/auth/signup', data);
    return response.data;
  },

  async login(data: LoginData): Promise<LoginResponse> {
    try {
      console.log('AuthService: Logging in with email:', data.email);
      const response = await api.post('/api/auth/login', data);

      // With cookie-based auth, we don't expect a token in the response
      // The token is automatically set as an HTTP-only cookie
      console.log('AuthService: Login successful, user:', response.data.user?.id);
      return response.data;
    } catch (error) {
      console.error('AuthService: Login failed', error);
      throw error;
    }
  },

  async logout(): Promise<void> {
    try {
      // Call the logout API endpoint to clear the cookie
      await api.post('/api/auth/logout');
      console.log('AuthService: Successfully logged out');
    } catch (error) {
      console.warn('AuthService: Error during API logout', error);
    }
  },

  async getMe(): Promise<User> {
    const response = await api.get('/api/auth/me');
    return response.data;
  },

  // Check if user is authenticated by trying to get current user info
  async isAuthenticated(): Promise<boolean> {
    try {
      await this.getMe();
      return true;
    } catch (error) {
      return false;
    }
  },
};
