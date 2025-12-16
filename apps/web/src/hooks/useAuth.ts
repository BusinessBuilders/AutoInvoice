'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export function useAuth() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    setIsAuthenticated(!!token);
    setIsLoading(false);
  }, []);

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setIsAuthenticated(false);
    router.push('/login');
  };

  const requireAuth = () => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  };

  return {
    isAuthenticated,
    isLoading,
    logout,
    requireAuth,
  };
}
