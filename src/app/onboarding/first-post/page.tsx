
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { db } from "@/lib/firebase";
import { doc, updateDoc, addDoc, collection, serverTimestamp, getDoc } from "firebase/firestore";
import type { AppUserProfile, Post } from "@/types";
import { CreatePostForm } from "@/components/feed/CreatePostForm"; // Reuse for consistency
import { Loader2, PartyPopper, Send } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";


export default function OnboardingFirstPostPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appUserProfile, setAppUserProfile] = useState<AppUserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    } else if (user) {
      const fetchProfile = async () => {
        setLoadingProfile(true);
        const profileRef = doc(db, "userProfiles", user.uid);
        const profileSnap = await getDoc(profileRef);
        if (profileSnap.exists()) {
          const profileData = profileSnap.data() as AppUserProfile;
          setAppUserProfile(profileData);
          if (profileData.hasCompletedOnboarding) {
            // Already onboarded, redirect to feed
            router.replace("/feed");
          }
        } else {
          // Profile doesn't exist, should not happen if signup flow is correct
          toast({ title: "Error", description: "User profile not found. Please try logging out and in.", variant: "destructive"});
          router.replace("/login");
        }
        setLoadingProfile(false);
      };
      fetchProfile();
    }
  }, [user, authLoading, router, toast]);

  const handlePostCreated = async (content: string, imageUrl?: string) => {
    if (!user || !appUserProfile) {
      toast({ title: "Error", description: "User not found.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      // 1. Create the post
      const newPostData = {
        userId: user.uid,
        userDisplayName: appUserProfile.displayName || "New User",
        userAvatarUrl: appUserProfile.photoURL || null,
        content,
        imageUrl: imageUrl || null,
        createdAt: serverTimestamp(),
        reactions: [],
        comments: [],
      };
      await addDoc(collection(db, "posts"), newPostData);
      toast({ title: "First Post Created!", description: "Great start to your PersonaNet journey!" });

      // 2. Mark onboarding as complete
      const userProfileRef = doc(db, "userProfiles", user.uid);
      await updateDoc(userProfileRef, {
        hasCompletedOnboarding: true,
      });

      router.push("/feed"); // Navigate to the main feed
    } catch (error: any) {
      console.error("Error during first post submission:", error);
      toast({ title: "Error Creating Post", description: error.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || loadingProfile || !user || !appUserProfile) {
     return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-6 w-3/4 mb-4" />
        <Skeleton className="h-64 w-full rounded-lg" />
        <Skeleton className="h-10 w-36 mt-4 ml-auto" />
      </div>
    );
  }


  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl flex items-center gap-2">
          <Send className="h-6 w-6 text-primary"/> Make Your First Post!
        </CardTitle>
        <CardDescription>
          Share something with your new AI agents and kickstart your PersonaNet experience. What's on your mind?
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Reusing CreatePostForm but the submit button below is the main action */}
        <CreatePostForm onPostCreated={handlePostCreated} />
      </CardContent>
      {/* Note: The CreatePostForm has its own submit button. 
          For this onboarding step, its onPostCreated handles the finalization.
          So, no separate submit button needed here unless we change CreatePostForm.
          Let's assume onPostCreated from CreatePostForm will trigger the above handlePostCreated.
      */}
       <CardFooter className="flex justify-end">
        <p className="text-sm text-muted-foreground mr-auto">
            This post will only be visible on your feed for now.
        </p>
         <Button onClick={() => router.push('/feed')} variant="outline" className="mr-2" disabled={isSubmitting}>
            Skip & Go to Feed
        </Button>
        {/* The main action is handled by the submit button inside CreatePostForm */}
      </CardFooter>
    </Card>
  );
}
