
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { AppUserProfile } from "@/types";

// SVG for Google Icon
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="mr-2 h-5 w-5">
    <path
      fillRule="evenodd"
      clipRule="evenodd"
      d="M12.0002 9.82431C12.0002 9.0027 11.9284 8.20784 11.7954 7.43921H6.23145V10.878H9.50895C9.32465 11.7812 8.81525 12.5729 8.09131 13.0637L8.0871 13.0898L10.4426 14.9581L10.5018 14.9641C11.3999 14.0706 11.9993 12.817 11.9993 11.3137C11.9993 10.7722 11.9072 10.2682 11.8002 9.82431H12.0002ZM21.5457 12C21.5457 11.244 21.4692 10.5067 21.3261 9.79545H21.3206V9.79364L21.3162 9.78909C21.0126 8.90714 20.5492 8.09191 19.9547 7.38079L19.9419 7.36455L17.1251 9.50291L17.1205 9.50636C17.5919 10.3255 17.8402 11.2345 17.8402 12.1836C17.8402 13.3518 17.4447 14.3864 16.7762 15.1918L16.7626 15.2071L19.4219 17.2235L19.4419 17.2327C20.7948 15.8064 21.5457 14.0082 21.5457 12ZM3.50023 14.3273C3.06034 13.5339 2.82117 12.6396 2.82117 11.6773C2.82117 10.7139 3.06145 9.81818 3.50023 9.02545L3.48909 9.00636L0.848545 6.99727L0.822936 6.98514C0.302309 8.02545 0 9.19455 0 10.4945C0 11.7955 0.301168 12.9645 0.822936 14.0049L0.849655 14.0149L3.49091 16.0227L3.50023 16.0036V14.3273ZM12.0002 22.3636C10.2284 22.3636 8.70294 21.7309 7.54658 20.72L7.53021 20.7064L5.03117 22.748L5.01845 22.7591C6.52208 23.8482 8.42753 24.5 10.5002 24.5C13.3529 24.5 15.7893 23.2336 17.4111 21.1982L17.4219 21.1855L15.0419 19.32L15.0262 19.3127C14.1302 20.0018 13.0711 20.3636 12.0002 20.3636V22.3636V20.3636C12.0002 20.3636 12.0002 22.3636 12.0002 22.3636Z"
      fill="currentColor"
    />
  </svg>
);

export default function AuthForm() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      const userCredential = await signInWithPopup(auth, provider);
      const user = userCredential.user;

      const userProfileRef = doc(db, "userProfiles", user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (!userProfileSnap.exists()) {
        const userProfileData: Omit<AppUserProfile, "createdAt" | "memberOfNetworks" | "myNetworkMembers"> & {
          createdAt: any; // For serverTimestamp
          friends: string[];
          memberOfNetworks: string[];
          myNetworkMembers: string[];
        } = {
          uid: user.uid,
          displayName: user.displayName,
          email: user.email,
          photoURL: user.photoURL,
          createdAt: serverTimestamp(),
          friends: [],
          memberOfNetworks: [],
          myNetworkMembers: [],
        };
        await setDoc(userProfileRef, userProfileData);
        console.log("New user profile created in Firestore for UID:", user.uid);
        toast({
          title: "Account set up successfully!",
          description: "Welcome to PersonaNet!",
        });
      } else {
        console.log("Existing user signed in:", user.uid);
        toast({
          title: "Logged in successfully!",
          description: "Welcome back to PersonaNet.",
        });
      }
      
      router.push("/feed");

    } catch (error: any) {
      console.error("Google Sign-In error:", error, "Code:", error.code);
      
      if (error.code === 'auth/popup-closed-by-user') {
        toast({
          title: "Sign-in Window Closed",
          description: "The Google Sign-In window was closed before completion. Please try again.",
          variant: "default",
        });
      } else if (error.code === 'auth/cancelled-popup-request') {
        toast({
          title: "Sign-in Process Interrupted",
          description: "Multiple sign-in windows may have been opened. Please try again.",
          variant: "default",
        });
      } else if (error.code === 'auth/popup-blocked') {
        toast({
          title: "Popup Blocked by Browser",
          description: "Your browser blocked the Google Sign-In popup. Please allow popups for this site and try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error during Google Sign-In",
          description: error.message || "An unexpected error occurred. Please check your internet connection and browser settings (e.g., popup blockers).",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl text-center">
          Join PersonaNet
        </CardTitle>
        <CardDescription className="text-center">
          Sign in or create an account with Google to get started.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center">
        <Button
          onClick={handleGoogleSignIn}
          className="w-full max-w-xs py-3 text-base"
          disabled={isLoading}
          variant="outline"
        >
          {isLoading ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          Continue with Google
        </Button>
      </CardContent>
       <CardFooter className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <p>By continuing, you agree to PersonaNet's</p>
        <p>
          <Link href="/terms" className="underline hover:text-primary">Terms of Service</Link> and 
          <Link href="/privacy" className="underline hover:text-primary ml-1">Privacy Policy</Link>.
        </p>
      </CardFooter>
    </Card>
  );
}

    