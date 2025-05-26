
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCircle, Mail, CalendarDays } from "lucide-react";
import { format } from 'date-fns';

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  const getInitials = (name?: string | null) => {
    if (!name) return "PN"; // PersonaNet initials or a default
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };
  
  const creationDate = user?.metadata.creationTime 
    ? format(new Date(user.metadata.creationTime), "MMMM d, yyyy") 
    : "N/A";

  if (authLoading || !user) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center gap-2 mb-4">
          <UserCircle className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">User Profile</h1>
        </div>
        <Card>
          <CardHeader className="items-center text-center">
            <Skeleton className="h-24 w-24 rounded-full mb-2" />
            <Skeleton className="h-6 w-40 mb-1" />
            <Skeleton className="h-4 w-48" />
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <Skeleton className="h-5 w-full" />
            </div>
            <div className="flex items-center gap-3">
              <CalendarDays className="h-5 w-5 text-muted-foreground" />
              <Skeleton className="h-5 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <UserCircle className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Your Profile</h1>
      </div>
      <Card className="shadow-lg rounded-xl">
        <CardHeader className="items-center text-center p-6">
          <Avatar className="h-24 w-24 text-3xl mb-3 border-2 border-primary/20">
            <AvatarImage src={user.photoURL || undefined} alt={user.displayName || "User"} />
            <AvatarFallback>{getInitials(user.displayName || user.email)}</AvatarFallback>
          </Avatar>
          <CardTitle className="text-2xl">{user.displayName || "Anonymous User"}</CardTitle>
          <CardDescription className="text-sm">Manage your PersonaNet account details.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/30">
            <Mail className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium text-muted-foreground">Email:</span>
            <span className="text-sm text-foreground truncate ml-auto">{user.email}</span>
          </div>
           <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/30">
            <UserCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium text-muted-foreground">Display Name:</span>
            <span className="text-sm text-foreground truncate ml-auto">{user.displayName || "Not set"}</span>
          </div>
          <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/30">
            <CalendarDays className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <span className="text-sm font-medium text-muted-foreground">Joined:</span>
            <span className="text-sm text-foreground ml-auto">{creationDate}</span>
          </div>
        </CardContent>
        {/* Future settings could go in CardFooter or more CardContent sections */}
        {/* <CardFooter className="p-6 border-t">
          <Button variant="outline" disabled>Update Profile (Coming Soon)</Button>
        </CardFooter> */}
      </Card>
    </div>
  );
}
