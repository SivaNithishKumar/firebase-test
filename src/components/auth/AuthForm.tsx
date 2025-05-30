
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  type User
} from "firebase/auth";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn, UserPlusIcon } from "lucide-react";
import type { AppUserProfile } from "@/types";
import Link from "next/link";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

const signupSchema = z.object({
  displayName: z.string().min(3, "Display name must be at least 3 characters.").max(50, "Display name is too long."),
  email: z.string().email("Invalid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  confirmPassword: z.string().min(6, "Confirm password must be at least 6 characters."),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match.",
  path: ["confirmPassword"], // Path of error
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
});

type SignupFormData = z.infer<typeof signupSchema>;
type LoginFormData = z.infer<typeof loginSchema>;

interface AuthFormProps {
  initialMode?: "login" | "signup";
}

export default function AuthForm({ initialMode = "login" }: AuthFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const { toast } = useToast();

  const currentSchema = mode === "signup" ? signupSchema : loginSchema;
  const form = useForm<SignupFormData | LoginFormData>({
    resolver: zodResolver(currentSchema),
    defaultValues: {
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit: SubmitHandler<SignupFormData | LoginFormData> = async (values) => {
    setIsLoading(true);
    try {
      if (mode === "signup") {
        const signupValues = values as SignupFormData;
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          signupValues.email,
          signupValues.password
        );
        await updateProfile(userCredential.user, {
          displayName: signupValues.displayName,
        });

        // Create user profile in Firestore
        const userProfileRef = doc(db, "userProfiles", userCredential.user.uid);
        const userProfileData: Omit<AppUserProfile, "createdAt" | "photoURL"> & { createdAt: any, photoURL: string | null } = {
          uid: userCredential.user.uid,
          displayName: signupValues.displayName,
          email: userCredential.user.email,
          photoURL: userCredential.user.photoURL, // Will be null initially for email/pass
          friends: [],
          hasCompletedOnboarding: false, // New users start with onboarding incomplete
          createdAt: serverTimestamp(),
        };
        await setDoc(userProfileRef, userProfileData);
        console.log("User profile created in Firestore for UID:", userCredential.user.uid);
        toast({
          title: "Account created successfully!",
          description: "Welcome to PersonaNet! Please complete onboarding.",
        });
        router.push("/onboarding/agents"); // Redirect to onboarding
      } else {
        // Login mode
        const loginValues = values as LoginFormData;
        await signInWithEmailAndPassword(auth, loginValues.email, loginValues.password);
        
        // Check onboarding status after login
        const user = auth.currentUser;
        if (user) {
            const userProfileRef = doc(db, "userProfiles", user.uid);
            const userProfileSnap = await getDoc(userProfileRef);
            if (userProfileSnap.exists()) {
                const profileData = userProfileSnap.data() as AppUserProfile;
                if (!profileData.hasCompletedOnboarding) {
                    toast({ title: "Welcome back!", description: "Let's complete your onboarding."});
                    router.push("/onboarding/agents");
                    return;
                }
            } else {
                // This case should ideally not happen if profile is created on signup
                // But as a fallback, create it and send to onboarding
                const fallbackProfileData: Omit<AppUserProfile, "createdAt" | "photoURL"> & { createdAt: any, photoURL: string | null } = {
                    uid: user.uid,
                    displayName: user.displayName,
                    email: user.email,
                    photoURL: user.photoURL,
                    friends: [],
                    hasCompletedOnboarding: false,
                    createdAt: serverTimestamp(),
                };
                await setDoc(userProfileRef, fallbackProfileData);
                router.push("/onboarding/agents");
                return;
            }
        }
        toast({ title: "Logged in successfully!", description: "Welcome back to PersonaNet." });
        router.push("/feed");
      }
    } catch (error: any) {
      console.error(`${mode} error:`, error);
      toast({
        title: `Error during ${mode}`,
        description: error.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-2xl text-center">
          {mode === "signup" ? "Create PersonaNet Account" : "Login to PersonaNet"}
        </CardTitle>
        <CardDescription className="text-center">
          {mode === "signup" ? "Enter your details to join." : "Enter your credentials to access your account."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {mode === "signup" && (
            <div className="space-y-1">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="Your Name"
                {...form.register("displayName" as keyof SignupFormData)} 
                disabled={isLoading}
              />
              {form.formState.errors.displayName && <p className="text-xs text-destructive pt-1">{(form.formState.errors.displayName as any)?.message}</p>}
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              {...form.register("email")}
              disabled={isLoading}
            />
            {form.formState.errors.email && <p className="text-xs text-destructive pt-1">{form.formState.errors.email.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              {...form.register("password")}
              disabled={isLoading}
            />
            {form.formState.errors.password && <p className="text-xs text-destructive pt-1">{form.formState.errors.password.message}</p>}
          </div>
          {mode === "signup" && (
            <div className="space-y-1">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                {...form.register("confirmPassword" as keyof SignupFormData)}
                disabled={isLoading}
              />
              {form.formState.errors.confirmPassword && <p className="text-xs text-destructive pt-1">{(form.formState.errors.confirmPassword as any)?.message}</p>}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : mode === "signup" ? (
              <UserPlusIcon className="mr-2 h-5 w-5" />
            ) : (
              <LogIn className="mr-2 h-5 w-5" />
            )}
            {mode === "signup" ? "Sign Up" : "Login"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col items-center gap-2 text-sm">
        {mode === "login" ? (
          <p className="text-muted-foreground">
            Don't have an account?{" "}
            <Button variant="link" className="p-0 h-auto" onClick={() => { setMode("signup"); form.reset(); }}>
              Sign Up
            </Button>
          </p>
        ) : (
          <p className="text-muted-foreground">
            Already have an account?{" "}
            <Button variant="link" className="p-0 h-auto" onClick={() => { setMode("login"); form.reset(); }}>
              Login
            </Button>
          </p>
        )}
         <p className="text-xs text-muted-foreground text-center mt-2">
          By continuing, you agree to PersonaNet's<br/>
          <Link href="/terms" className="underline hover:text-primary">Terms of Service</Link> and 
          <Link href="/privacy" className="underline hover:text-primary ml-1">Privacy Policy</Link>.
        </p>
      </CardFooter>
    </Card>
  );
}
