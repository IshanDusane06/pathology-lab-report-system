import { API_BASE_URL } from './api';

export interface StreamToken {
  token: string;
  // Seconds. Informational — a fresh token is minted on every connect, so
  // nothing on the client has to track this expiry.
  expiresIn: number;
}

export const eventsApi = {
  // Mints a short-lived, stream-only JWT for the SSE connection.
  //
  // EventSource cannot send an Authorization header, so the credential has to
  // travel in the query string. That is why this is a separate token carrying
  // purpose:'sse' rather than the session JWT: api/middleware/auth.js rejects
  // any purpose-bearing token on normal API routes, so a stream URL leaking
  // into a log or a Referer header is not a usable API credential.
  mintStreamToken: async (): Promise<StreamToken> => {
    try {
      const response = await fetch(`${API_BASE_URL}/events/token`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('patho_token')}` },
      });
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Failed to open the live updates stream');
      }

      return data.data;
    } catch (error) {
      console.error('Error minting stream token:', error);
      throw error;
    }
  },
};
