
"use client";

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppUserProfile } from '@/types';
import { Skeleton } from "@/components/ui/skeleton"; // Or a more elaborate loader

export default function OnboardingCheckWrapper({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isOnboardingComplete, setIsOnboardingComplete] = useState<boolean | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  useEffect(() => {
    if (authLoading) {
      return; // Wait for Firebase auth state to resolve
    }

    if (!user) {
      setIsLoadingProfile(false);
      setIsOnboardingComplete(null); // No user, no onboarding status needed
      // Allow access to public pages or redirect to login if path is protected
      if (!['/', '/login', '/signup', '/terms', '/privacy'].includes(pathname) && !pathname.startsWith('/_next/')) {
        // router.replace('/login'); // Example of redirecting protected routes
      }
      return;
    }

    // User is authenticated, check their onboarding status from Firestore
    const fetchProfile = async () => {
      setIsLoadingProfile(true);
      try {
        const profileRef = doc(db, "userProfiles", user.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const profileData = profileSnap.data() as AppUserProfile;
          setIsOnboardingComplete(profileData.hasCompletedOnboarding);

          if (!profileData.hasCompletedOnboarding && !pathname.startsWith('/onboarding') && pathname !== '/login' && pathname !== '/signup') {
            router.replace('/onboarding/agents');
          }
        } else {
          // Profile doesn't exist, might be an issue or new user flow handled by AuthForm
          // For a new user, AuthForm should redirect to /onboarding/agents after profile creation
          // If they land here and profile doesn't exist, it's an edge case.
          // Redirecting to login might be safest to restart flow.
          console.warn("OnboardingCheckWrapper: User profile not found for authenticated user. This might indicate an issue in the signup flow.");
          // Potentially redirect to /login or a specific error page, or attempt profile creation if appropriate.
          // For now, assume AuthForm handles initial profile creation and redirect.
          // If they get here with no profile, let's assume onboarding isn't complete.
          setIsOnboardingComplete(false);
           if (!pathname.startsWith('/onboarding') && pathname !== '/login' && pathname !== '/signup') {
            router.replace('/onboarding/agents');
          }
        }
      } catch (error) {
        console.error("Error fetching user profile for onboarding check:", error);
        // Handle error, maybe set onboarding as incomplete to be safe
        setIsOnboardingComplete(false);
         if (!pathname.startsWith('/onboarding') && pathname !== '/login' && pathname !== '/signup') {
            router.replace('/onboarding/agents');
          }
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchProfile();

  }, [user, authLoading, router, pathname]);

  if (authLoading || (user && isLoadingProfile)) {
    // Global loading state while checking auth and profile
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin text-primary"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          <p className="text-muted-foreground">Loading PersonaNet Experience...</p>
        </div>
      </div>
    );
  }

  // If user exists, onboarding is not complete, and they are not on an onboarding page,
  // the useEffect above should have redirected. This children render is for when:
  // 1. User is null (public pages)
  // 2. User exists and onboarding is complete
  // 3. User exists, onboarding is not complete, BUT they are on an /onboarding/* page.
  return <>{children}</>;
}
