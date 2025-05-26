
"use client";

import { useEffect, useState, useMemo } from "react";
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
  onSnapshot,
  or, // Keep 'or'
  and // Add 'and'
} from "firebase/firestore";
import type { AppUserProfile, FriendRequest, NetworkJoinRequest } from "@/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, CheckCircle, Clock, Loader2, Users as FriendsIcon, Search, UserRoundPlus, Network } from "lucide-react";

const convertAppUserProfileTimestamp = (profile: any): AppUserProfile => {
    if (!profile) return { uid: '', displayName: 'Anonymous', email: null, photoURL: null, createdAt: Date.now(), friends: [], memberOfNetworks: [], myNetworkMembers: [] };
    return {
        ...profile,
        createdAt: profile.createdAt instanceof Timestamp ? profile.createdAt.toMillis() : (profile.createdAt || Date.now()),
        friends: profile.friends || [],
        memberOfNetworks: profile.memberOfNetworks || [],
        myNetworkMembers: profile.myNetworkMembers || [],
    } as AppUserProfile;
};

export default function FriendsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [allUsers, setAllUsers] = useState<AppUserProfile[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [currentUserProfile, setCurrentUserProfile] = useState<AppUserProfile | null>(null);
  const [pendingFriendRequests, setPendingFriendRequests] = useState<FriendRequest[]>([]);
  const [pendingNetworkRequests, setPendingNetworkRequests] = useState<NetworkJoinRequest[]>([]);
  const [requestStatus, setRequestStatus] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});
  const [networkRequestStatus, setNetworkRequestStatus] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      const fetchUsersAndData = async () => {
        setLoadingUsers(true);
        try {
          const userProfileRef = doc(db, "userProfiles", user.uid);
          const userProfileSnap = await getDoc(userProfileRef);
          if (userProfileSnap.exists()) {
            setCurrentUserProfile(convertAppUserProfileTimestamp(userProfileSnap.data()));
          } else {
             console.warn(`[FriendsPage] Current user profile not found for UID: ${user.uid}. Creating one.`);
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
              // @ts-ignore
              await setDoc(userProfileRef, { ...basicProfile, createdAt: serverTimestamp() });
              setCurrentUserProfile(convertAppUserProfileTimestamp(basicProfile));
          }

          const usersQuery = query(collection(db, "userProfiles"), where("uid", "!=", user.uid), limit(50));
          const usersSnapshot = await getDocs(usersQuery);
          const usersData = usersSnapshot.docs.map(docSnap => convertAppUserProfileTimestamp(docSnap.data()));
          console.log("[FriendsPage] Fetched users data count:", usersData.length);
          setAllUsers(usersData);

        } catch (error: any) {
          console.error("[FriendsPage] Error fetching users or profile:", error);
          toast({ title: "Error", description: `Could not load user data: ${error.message}`, variant: "destructive" });
        } finally {
            setLoadingUsers(false);
        }
      };
      fetchUsersAndData();

      // Listener for friend requests (both outgoing and incoming marked as pending)
      const frQuery = query(
        collection(db, "friendRequests"),
        and( // Nest within and()
            where("status", "==", "pending"),
            or(
              where("senderId", "==", user.uid),
              where("receiverId", "==", user.uid)
            )
        )
      );
      const unsubscribeFriendRequests = onSnapshot(frQuery, (snapshot) => {
        const requests = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as FriendRequest));
        setPendingFriendRequests(requests);
      }, (error) => {
        console.error("[FriendsPage] Error fetching pending friend requests:", error);
        toast({ title: "Error", description: `Failed to listen for friend requests: ${error.message}`, variant: "destructive" });
      });

      // Listener for outgoing network requests marked as pending
      const nrQuery = query(collection(db, "networkJoinRequests"), where("senderId", "==", user.uid), where("status", "==", "pending"));
      const unsubscribeNetworkRequests = onSnapshot(nrQuery, (snapshot) => {
         const requests = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as NetworkJoinRequest));
         setPendingNetworkRequests(requests);
      }, (error) => {
        console.error("[FriendsPage] Error fetching pending network requests:", error);
        toast({ title: "Error", description: `Failed to listen for network requests: ${error.message}`, variant: "destructive" });
      });

      return () => {
        unsubscribeFriendRequests();
        unsubscribeNetworkRequests();
      };

    }
  }, [user, toast]);

  const filteredUsers = useMemo(() => {
    if (!searchTerm) {
      return allUsers;
    }
    return allUsers.filter(u =>
      (u.displayName || "").toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allUsers, searchTerm]);

  const getInitials = (name?: string | null) => {
    if (!name) return "??";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
  };

  const handleSendFriendRequest = async (targetUser: AppUserProfile) => {
    if (!user || !currentUserProfile) {
      toast({ title: "Authentication Error", description: "Please ensure you are logged in.", variant: "destructive" });
      return;
    }
    setRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'sending' }));

    console.log(`[Send Friend Request] Current User UID (request.auth.uid equivalent): ${user.uid}`);
    console.log(`[Send Friend Request] Current User Profile DisplayName: ${currentUserProfile.displayName}`);
    console.log(`[Send Friend Request] Target User UID: ${targetUser.uid}, DisplayName: ${targetUser.displayName}`);

    try {
      const q1 = query(collection(db, "friendRequests"), where("senderId", "==", user.uid), where("receiverId", "==", targetUser.uid));
      const q2 = query(collection(db, "friendRequests"), where("senderId", "==", targetUser.uid), where("receiverId", "==", user.uid));
      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

      if (!snap1.empty || !snap2.empty) {
        const existingRequestDoc = snap1.docs[0] || snap2.docs[0];
        const existingRequest = existingRequestDoc?.data();
        if (existingRequest?.status === 'pending') {
            toast({ title: "Request Already Pending", description: "A friend request is already pending with this user.", variant: "default" });
        } else if (existingRequest?.status === 'accepted' || currentUserProfile.friends?.includes(targetUser.uid)) {
            toast({ title: "Already Friends", description: `You are already friends with ${targetUser.displayName}.`, variant: "default" });
        } else {
             toast({ title: "Request Previously Handled", description: "A friend request was previously handled or exists with a non-pending status.", variant: "default" });
        }
        setRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'sent' }));
        return;
      }

      const newRequestData = {
        senderId: user.uid,
        senderDisplayName: currentUserProfile.displayName || "Anonymous User",
        senderPhotoURL: currentUserProfile.photoURL || null,
        receiverId: targetUser.uid,
        status: "pending" as FriendRequest['status'],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      console.log('[Send Friend Request] Data to be sent to Firestore (request.resource.data equivalent):', JSON.stringify(newRequestData, (key, value) => {
        if (value && typeof value === 'object' && value.hasOwnProperty('_methodName') && value._methodName === 'serverTimestamp') {
          return 'FieldValue.serverTimestamp()';
        }
        return value;
      }, 2));

      await addDoc(collection(db, "friendRequests"), newRequestData);
      // onSnapshot listener will update pendingFriendRequests
      setRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'sent' }));
      toast({ title: "Friend Request Sent", description: `Request sent to ${targetUser.displayName}.` });
    } catch (error: any) {
      console.error("[Send Friend Request] Firestore Error:", error);
      setRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'error' }));
      toast({ title: "Error Sending Request", description: `Could not send request: ${error.message}`, variant: "destructive" });
    }
  };

  const handleRequestToJoinNetwork = async (targetUser: AppUserProfile) => {
    if (!user || !currentUserProfile) {
      toast({ title: "Authentication Error", description: "Please ensure you are logged in.", variant: "destructive" });
      return;
    }
    setNetworkRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'sending' }));
    try {
        if (currentUserProfile.memberOfNetworks?.includes(targetUser.uid)) {
            toast({ title: "Already a Member", description: `You are already a member of ${targetUser.displayName}'s network.`, variant: "default" });
            setNetworkRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'sent' }));
            return;
        }
        const existingRequestQuery = query(collection(db, "networkJoinRequests"),
            where("senderId", "==", user.uid),
            where("networkOwnerId", "==", targetUser.uid),
            where("status", "==", "pending"));
        const existingSnap = await getDocs(existingRequestQuery);
        if (!existingSnap.empty) {
            toast({ title: "Request Already Sent", description: `A request to join ${targetUser.displayName}'s network is already pending.`, variant: "default" });
            setNetworkRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'sent' }));
            return;
        }

        const newRequestData = {
            senderId: user.uid,
            senderDisplayName: currentUserProfile.displayName || "Anonymous User",
            senderPhotoURL: currentUserProfile.photoURL || null,
            networkOwnerId: targetUser.uid,
            status: "pending" as NetworkJoinRequest['status'],
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };
        console.log('[Network Join Request] Data to be sent to Firestore:', JSON.stringify(newRequestData, (key, value) => {
          if (value && typeof value === 'object' && value.hasOwnProperty('_methodName') && value._methodName === 'serverTimestamp') {
            return 'FieldValue.serverTimestamp()';
          }
          return value;
        }, 2));

        await addDoc(collection(db, "networkJoinRequests"), newRequestData);
        // onSnapshot will update pendingNetworkRequests
        setNetworkRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'sent' }));
        toast({ title: "Network Join Request Sent", description: `Request sent to join ${targetUser.displayName}'s network.` });
    } catch (error: any) {
        console.error("[Network Join Request] Firestore Error:", error);
        setNetworkRequestStatus(prev => ({ ...prev, [targetUser.uid]: 'error' }));
        toast({ title: "Error Sending Join Request", description: `Could not send join request: ${error.message}`, variant: "destructive" });
    }
  };


  const getFriendButtonState = (targetUserId: string) => {
    if (currentUserProfile?.friends?.includes(targetUserId)) {
      return { text: "Friends", disabled: true, icon: <CheckCircle className="mr-2" />, variant: "outline" as const };
    }
    const outgoingPending = pendingFriendRequests.find(req => req.senderId === user?.uid && req.receiverId === targetUserId && req.status === "pending");
    if (outgoingPending) {
      return { text: "Request Sent", disabled: true, icon: <Clock className="mr-2" />, variant: "outline" as const };
    }
    const incomingPending = pendingFriendRequests.find(req => req.senderId === targetUserId && req.receiverId === user?.uid && req.status === "pending");
    if (incomingPending) {
      return { text: "Respond on Profile", disabled: false, action: () => router.push('/profile'), icon: <UserPlus className="mr-2" />, variant: "secondary" as const };
    }
    if (requestStatus[targetUserId] === 'sending') {
        return { text: "Sending...", disabled: true, icon: <Loader2 className="mr-2 animate-spin" />, variant: "default" as const };
    }
    return { text: "Add Friend", disabled: false, icon: <UserRoundPlus className="mr-2" />, variant: "default" as const };
  };

  const getNetworkButtonState = (targetUserId: string) => {
    if (currentUserProfile?.memberOfNetworks?.includes(targetUserId)) {
        return { text: "Joined Network", disabled: true, icon: <CheckCircle className="mr-2" />, variant: "outline" as const };
    }
    const outgoingPending = pendingNetworkRequests.find(req => req.senderId === user?.uid && req.networkOwnerId === targetUserId && req.status === "pending");
    if (outgoingPending) {
        return { text: "Request Sent", disabled: true, icon: <Clock className="mr-2" />, variant: "outline" as const };
    }
     if (networkRequestStatus[targetUserId] === 'sending') {
        return { text: "Sending...", disabled: true, icon: <Loader2 className="mr-2 animate-spin" />, variant: "default" as const };
    }
    if (currentUserProfile?.uid === targetUserId) {
        return { text: "Your Network", disabled: true, icon: <Network className="mr-2" />, variant: "outline" as const };
    }
    return { text: "Join Network", disabled: false, icon: <Network className="mr-2" />, variant: "default" as const };
  };


  if (authLoading || (!user && !authLoading) || (loadingUsers && !currentUserProfile)) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <FriendsIcon className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight">Friends</h1>
        </div>
        <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Skeleton className="h-10 w-full pl-10" />
        </div>
        {[1,2,3].map(i => (
            <Card key={i} className="p-4">
                <div className="flex items-center space-x-4">
                    <Skeleton className="h-12 w-12 rounded-full" />
                    <div className="space-y-2 flex-grow">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Skeleton className="h-9 w-28" />
                        <Skeleton className="h-9 w-32" />
                    </div>
                </div>
            </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2 mb-4">
        <FriendsIcon className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Friends</h1>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
            type="search"
            placeholder="Search for users by name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
        />
      </div>

      {loadingUsers && filteredUsers.length === 0 && (
         <div className="space-y-4">
            {[1,2,3].map(i => (
                <Card key={`skel-${i}`} className="p-4">
                    <div className="flex items-center space-x-4">
                        <Skeleton className="h-12 w-12 rounded-full" />
                        <div className="space-y-2 flex-grow">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                         <div className="flex flex-col sm:flex-row gap-2">
                            <Skeleton className="h-9 w-28" />
                            <Skeleton className="h-9 w-32" />
                        </div>
                    </div>
                </Card>
            ))}
         </div>
      )}

      {!loadingUsers && filteredUsers.length === 0 && (
        <p className="text-muted-foreground text-center py-8">
            {searchTerm ? `No users found matching "${searchTerm}".` : "No other users found to connect with yet."}
        </p>
      )}

      <div className="space-y-4">
        {filteredUsers.map((u) => {
          if (u.uid === user?.uid) return null;
          const friendButtonState = getFriendButtonState(u.uid);
          const networkButtonState = getNetworkButtonState(u.uid);
          return (
            <Card key={u.uid} className="p-4 shadow-sm">
              <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={u.photoURL || undefined} alt={u.displayName || "User"} />
                  <AvatarFallback>{getInitials(u.displayName)}</AvatarFallback>
                </Avatar>
                <div className="flex-grow">
                  <p className="font-semibold text-lg">{u.displayName || "Anonymous User"}</p>
                  <p className="text-sm text-muted-foreground">{u.email || "No email"}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto pt-2 sm:pt-0 sm:border-t-0 border-t border-border">
                  <Button
                    onClick={() => friendButtonState.action ? friendButtonState.action() : handleSendFriendRequest(u)}
                    disabled={friendButtonState.disabled || requestStatus[u.uid] === 'sending'}
                    variant={friendButtonState.variant}
                    size="sm"
                    className="w-full sm:w-auto justify-center"
                  >
                    {friendButtonState.icon}
                    {friendButtonState.text}
                  </Button>
                  <Button
                    onClick={() => networkButtonState.action ? networkButtonState.action() : handleRequestToJoinNetwork(u)}
                    disabled={networkButtonState.disabled || networkRequestStatus[u.uid] === 'sending' || u.uid === currentUserProfile?.uid}
                    variant={networkButtonState.variant}
                    size="sm"
                    className="w-full sm:w-auto justify-center"
                  >
                    {networkButtonState.icon}
                    {networkButtonState.text}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
