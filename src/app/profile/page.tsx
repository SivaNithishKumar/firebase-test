
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCircle, Mail, CalendarDays, Users, UserPlus, UserCheck, UserX, Loader2 } from "lucide-react";
import { format } from 'date-fns';
import { db } from "@/lib/firebase";
import { 
  doc, 
  getDoc, 
  onSnapshot, 
  collection, 
  query, 
  where, 
  writeBatch,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  runTransaction,
  Timestamp
} from "firebase/firestore";
import type { AppUserProfile, FriendRequest } from "@/types";
import { useToast } from "@/hooks/use-toast";

const convertAppUserProfileTimestamp = (profileData: any): AppUserProfile => {
    if (!profileData) return { uid: '', displayName: 'Unknown', email: null, photoURL: null, createdAt: Date.now(), friends: [] } as AppUserProfile; 
    return {
        ...profileData,
        uid: profileData.uid || '',
        displayName: profileData.displayName || 'Anonymous User',
        email: profileData.email || null,
        photoURL: profileData.photoURL || null,
        createdAt: profileData.createdAt instanceof Timestamp ? profileData.createdAt.toMillis() : (typeof profileData.createdAt === 'number' ? profileData.createdAt : Date.now()),
        friends: profileData.friends || [],
    } as AppUserProfile;
};

const convertFriendRequestTimestamp = (req: any): FriendRequest => {
    const convertedReq = { ...req, createdAt: req.createdAt instanceof Timestamp ? req.createdAt.toMillis() : req.createdAt, updatedAt: req.updatedAt instanceof Timestamp ? req.updatedAt.toMillis() : req.updatedAt };
    if (typeof convertedReq.createdAt !== 'number') convertedReq.createdAt = Date.now();
    if (typeof convertedReq.updatedAt !== 'number') convertedReq.updatedAt = Date.now();
    return convertedReq as FriendRequest;
}

export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<AppUserProfile[]>([]);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      setLoadingProfile(true);
      
      const profileRef = doc(db, "userProfiles", user.uid);
      const unsubscribeProfile = onSnapshot(profileRef, async (profileSnap) => {
        if (profileSnap.exists()) {
          const userProfileData = convertAppUserProfileTimestamp(profileSnap.data());
          setProfile(userProfileData);

          if (userProfileData.friends && userProfileData.friends.length > 0) {
            try {
              const friendPromises = userProfileData.friends.map(friendId => getDoc(doc(db, "userProfiles", friendId)));
              const friendDocs = await Promise.all(friendPromises);
              setFriends(friendDocs.filter(docSnap => docSnap.exists()).map(docSnap => convertAppUserProfileTimestamp(docSnap.data() as AppUserProfile)));
            } catch (error) {
                console.error("[ProfilePage] Error fetching friends details:", error);
                setFriends([]);
            }
          } else {
            setFriends([]);
          }
        } else {
          console.warn("[ProfilePage] User profile not found for UID:", user.uid, "Attempting to create one.");
          const basicProfileData: Omit<AppUserProfile, 'createdAt'> & { createdAt: any } = {
            uid: user.uid,
            displayName: user.displayName || "User",
            email: user.email,
            photoURL: user.photoURL,
            friends: [],
            createdAt: serverTimestamp()
          };
          try {
            await setDoc(profileRef, basicProfileData);
            console.log("[ProfilePage] Created basic profile for UID:", user.uid);
          } catch (error) {
            console.error("[ProfilePage] Error creating basic profile:", error);
            setProfile(null);
          }
        }
        setLoadingProfile(false);
      }, (error) => {
        console.error("[ProfilePage] Error fetching profile data with onSnapshot:", error);
        toast({ title: "Error", description: `Could not load profile: ${error.message}`, variant: "destructive" });
        setLoadingProfile(false);
      });

      const frQuery = query(collection(db, "friendRequests"), where("receiverId", "==", user.uid), where("status", "==", "pending"));
      const unsubscribeFriendRequests = onSnapshot(frQuery, (frSnapshot) => {
        setFriendRequests(frSnapshot.docs.map(docSnap => convertFriendRequestTimestamp({ id: docSnap.id, ...docSnap.data() } as FriendRequest)));
      }, (error) => {
        console.error("[ProfilePage] Error fetching friend requests:", error);
        toast({ title: "Error", description: `Could not load friend requests: ${error.message}`, variant: "destructive" });
      });
      
      return () => {
        unsubscribeProfile();
        unsubscribeFriendRequests();
      };
    } else {
      setProfile(null);
      setFriends([]);
      setFriendRequests([]);
      setLoadingProfile(false);
    }
  }, [user, toast, router]);

  const handleAcceptFriendRequest = async (request: FriendRequest) => {
    if (!user || !request.senderId || !profile) {
      toast({ title: "Error", description: "Missing user, profile, or sender information.", variant: "destructive" });
      return;
    }
    setProcessingRequestId(request.id);
    console.log(`[Friend Accept] Current User ${user.uid} (${profile.displayName}) accepting request ${request.id} from Sender ${request.senderId} (${request.senderDisplayName})`);

    const requestRef = doc(db, "friendRequests", request.id);
    const currentUserProfileRef = doc(db, "userProfiles", user.uid);
    const senderProfileRef = doc(db, "userProfiles", request.senderId);

    try {
      await runTransaction(db, async (transaction) => {
        const currentUserDoc = await transaction.get(currentUserProfileRef);
        const senderDoc = await transaction.get(senderProfileRef);

        if (!currentUserDoc.exists()) {
          throw new Error(`Current user profile (UID: ${user.uid}) does not exist.`);
        }
        if (!senderDoc.exists()) {
          throw new Error(`Sender profile (UID: ${request.senderId}) does not exist.`);
        }
        
        console.log(`[Friend Accept Transaction] Batch Details:
      1. Update friendRequest ${request.id} to accepted.
      2. Current User (${user.uid}) adds ${request.senderId} to their friends.
      3. Sender (${request.senderId}) adds ${user.uid} to their friends.`);

        transaction.update(requestRef, { status: "accepted", updatedAt: serverTimestamp() });
        transaction.update(currentUserProfileRef, { friends: arrayUnion(request.senderId) });
        transaction.update(senderProfileRef, { friends: arrayUnion(user.uid) });
      });
      toast({ title: "Friend Request Accepted", description: `You are now friends with ${request.senderDisplayName || 'User'}.` });
    } catch (error: any) {
      console.error(`[Friend Accept] Error accepting friend request ${request.id}:`, error);
      toast({ title: "Error Accepting Friend", description: error.message || 'Could not accept request.', variant: "destructive" });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleDeclineFriendRequest = async (request: FriendRequest) => {
    if (!user || !request.senderId) return;
    setProcessingRequestId(request.id);
    const requestRef = doc(db, "friendRequests", request.id);
    try {
      await updateDoc(requestRef, { status: "declined", updatedAt: serverTimestamp() });
      toast({ title: "Friend Request Declined", description: `Request from ${request.senderDisplayName || 'User'} declined.` });
    } catch (error: any) {
      console.error(`[Friend Decline] Error declining friend request ${request.id}:`, error);
      toast({ title: "Error Declining Friend", description: error.message || 'Could not decline request.', variant: "destructive" });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleUnfriend = async (friendId: string) => {
    if (!user || !profile) return;
    setProcessingRequestId(friendId);
    const batch = writeBatch(db);
    const currentUserProfileRef = doc(db, "userProfiles", user.uid);
    const friendProfileRef = doc(db, "userProfiles", friendId);
    const unfriendTarget = friends.find(f => f.uid === friendId);

    console.log(`[Unfriend] Current User ${user.uid} (${profile.displayName}) unfriending ${friendId} (${unfriendTarget?.displayName})`);
    console.log(`[Unfriend] Batch Details:
      1. Current User (${user.uid}) removes ${friendId} from their friends.
      2. Friend (${friendId}) removes ${user.uid} from their friends.`);

    try {
      batch.update(currentUserProfileRef, { friends: arrayRemove(friendId) });
      batch.update(friendProfileRef, { friends: arrayRemove(user.uid) });
      await batch.commit();
      toast({ title: "Unfriended", description: `You are no longer friends with ${unfriendTarget?.displayName || 'this user'}.` });
    } catch (error: any) {
      console.error(`[Unfriend] Error unfriending user ${friendId}:`, error);
      toast({ title: "Error Unfriending", description: error.message || 'Could not unfriend user.', variant: "destructive" });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const getInitials = (name?: string | null) => {
    if (!name) return "PN";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
  };

  const creationDate = profile?.createdAt
    ? format(new Date(profile.createdAt), "MMMM d, yyyy")
    : (user?.metadata.creationTime ? format(new Date(user.metadata.creationTime), "MMMM d, yyyy") : "N/A");

  if (authLoading || (loadingProfile && !profile)) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2 mb-4">
          <UserCircle className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">User Profile</h1>
        </div>
        <Card><CardHeader className="items-center text-center"><Skeleton className="h-24 w-24 rounded-full mb-2" /><Skeleton className="h-6 w-40 mb-1" /><Skeleton className="h-4 w-48" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Friend Requests</CardTitle></CardHeader><CardContent><Skeleton className="h-16 w-full" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Friends</CardTitle></CardHeader><CardContent><Skeleton className="h-16 w-full" /></CardContent></Card>
      </div>
    );
  }
  
  if (!user && !authLoading) {
    return <div className="text-center">Please log in to view your profile.</div>;
  }

  if (!profile && !loadingProfile && user) {
    return <div className="text-center">Loading profile data or profile not found...</div>;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      <div className="flex items-center gap-2 mb-4">
        <UserCircle className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Your Profile</h1>
      </div>
      <Card className="shadow-lg rounded-xl">
        <CardHeader className="items-center text-center p-6">
          <Avatar className="h-24 w-24 text-3xl mb-3 border-2 border-primary/20"><AvatarImage src={profile?.photoURL || user?.photoURL || undefined} alt={profile?.displayName || user?.displayName || "User"} /><AvatarFallback>{getInitials(profile?.displayName || user?.displayName || user?.email)}</AvatarFallback></Avatar>
          <CardTitle className="text-2xl">{profile?.displayName || user?.displayName || "Anonymous User"}</CardTitle>
          <CardDescription className="text-sm">Manage your PersonaNet account details and connections.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/30"><Mail className="h-5 w-5 text-muted-foreground flex-shrink-0" /><span className="text-sm font-medium text-muted-foreground">Email:</span><span className="text-sm text-foreground truncate ml-auto">{profile?.email || user?.email}</span></div>
          <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/30"><UserCircle className="h-5 w-5 text-muted-foreground flex-shrink-0" /><span className="text-sm font-medium text-muted-foreground">Display Name:</span><span className="text-sm text-foreground truncate ml-auto">{profile?.displayName || user?.displayName || "Not set"}</span></div>
          <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/30"><CalendarDays className="h-5 w-5 text-muted-foreground flex-shrink-0" /><span className="text-sm font-medium text-muted-foreground">Joined:</span><span className="text-sm text-foreground ml-auto">{creationDate}</span></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-6 w-6"/>Incoming Friend Requests ({friendRequests.length})</CardTitle></CardHeader>
        <CardContent>
          {loadingProfile && friendRequests.length === 0 && <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />}
          {!loadingProfile && friendRequests.length === 0 && (<p className="text-muted-foreground text-sm">No pending friend requests.</p>)}
          <div className="space-y-3">
            {friendRequests.map(req => (
              <div key={req.id} className="flex items-center justify-between p-3 border rounded-md bg-secondary/30">
                <div className="flex items-center space-x-3"><Avatar className="h-10 w-10"><AvatarImage src={req.senderPhotoURL || undefined} /><AvatarFallback>{getInitials(req.senderDisplayName)}</AvatarFallback></Avatar><div><p className="font-medium">{req.senderDisplayName || "User"}</p><p className="text-xs text-muted-foreground">Wants to be your friend</p></div></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleDeclineFriendRequest(req)} disabled={processingRequestId === req.id}>{processingRequestId === req.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserX className="h-4 w-4"/>}<span className="ml-1.5 hidden sm:inline">Decline</span></Button>
                  <Button size="sm" onClick={() => handleAcceptFriendRequest(req)} disabled={processingRequestId === req.id}>{processingRequestId === req.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserCheck className="h-4 w-4"/>}<span className="ml-1.5 hidden sm:inline">Accept</span></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Users className="h-6 w-6"/>Your Friends ({friends.length})</CardTitle></CardHeader>
        <CardContent>
          {loadingProfile && friends.length === 0 && <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />}
          {!loadingProfile && friends.length === 0 && (<p className="text-muted-foreground text-sm">You haven't added any friends yet. Go to the <Link href="/friends" className="text-primary hover:underline">Friends</Link> page to connect!</p>)}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {friends.map(friend => (
              <div key={friend.uid} className="flex items-center justify-between p-3 border rounded-md">
                <div className="flex items-center space-x-3"><Avatar className="h-10 w-10"><AvatarImage src={friend.photoURL || undefined} /><AvatarFallback>{getInitials(friend.displayName)}</AvatarFallback></Avatar><div><p className="font-medium">{friend.displayName || "User"}</p><p className="text-xs text-muted-foreground">{friend.email || "No email"}</p></div></div>
                <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => handleUnfriend(friend.uid)} disabled={processingRequestId === friend.uid} title="Unfriend">{processingRequestId === friend.uid ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserX className="h-4 w-4"/>}</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
