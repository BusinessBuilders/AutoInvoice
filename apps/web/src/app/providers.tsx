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

  const trpcClient = useMemo(() => {
    const apiUrl = getApiUrl();
    const fullUrl = `${apiUrl}/trpc`;
    console.log('🔗 tRPC Client connecting to:', fullUrl);

    return trpc.createClient({
      links: [
        httpBatchLink({
          url: fullUrl,
          headers() {
            const token = localStorage.getItem('accessToken');
            return {
              authorization: token ? `Bearer ${token}` : '',
              'ngrok-skip-browser-warning': 'true',
            };
          },
        }),
      ],
    });
  }, []);

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
