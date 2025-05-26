
"use client";

import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile as updateFirebaseProfile,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import type { AppUserProfile } from "@/types";

const commonSchema = {
  email: z.string().email({ message: "Invalid email address." }),
  password: z.string().min(6, { message: "Password must be at least 6 characters." }),
};

const signupSchema = z.object({
  displayName: z.string().min(2, { message: "Display name must be at least 2 characters." }).max(50, "Display name max 50 chars."),
  ...commonSchema,
});

const loginSchema = z.object(commonSchema);

type AuthFormProps = {
  mode: "login" | "signup";
};

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const schema = mode === "signup" ? signupSchema : loginSchema;
  type FormData = z.infer<typeof schema>;

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: "",
      password: "",
      ...(mode === "signup" && { displayName: "" }),
    },
  });

  const onSubmit = async (values: FormData) => {
    setIsLoading(true);
    try {
      if (mode === "signup") {
        const signupValues = values as z.infer<typeof signupSchema>;
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          signupValues.email,
          signupValues.password
        );
        
        await updateFirebaseProfile(userCredential.user, {
          displayName: signupValues.displayName,
        });

        const userProfileData: Omit<AppUserProfile, 'createdAt'> = { // Omit createdAt as it's handled by serverTimestamp
          uid: userCredential.user.uid,
          displayName: signupValues.displayName,
          email: userCredential.user.email,
          photoURL: userCredential.user.photoURL,
          friends: [],
          memberOfNetworks: [], // Initialize as empty array
          myNetworkMembers: [], // Initialize as empty array
        };
        const userProfileRef = doc(db, "userProfiles", userCredential.user.uid);
        await setDoc(userProfileRef, { ...userProfileData, createdAt: serverTimestamp() }); 
        
        console.log("User profile created in Firestore for UID:", userCredential.user.uid);
        toast({ title: "Account created successfully!", description: "You are now logged in and your profile is set up." });
        router.push("/feed");

      } else {
        await signInWithEmailAndPassword(auth, values.email, values.password);
        toast({ title: "Logged in successfully!", description: "Welcome back." });
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
        <CardTitle className="text-2xl">
          {mode === "login" ? "Login to PersonaNet" : "Create an Account"}
        </CardTitle>
        <CardDescription>
          {mode === "login"
            ? "Enter your credentials to access your account."
            : "Fill in the details to get started."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {mode === "signup" && (
              <FormField
                control={form.control}
                name="displayName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Display Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="you@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "login" ? "Login" : "Sign Up"}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex flex-col items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {mode === "login" ? "Don't have an account?" : "Already have an account?"}{" "}
          <Button variant="link" className="p-0 h-auto" asChild>
            <Link href={mode === "login" ? "/signup" : "/login"}>
              {mode === "login" ? "Sign Up" : "Login"}
            </Link>
          </Button>
        </p>
      </CardFooter>
    </Card>
  );
}
