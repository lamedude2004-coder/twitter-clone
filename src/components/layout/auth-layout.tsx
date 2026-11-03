import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '@lib/context/auth-context';
import { Placeholder } from '@components/common/placeholder';
import type { LayoutProps } from './common-layout';

export function AuthLayout({ children }: LayoutProps): JSX.Element {
  const [pending, setPending] = useState(true);

  const { user, loading } = useAuth();
  const { replace } = useRouter();

  useEffect(() => {
    if (loading) {
      setPending(true);
      return;
    }

    if (user) {
      setPending(true);
      void replace('/home');
      return;
    }

    setPending(false);
  }, [user, loading, replace]);

  if (loading || pending) return <Placeholder />;

  return <>{children}</>;
}
