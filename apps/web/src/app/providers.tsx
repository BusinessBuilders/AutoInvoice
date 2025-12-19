'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { trpc } from '@/lib/trpc';

function getApiUrl() {
  // If environment variable is set, use it (for VPS production)
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // In browser, detect the environment
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;

    // If accessed via ngrok (phone/external), use ngrok backend URL
    if (hostname.includes('ngrok')) {
      return 'https://hip-piglet-forcibly.ngrok-free.app';
    }

    // If accessed from production domain, use production API
    if (hostname.includes('yourdomain.com')) {
      return 'https://api.yourdomain.com';
    }
  }

  // Default: local development
  return 'http://localhost:4000';
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() => {
    const apiUrl = getApiUrl();
    const fullUrl = `${apiUrl}/trpc`;
    console.log('🔗 tRPC Client connecting to:', fullUrl);
    console.log('🌐 Current window.location.hostname:', typeof window !== 'undefined' ? window.location.hostname : 'SSR');

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
  });

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
