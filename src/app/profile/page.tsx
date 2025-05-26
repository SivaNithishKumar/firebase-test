
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { UserCircle, Mail, CalendarDays, Users, UserPlus, UserCheck, UserX, Loader2, Network, UserMinus, UsersRound } from "lucide-react";
import { format } from 'date-fns';
import { db, functions, Timestamp } from "@/lib/firebase"; // Import functions from firebase
import { getFunctions, httpsCallable, type HttpsCallableResult } from "firebase/functions"; // For calling functions
import { doc, getDoc, onSnapshot, collection, query, where } from "firebase/firestore"; // Removed updateDoc, deleteDoc, writeBatch, arrayUnion, arrayRemove, serverTimestamp, runTransaction
import type { AppUserProfile, FriendRequest, NetworkJoinRequest } from "@/types";
import { useToast } from "@/hooks/use-toast";

const convertAppUserProfileTimestamp = (profile: any): AppUserProfile => {
    return {
        ...profile,
        createdAt: profile.createdAt instanceof Timestamp ? profile.createdAt.toMillis() : profile.createdAt,
        friends: profile.friends || [],
        memberOfNetworks: profile.memberOfNetworks || [],
        myNetworkMembers: profile.myNetworkMembers || [],
    } as AppUserProfile;
};

const convertFriendRequestTimestamp = (req: any): FriendRequest => {
    const convertedReq = { ...req, createdAt: req.createdAt instanceof Timestamp ? req.createdAt.toMillis() : req.createdAt, updatedAt: req.updatedAt instanceof Timestamp ? req.updatedAt.toMillis() : req.updatedAt };
    if (typeof convertedReq.createdAt !== 'number') convertedReq.createdAt = Date.now();
    if (typeof convertedReq.updatedAt !== 'number') convertedReq.updatedAt = Date.now();
    return convertedReq as FriendRequest;
}

const convertNetworkJoinRequestTimestamp = (req: any): NetworkJoinRequest => {
    const convertedReq = { ...req, createdAt: req.createdAt instanceof Timestamp ? req.createdAt.toMillis() : req.createdAt, updatedAt: req.updatedAt instanceof Timestamp ? req.updatedAt.toMillis() : req.updatedAt };
    if (typeof convertedReq.createdAt !== 'number') convertedReq.createdAt = Date.now();
    if (typeof convertedReq.updatedAt !== 'number') convertedReq.updatedAt = Date.now();
    return convertedReq as NetworkJoinRequest;
}


export default function ProfilePage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [profile, setProfile] = useState<AppUserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [networkJoinRequests, setNetworkJoinRequests] = useState<NetworkJoinRequest[]>([]);
  const [friends, setFriends] = useState<AppUserProfile[]>([]);
  const [myNetworkMembersList, setMyNetworkMembersList] = useState<AppUserProfile[]>([]);
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      setLoadingProfile(true);
      
      // Snapshot listener for the user's own profile for real-time updates to friends/members
      const profileRef = doc(db, "userProfiles", user.uid);
      const unsubscribeProfile = onSnapshot(profileRef, async (profileSnap) => {
        if (profileSnap.exists()) {
          const userProfileData = convertAppUserProfileTimestamp(profileSnap.data());
          setProfile(userProfileData);

          if (userProfileData.friends && userProfileData.friends.length > 0) {
            const friendPromises = userProfileData.friends.map(friendId => getDoc(doc(db, "userProfiles", friendId)));
            const friendDocs = await Promise.all(friendPromises);
            setFriends(friendDocs.filter(docSnap => docSnap.exists()).map(docSnap => convertAppUserProfileTimestamp(docSnap.data() as AppUserProfile)));
          } else {
            setFriends([]);
          }

          if (userProfileData.myNetworkMembers && userProfileData.myNetworkMembers.length > 0) {
              const memberPromises = userProfileData.myNetworkMembers.map(memberId => getDoc(doc(db, "userProfiles", memberId)));
              const memberDocs = await Promise.all(memberPromises);
              setMyNetworkMembersList(memberDocs.filter(docSnap => docSnap.exists()).map(docSnap => convertAppUserProfileTimestamp(docSnap.data() as AppUserProfile)));
          } else {
              setMyNetworkMembersList([]);
          }
        } else {
          console.warn("User profile not found for UID:", user.uid);
          setProfile(null); // Explicitly set to null if not found
        }
        setLoadingProfile(false); // Set loading to false after initial load or profile not found
      }, (error) => {
        console.error("Error fetching profile data with onSnapshot:", error);
        toast({ title: "Error", description: `Could not load profile: ${error.message}`, variant: "destructive" });
        setLoadingProfile(false);
      });

      // Snapshot listener for incoming friend requests
      const frQuery = query(collection(db, "friendRequests"), where("receiverId", "==", user.uid), where("status", "==", "pending"));
      const unsubscribeFriendRequests = onSnapshot(frQuery, (frSnapshot) => {
        setFriendRequests(frSnapshot.docs.map(docSnap => convertFriendRequestTimestamp({ id: docSnap.id, ...docSnap.data() } as FriendRequest)));
      }, (error) => {
        console.error("Error fetching friend requests:", error);
        toast({ title: "Error", description: `Could not load friend requests: ${error.message}`, variant: "destructive" });
      });

      // Snapshot listener for incoming network join requests
      const njrQuery = query(collection(db, "networkJoinRequests"), where("networkOwnerId", "==", user.uid), where("status", "==", "pending"));
      const unsubscribeNetworkRequests = onSnapshot(njrQuery, (njrSnapshot) => {
        setNetworkJoinRequests(njrSnapshot.docs.map(docSnap => convertNetworkJoinRequestTimestamp({ id: docSnap.id, ...docSnap.data() } as NetworkJoinRequest)));
      }, (error) => {
         console.error("Error fetching network join requests:", error);
         toast({ title: "Error", description: `Could not load network join requests: ${error.message}`, variant: "destructive" });
      });
      
      // Cleanup snapshot listeners on unmount
      return () => {
        unsubscribeProfile();
        unsubscribeFriendRequests();
        unsubscribeNetworkRequests();
      };
    } else {
      // Clear data if user logs out
      setProfile(null);
      setFriends([]);
      setFriendRequests([]);
      setNetworkJoinRequests([]);
      setMyNetworkMembersList([]);
      setLoadingProfile(false);
    }
  }, [user, toast]);


  const handleAcceptFriendRequest = async (request: FriendRequest) => {
    if (!user || !profile) return;
    setProcessingRequestId(request.id);
    try {
      const acceptFriendRequestFn = httpsCallable(functions, 'acceptFriendRequest');
      await acceptFriendRequestFn({ requestId: request.id });
      toast({ title: "Friend Request Accepted", description: `You are now friends with ${request.senderDisplayName}.` });
      // Local state will update via snapshot listener
    } catch (error: any) {
      console.error("Error accepting friend request via function:", error);
      toast({ title: "Error", description: `Could not accept request: ${error.message || 'Cloud function error'}`, variant: "destructive" });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleDeclineFriendRequest = async (request: FriendRequest) => {
    if (!user) return;
    setProcessingRequestId(request.id);
    try {
      const declineFriendRequestFn = httpsCallable(functions, 'declineFriendRequest'); // Assuming you'll create this
      await declineFriendRequestFn({ requestId: request.id });
      toast({ title: "Friend Request Declined", description: `Request from ${request.senderDisplayName} declined.` });
      // Local state will update via snapshot listener
    } catch (error: any) {
      console.error("Error declining friend request via function:", error);
      toast({ title: "Error", description: `Could not decline request: ${error.message || 'Cloud function error'}`, variant: "destructive" });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleUnfriend = async (friendId: string) => {
    if (!user || !profile) return;
    setProcessingRequestId(friendId);
    try {
        const unfriendUserFn = httpsCallable(functions, 'unfriendUser');
        await unfriendUserFn({ friendId: friendId });
        const unfriendedUser = friends.find(f => f.uid === friendId);
        toast({ title: "Unfriended", description: `You are no longer friends with ${unfriendedUser?.displayName || 'this user'}.` });
        // Local state updates via snapshot
    } catch (error: any) {
        console.error("Error unfriending user via function:", error);
        toast({ title: "Error", description: `Could not unfriend user: ${error.message || 'Cloud function error'}`, variant: "destructive" });
    } finally {
        setProcessingRequestId(null);
    }
  };

  const handleAcceptNetworkJoinRequest = async (request: NetworkJoinRequest) => {
    if (!user || !profile) return;
    setProcessingRequestId(request.id);
    try {
        const acceptNetworkJoinRequestFn = httpsCallable(functions, 'acceptNetworkJoinRequest');
        await acceptNetworkJoinRequestFn({ requestId: request.id });
        toast({ title: "Network Join Request Accepted", description: `${request.senderDisplayName} has joined your network.` });
        // Local state updates via snapshot
    } catch (error: any) {
        console.error("Error accepting network join request via function:", error);
        toast({ title: "Error", description: `Could not accept join request: ${error.message || 'Cloud function error'}`, variant: "destructive" });
    } finally {
        setProcessingRequestId(null);
    }
  };

  const handleDeclineNetworkJoinRequest = async (request: NetworkJoinRequest) => {
    if (!user) return;
    setProcessingRequestId(request.id);
    try {
        const declineNetworkJoinRequestFn = httpsCallable(functions, 'declineNetworkJoinRequest'); // Assuming you'll create this
        await declineNetworkJoinRequestFn({ requestId: request.id });
        toast({ title: "Network Join Request Declined", description: `Request from ${request.senderDisplayName} to join your network declined.` });
        // Local state updates via snapshot
    } catch (error: any)
{
        console.error("Error declining network join request via function:", error);
        toast({ title: "Error", description: `Could not decline join request: ${error.message || 'Cloud function error'}`, variant: "destructive" });
    } finally {
        setProcessingRequestId(null);
    }
  };

  const handleRemoveNetworkMember = async (memberId: string) => {
    if (!user || !profile) return;
    setProcessingRequestId(memberId); 
    try {
        const removeNetworkMemberFn = httpsCallable(functions, 'removeNetworkMember');
        await removeNetworkMemberFn({ memberId: memberId });
        const removedMember = myNetworkMembersList.find(m => m.uid === memberId);
        toast({ title: "Member Removed", description: `${removedMember?.displayName || 'User'} has been removed from your network.` });
        // Local state updates via snapshot
    } catch (error: any) {
        console.error("Error removing network member via function:", error);
        toast({ title: "Error", description: `Could not remove member: ${error.message || 'Cloud function error'}`, variant: "destructive" });
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

  if (authLoading || (loadingProfile && !profile)) { // Show skeleton if auth is loading OR profile data is loading and not yet available
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2 mb-4">
          <UserCircle className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">User Profile</h1>
        </div>
        <Card><CardHeader className="items-center text-center"><Skeleton className="h-24 w-24 rounded-full mb-2" /><Skeleton className="h-6 w-40 mb-1" /><Skeleton className="h-4 w-48" /></CardHeader><CardContent className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Friend Requests</CardTitle></CardHeader><CardContent><Skeleton className="h-16 w-full" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Network Join Requests</CardTitle></CardHeader><CardContent><Skeleton className="h-16 w-full" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Friends</CardTitle></CardHeader><CardContent><Skeleton className="h-16 w-full" /></CardContent></Card>
        <Card><CardHeader><CardTitle>My Network Members</CardTitle></CardHeader><CardContent><Skeleton className="h-16 w-full" /></CardContent></Card>
      </div>
    );
  }
  
  if (!user && !authLoading) { // If auth is done loading and there's no user, this typically means they should be redirected.
    // The useEffect hook at the top handles redirection, so this state might not be visible for long.
    return <div className="text-center">Please log in to view your profile.</div>;
  }

  if (!profile && !loadingProfile && user) { // User is logged in, profile loading finished, but profile is null
    return <div className="text-center">User profile not found. It might be still creating or an error occurred. Please try refreshing.</div>;
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

      {/* Incoming Friend Requests */}
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

      {/* Incoming Network Join Requests */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Network className="h-6 w-6"/>Network Join Requests ({networkJoinRequests.length})</CardTitle></CardHeader>
        <CardContent>
          {loadingProfile && networkJoinRequests.length === 0 && <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />}
          {!loadingProfile && networkJoinRequests.length === 0 && (<p className="text-muted-foreground text-sm">No pending requests to join your network.</p>)}
          <div className="space-y-3">
            {networkJoinRequests.map(req => (
              <div key={req.id} className="flex items-center justify-between p-3 border rounded-md bg-secondary/30">
                <div className="flex items-center space-x-3"><Avatar className="h-10 w-10"><AvatarImage src={req.senderPhotoURL || undefined} /><AvatarFallback>{getInitials(req.senderDisplayName)}</AvatarFallback></Avatar><div><p className="font-medium">{req.senderDisplayName || "User"}</p><p className="text-xs text-muted-foreground">Wants to join your network</p></div></div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleDeclineNetworkJoinRequest(req)} disabled={processingRequestId === req.id}>{processingRequestId === req.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserX className="h-4 w-4"/>}<span className="ml-1.5 hidden sm:inline">Decline</span></Button>
                  <Button size="sm" onClick={() => handleAcceptNetworkJoinRequest(req)} disabled={processingRequestId === req.id}>{processingRequestId === req.id ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserCheck className="h-4 w-4"/>}<span className="ml-1.5 hidden sm:inline">Accept</span></Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>


      {/* Friends List */}
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

      {/* My Network Members List */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="h-6 w-6"/>My Network Members ({myNetworkMembersList.length})</CardTitle></CardHeader>
        <CardContent>
          {loadingProfile && myNetworkMembersList.length === 0 && <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />}
          {!loadingProfile && myNetworkMembersList.length === 0 && (<p className="text-muted-foreground text-sm">No one has joined your network yet.</p>)}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {myNetworkMembersList.map(member => (
              <div key={member.uid} className="flex items-center justify-between p-3 border rounded-md">
                <div className="flex items-center space-x-3"><Avatar className="h-10 w-10"><AvatarImage src={member.photoURL || undefined} /><AvatarFallback>{getInitials(member.displayName)}</AvatarFallback></Avatar><div><p className="font-medium">{member.displayName || "User"}</p><p className="text-xs text-muted-foreground">{member.email || "No email"}</p></div></div>
                <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => handleRemoveNetworkMember(member.uid)} disabled={processingRequestId === member.uid} title="Remove Member">{processingRequestId === member.uid ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserMinus className="h-4 w-4"/>}</Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
