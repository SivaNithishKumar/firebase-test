
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  addDoc,
  serverTimestamp,
  getDoc,
  Timestamp,
  writeBatch,
  arrayUnion,
  limit,
} from "firebase/firestore";
import type { AppUserProfile, FriendRequest } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, CheckCircle, Clock, Loader2, UserSearch } from "lucide-react";

const convertAppUserProfileTimestamp = (profile: any): AppUserProfile => {
    return {
        ...profile,
        createdAt: profile.createdAt instanceof Timestamp ? profile.createdAt.toMillis() : profile.createdAt,
    } as AppUserProfile;
};

export default function FindFriendsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [users, setUsers] = useState<AppUserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [currentUserProfile, setCurrentUserProfile] = useState<AppUserProfile | null>(null);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [requestStatus, setRequestStatus] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      const fetchUsersAndProfile = async () => {
        setLoadingUsers(true);
        try {
          // Fetch current user's profile to get their friends list
          const userProfileRef = doc(db, "userProfiles", user.uid);
          const userProfileSnap = await getDoc(userProfileRef);
          if (userProfileSnap.exists()) {
            setCurrentUserProfile(convertAppUserProfileTimestamp(userProfileSnap.data()));
          }

          // Fetch all users (excluding current user)
          const usersQuery = query(collection(db, "userProfiles"), where("uid", "!=", user.uid), limit(50)); // Limit for now
          const usersSnapshot = await getDocs(usersQuery);
          const usersData = usersSnapshot.docs.map(docSnap => convertAppUserProfileTimestamp(docSnap.data()));
          setUsers(usersData);

          // Fetch pending friend requests initiated by the current user OR to the current user
          const outgoingRequestsQuery = query(
            collection(db, "friendRequests"),
            where("senderId", "==", user.uid),
            where("status", "==", "pending")
          );
          const incomingRequestsQuery = query(
            collection(db, "friendRequests"),
            where("receiverId", "==", user.uid),
            where("status", "==", "pending")
          );
          
          const [outgoingSnapshot, incomingSnapshot] = await Promise.all([
            getDocs(outgoingRequestsQuery),
            getDocs(incomingRequestsQuery)
          ]);

          const allPendingRequests: FriendRequest[] = [];
          outgoingSnapshot.forEach(docSnap => allPendingRequests.push({ id: docSnap.id, ...docSnap.data() } as FriendRequest));
          incomingSnapshot.forEach(docSnap => allPendingRequests.push({ id: docSnap.id, ...docSnap.data() } as FriendRequest));
          setPendingRequests(allPendingRequests);

        } catch (error: any) {
          console.error("Error fetching users or profile:", error);
          toast({ title: "Error", description: `Could not load users: ${error.message}`, variant: "destructive" });
        }
        setLoadingUsers(false);
      };
      fetchUsersAndProfile();
    }
  }, [user, toast]);

  const getInitials = (name?: string | null) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
  };

  const handleSendFriendRequest = async (targetUser: AppUserProfile) => {
    if (!user || !currentUserProfile) return;

    setRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'sending' }));

    try {
      // Check if a request already exists (either direction) or if they are already friends
      const existingRequestQuery1 = query(collection(db, "friendRequests"), 
        where("senderId", "==", user.uid), 
        where("receiverId", "==", targetUser.uid));
      const existingRequestQuery2 = query(collection(db, "friendRequests"), 
        where("senderId", "==", targetUser.uid), 
        where("receiverId", "==", user.uid));

      const [snap1, snap2] = await Promise.all([getDocs(existingRequestQuery1), getDocs(existingRequestQuery2)]);
      
      if (!snap1.empty || !snap2.empty) {
         toast({ title: "Request Exists", description: "A friend request already exists or was handled.", variant: "default" });
         setRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'sent' })); // Or some other status
         // Refresh pending requests to update UI state correctly
         const existingReqDoc = snap1.docs[0] || snap2.docs[0];
         if (existingReqDoc) {
            const existingReqData = existingReqDoc.data() as Omit<FriendRequest, "id">;
             setPendingRequests(prev => [...prev.filter(r => !(r.senderId === user.uid && r.receiverId === targetUser.uid) && !(r.senderId === targetUser.uid && r.receiverId === user.uid) ), { 
                id: existingReqDoc.id, 
                ...existingReqData
              }]);
         }
         return;
      }
      if (currentUserProfile.friends?.includes(targetUser.uid)) {
        toast({ title: "Already Friends", description: `You are already friends with ${targetUser.displayName}.`, variant: "default" });
        return;
      }


      const newRequest: Omit<FriendRequest, "id"> = {
        senderId: user.uid,
        senderDisplayName: currentUserProfile.displayName,
        senderPhotoURL: currentUserProfile.photoURL || undefined,
        receiverId: targetUser.uid,
        status: "pending",
        createdAt: Date.now(), 
        updatedAt: Date.now(),
      };
      const requestRef = await addDoc(collection(db, "friendRequests"), {
        ...newRequest,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      
      setPendingRequests(prev => [...prev, {id: requestRef.id, ...newRequest}]);
      setRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'sent' }));
      toast({ title: "Friend Request Sent", description: `Request sent to ${targetUser.displayName}.` });
    } catch (error: any) {
      console.error("Error sending friend request:", error);
      setRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'error' }));
      toast({ title: "Error", description: `Could not send request: ${error.message}`, variant: "destructive" });
    }
  };

  const getButtonState = (targetUserId: string) => {
    if (currentUserProfile?.friends?.includes(targetUserId)) {
      return { text: "Already Friends", disabled: true, icon: <CheckCircle className="mr-2" /> };
    }
    const outgoingPending = pendingRequests.find(
      (req) => req.senderId === user?.uid && req.receiverId === targetUserId && req.status === "pending"
    );
    if (outgoingPending) {
      return { text: "Request Sent", disabled: true, icon: <Clock className="mr-2" /> };
    }
    const incomingPending = pendingRequests.find(
      (req) => req.senderId === targetUserId && req.receiverId === user?.uid && req.status === "pending"
    );
    if (incomingPending) {
      return { text: "Respond to Request", disabled: false, action: () => router.push('/profile'), icon: <UserPlus className="mr-2" /> };
    }
    if (requestStatus[targetUserId] === 'sending') {
        return { text: "Sending...", disabled: true, icon: <Loader2 className="mr-2 animate-spin" /> };
    }
    return { text: "Send Friend Request", disabled: false, icon: <UserPlus className="mr-2" /> };
  };


  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-1/2" />
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }
  
  if (loadingUsers) {
     return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <UserSearch className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Find Friends</h1>
        </div>
        {[1,2,3].map(i => (
            <Card key={i} className="p-4">
                <div className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-[200px]" />
                        <Skeleton className="h-3 w-[150px]" />
                    </div>
                    <Skeleton className="h-10 w-36 ml-auto" />
                </div>
            </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <UserSearch className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Find Friends</h1>
      </div>
      {users.length === 0 && !loadingUsers && (
        <p className="text-muted-foreground text-center">No other users found to connect with yet.</p>
      )}
      <div className="space-y-4">
        {users.map((u) => {
          const buttonState = getButtonState(u.uid);
          return (
            <Card key={u.uid} className="p-4 shadow-sm">
              <div className="flex items-center space-x-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={u.photoURL || undefined} alt={u.displayName || "User"} />
                  <AvatarFallback>{getInitials(u.displayName)}</AvatarFallback>
                </Avatar>
                <div className="flex-grow">
                  <p className="font-semibold text-lg">{u.displayName || "Anonymous User"}</p>
                  <p className="text-sm text-muted-foreground">{u.email || "No email"}</p>
                </div>
                {user && u.uid !== user.uid && (
                  <Button 
                    onClick={() => buttonState.action ? buttonState.action() : handleSendFriendRequest(u)} 
                    disabled={buttonState.disabled || requestStatus[u.uid] === 'sending'}
                    variant={buttonState.text === "Respond to Request" ? "outline" : "default"}
                    size="sm"
                  >
                    {buttonState.icon}
                    {buttonState.text}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

    