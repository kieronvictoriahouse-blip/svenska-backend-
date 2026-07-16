'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// L'ancien hub /admin/apps est fusionné dans l'accueil /admin (source de nav unique).
export default function AppsRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/admin'); }, [router]);
  return null;
}
