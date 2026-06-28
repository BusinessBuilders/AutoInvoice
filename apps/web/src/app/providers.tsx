'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState, useMemo } from 'react';
import { trpc } from '@/lib/trpc';

function getApiUrl() {
  // Client-side: detect which domain we're on
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    console.log('🌐 Current window.location.hostname:', hostname);

    // Production domain - use /api path (Nginx routes to localhost:4000)
    if (hostname === 'accounting.business-builder.online') {
      const apiUrl = '/api';
      console.log('🏢 Production domain detected, API URL:', apiUrl);
      return apiUrl;
    }

    // ngrok domains
    if (hostname.includes('ngrok')) {
      const apiUrl = `https://${hostname}`;
      console.log('🔗 ngrok domain detected, API URL:', apiUrl);
      return apiUrl;
    }
  }

  // Default: localhost for development
  console.log('🏠 Localhost development, API URL: http://localhost:4000');
  return 'http://localhost:4000';
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // Create tRPC client - DO NOT use useMemo to ensure fresh token reads
  const [trpcClient] = useState(() => {
    const apiUrl = getApiUrl();
    const fullUrl = `${apiUrl}/trpc`;
    console.log('🔗 tRPC Client connecting to:', fullUrl);

    // Access tokens expire after 15 minutes. On 401, refresh once via
    // auth.refresh (rotating refresh token) and retry the original request;
    // if refresh fails, send the user to /login instead of hanging pages.
    let refreshing: Promise<boolean> | null = null;
    const tryRefresh = (): Promise<boolean> => {
      if (refreshing) return refreshing;
      refreshing = (async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) return false;
        try {
          const res = await fetch(`${apiUrl}/trpc/auth.refresh`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });
          if (!res.ok) return false;
          const json = await res.json();
          const data = json?.result?.data;
          if (!data?.accessToken) return false;
          localStorage.setItem('accessToken', data.accessToken);
          if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
          return true;
        } catch {
          return false;
        } finally {
          setTimeout(() => { refreshing = null; }, 0);
        }
      })();
      return refreshing;
    };

    return trpc.createClient({
      links: [
        httpBatchLink({
          url: fullUrl,
          headers() {
            // Always read fresh token from localStorage on each request
            const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
            return {
              authorization: token ? `Bearer ${token}` : '',
              'ngrok-skip-browser-warning': 'true',
            };
          },
          async fetch(url, options) {
            const res = await fetch(url, options as RequestInit);
            if (res.status !== 401 || typeof window === 'undefined') return res;
            const ok = await tryRefresh();
            if (!ok) {
              if (!window.location.pathname.startsWith('/login') && !window.location.pathname.startsWith('/crew/signup')) {
                window.location.href = '/login';
              }
              return res;
            }
            const headers = new Headers(((options as RequestInit)?.headers as HeadersInit) ?? {});
            headers.set('authorization', `Bearer ${localStorage.getItem('accessToken') ?? ''}`);
            return fetch(url, { ...(options as RequestInit), headers });
          },
        }),
      ],
    });
  });

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
