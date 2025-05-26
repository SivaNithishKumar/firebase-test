
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
import { db, Timestamp } from "@/lib/firebase";
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
  setDoc
} from "firebase/firestore";
import type { AppUserProfile, FriendRequest, NetworkJoinRequest } from "@/types";
import { useToast } from "@/hooks/use-toast";

const convertAppUserProfileTimestamp = (profileData: any): AppUserProfile => {
    if (!profileData) return { uid: '', displayName: 'Unknown', email: null, photoURL: null, createdAt: Date.now(), friends: [], memberOfNetworks: [], myNetworkMembers: [] } as AppUserProfile; 
    return {
        ...profileData,
        uid: profileData.uid || '',
        displayName: profileData.displayName || 'Anonymous User',
        email: profileData.email || null,
        photoURL: profileData.photoURL || null,
        createdAt: profileData.createdAt instanceof Timestamp ? profileData.createdAt.toMillis() : (typeof profileData.createdAt === 'number' ? profileData.createdAt : Date.now()),
        friends: profileData.friends || [],
        memberOfNetworks: profileData.memberOfNetworks || [],
        myNetworkMembers: profileData.myNetworkMembers || [],
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
          console.warn("[ProfilePage] User profile not found for UID:", user.uid);
          const basicProfile: AppUserProfile = {
            uid: user.uid,
            displayName: user.displayName || "User",
            email: user.email,
            photoURL: user.photoURL,
            createdAt: Date.now(),
            friends: [],
            memberOfNetworks: [],
            myNetworkMembers: []
          };
          try {
            await setDoc(profileRef, { ...basicProfile, createdAt: serverTimestamp() });
            setProfile(convertAppUserProfileTimestamp(basicProfile));
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

      const njrQuery = query(collection(db, "networkJoinRequests"), where("networkOwnerId", "==", user.uid), where("status", "==", "pending"));
      const unsubscribeNetworkRequests = onSnapshot(njrQuery, (njrSnapshot) => {
        setNetworkJoinRequests(njrSnapshot.docs.map(docSnap => convertNetworkJoinRequestTimestamp({ id: docSnap.id, ...docSnap.data() } as NetworkJoinRequest)));
      }, (error) => {
         console.error("[ProfilePage] Error fetching network join requests:", error);
         toast({ title: "Error", description: `Could not load network join requests: ${error.message}`, variant: "destructive" });
      });
      
      return () => {
        unsubscribeProfile();
        unsubscribeFriendRequests();
        unsubscribeNetworkRequests();
      };
    } else {
      setProfile(null);
      setFriends([]);
      setFriendRequests([]);
      setNetworkJoinRequests([]);
      setMyNetworkMembersList([]);
      setLoadingProfile(false);
    }
  }, [user, toast, router]);

  const handleAcceptFriendRequest = async (request: FriendRequest) => {
    if (!user || !request.senderId || !profile) return;
    setProcessingRequestId(request.id);
    const batch = writeBatch(db);
    const requestRef = doc(db, "friendRequests", request.id);
    const currentUserProfileRef = doc(db, "userProfiles", user.uid);
    const senderProfileRef = doc(db, "userProfiles", request.senderId);

    console.log(`[Friend Accept] Current User ${user.uid} (${profile.displayName}) accepting request ${request.id} from Sender ${request.senderId} (${request.senderDisplayName})`);
    console.log(`[Friend Accept] Batch Details:
      1. Update friendRequest ${request.id} to accepted.
      2. Current User (${user.uid}) adds ${request.senderId} to their friends.
      3. Sender (${request.senderId}) adds ${user.uid} to their friends.`);

    try {
      batch.update(requestRef, { status: "accepted", updatedAt: serverTimestamp() });
      batch.update(currentUserProfileRef, { friends: arrayUnion(request.senderId) });
      batch.update(senderProfileRef, { friends: arrayUnion(user.uid) });
      await batch.commit();
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

  const handleAcceptNetworkJoinRequest = async (request: NetworkJoinRequest) => {
    if (!user || !profile || !request.senderId) {
      toast({ title: "Error", description: "Cannot process request. Missing user, profile, or sender information.", variant: "destructive" });
      return;
    }
    setProcessingRequestId(request.id);
    const requestRef = doc(db, "networkJoinRequests", request.id);
    const networkOwnerProfileRef = doc(db, "userProfiles", user.uid); // Current user is the network owner
    const senderProfileRef = doc(db, "userProfiles", request.senderId);

    console.log(`[Network Join Accept] Network Owner ${user.uid} (Profile: ${profile.displayName}) accepting request ${request.id} from Sender ${request.senderId} (${request.senderDisplayName})`);
    
    try {
      await runTransaction(db, async (transaction) => {
        const networkOwnerDoc = await transaction.get(networkOwnerProfileRef);
        const senderDoc = await transaction.get(senderProfileRef);

        if (!networkOwnerDoc.exists()) {
          throw new Error("Network owner profile does not exist.");
        }
        if (!senderDoc.exists()) {
          throw new Error("Sender profile does not exist.");
        }
        const networkOwnerData = networkOwnerDoc.data() as AppUserProfile;
        const senderData = senderDoc.data() as AppUserProfile;

        console.log(`[Network Join Accept Transaction] Batch Details:
          1. Update networkJoinRequest ${request.id} to accepted.
          2. Network Owner (${user.uid}) adds ${request.senderId} to their myNetworkMembers. Current members: ${JSON.stringify(networkOwnerData.myNetworkMembers || [])}
          3. Sender (${request.senderId}) adds Network Owner (${user.uid}) to their memberOfNetworks. Current networks: ${JSON.stringify(senderData.memberOfNetworks || [])}`);
        
        transaction.update(requestRef, { status: "accepted", updatedAt: serverTimestamp() });
        transaction.update(networkOwnerProfileRef, { myNetworkMembers: arrayUnion(request.senderId) });
        transaction.update(senderProfileRef, { memberOfNetworks: arrayUnion(user.uid) });
      });
      toast({ title: "Network Join Request Accepted", description: `${request.senderDisplayName || 'User'} has joined your network.` });
    } catch (error: any) {
      console.error(`[Network Join Accept] Error accepting network join request ${request.id} from ${request.senderId}:`, error);
      toast({ title: "Error Accepting Join Request", description: error.message || 'Could not accept join request.', variant: "destructive" });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleDeclineNetworkJoinRequest = async (request: NetworkJoinRequest) => {
    if (!user || !request.senderId) return;
    setProcessingRequestId(request.id);
    const requestRef = doc(db, "networkJoinRequests", request.id);
    try {
      await updateDoc(requestRef, { status: "declined", updatedAt: serverTimestamp() });
      toast({ title: "Network Join Request Declined", description: `Request from ${request.senderDisplayName || 'User'} declined.` });
    } catch (error: any) {
      console.error(`[Network Join Decline] Error declining request ${request.id}:`, error);
      toast({ title: "Error Declining Join Request", description: error.message || 'Could not decline request.', variant: "destructive" });
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRemoveNetworkMember = async (memberId: string) => {
    if (!user || !memberId || !profile) return;
    setProcessingRequestId(memberId);
    const batch = writeBatch(db);
    const networkOwnerProfileRef = doc(db, "userProfiles", user.uid); // Current user is the network owner
    const memberProfileRef = doc(db, "userProfiles", memberId);
    const removedMember = myNetworkMembersList.find(m => m.uid === memberId);

    console.log(`[Remove Member] Network Owner ${user.uid} (${profile.displayName}) removing member ${memberId} (${removedMember?.displayName})`);
    console.log(`[Remove Member] Batch Details:
      1. Network Owner (${user.uid}) removes ${memberId} from their myNetworkMembers.
      2. Member (${memberId}) removes Network Owner (${user.uid}) from their memberOfNetworks.`);

    try {
      batch.update(networkOwnerProfileRef, { myNetworkMembers: arrayRemove(memberId) });
      batch.update(memberProfileRef, { memberOfNetworks: arrayRemove(user.uid) });
      await batch.commit();
      toast({ title: "Member Removed", description: `${removedMember?.displayName || 'User'} has been removed from your network.` });
    } catch (error: any) {
      console.error(`[Remove Member] Error removing member ${memberId}:`, error);
      toast({ title: "Error Removing Member", description: error.message || 'Could not remove member.', variant: "destructive" });
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
        <Card><CardHeader><CardTitle>Network Join Requests</CardTitle></CardHeader><CardContent><Skeleton className="h-16 w-full" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Friends</CardTitle></CardHeader><CardContent><Skeleton className="h-16 w-full" /></CardContent></Card>
        <Card><CardHeader><CardTitle>My Network Members</CardTitle></CardHeader><CardContent><Skeleton className="h-16 w-full" /></CardContent></Card>
      </div>
    );
  }
  
  if (!user && !authLoading) {
    // This case should be handled by the top-level useEffect redirect, but as a fallback:
    return <div className="text-center">Please log in to view your profile.</div>;
  }

  if (!profile && !loadingProfile && user) {
    // Profile data might still be loading or doesn't exist yet (e.g., for a very new user if onSnapshot hasn't fired)
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
