
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

// Helper function to validate authentication context
function ensureAuthenticated(context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "The function must be called while authenticated."
    );
  }
  return context.auth.uid;
}

// --- Friend Management Functions ---

export const acceptFriendRequest = functions.https.onCall(async (data, context) => {
  const callerUid = ensureAuthenticated(context);
  const { requestId } = data;

  if (!requestId || typeof requestId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a valid 'requestId'."
    );
  }

  const requestRef = db.collection("friendRequests").doc(requestId);
  const callerProfileRef = db.collection("userProfiles").doc(callerUid);

  try {
    return await db.runTransaction(async (transaction) => {
      const requestDoc = await transaction.get(requestRef);
      if (!requestDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Friend request not found.");
      }
      const requestData = requestDoc.data();
      if (!requestData) {
        throw new functions.https.HttpsError("internal", "Friend request data is missing.");
      }

      if (requestData.receiverId !== callerUid) {
        throw new functions.https.HttpsError(
          "permission-denied",
          "You are not authorized to accept this friend request."
        );
      }
      if (requestData.status !== "pending") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Friend request is not pending."
        );
      }

      const senderProfileRef = db.collection("userProfiles").doc(requestData.senderId);

      transaction.update(requestRef, { status: "accepted", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      transaction.update(callerProfileRef, { friends: admin.firestore.FieldValue.arrayUnion(requestData.senderId) });
      transaction.update(senderProfileRef, { friends: admin.firestore.FieldValue.arrayUnion(callerUid) });
      
      return { success: true, message: "Friend request accepted." };
    });
  } catch (error: any) {
    console.error("Error accepting friend request:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError("internal", error.message || "Failed to accept friend request.");
  }
});

export const declineFriendRequest = functions.https.onCall(async (data, context) => {
    const callerUid = ensureAuthenticated(context);
    const { requestId } = data;

    if (!requestId || typeof requestId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Missing 'requestId'.");
    }
    const requestRef = db.collection("friendRequests").doc(requestId);
    try {
        const requestDoc = await requestRef.get();
        if (!requestDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Request not found.");
        }
        const requestData = requestDoc.data();
        if (requestData?.receiverId !== callerUid) {
            throw new functions.https.HttpsError("permission-denied", "Not authorized.");
        }
        await requestRef.update({ status: "declined", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { success: true, message: "Friend request declined." };
    } catch (error: any) {
        console.error("Error declining friend request:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError("internal", error.message || "Failed to decline request.");
    }
});

export const unfriendUser = functions.https.onCall(async (data, context) => {
  const callerUid = ensureAuthenticated(context);
  const { friendId } = data;

  if (!friendId || typeof friendId !== "string") {
    throw new functions.https.HttpsError(
      "invalid-argument",
      "The function must be called with a valid 'friendId'."
    );
  }

  const callerProfileRef = db.collection("userProfiles").doc(callerUid);
  const friendProfileRef = db.collection("userProfiles").doc(friendId);

  try {
    const batch = db.batch();
    batch.update(callerProfileRef, { friends: admin.firestore.FieldValue.arrayRemove(friendId) });
    batch.update(friendProfileRef, { friends: admin.firestore.FieldValue.arrayRemove(callerUid) });
    await batch.commit();
    return { success: true, message: "User unfriended." };
  } catch (error: any) {
    console.error("Error unfriending user:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError("internal", error.message || "Failed to unfriend user.");
  }
});


// --- Network Management Functions ---

export const acceptNetworkJoinRequest = functions.https.onCall(async (data, context) => {
  const callerUid = ensureAuthenticated(context); // This is the network owner
  const { requestId } = data;

  if (!requestId || typeof requestId !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Missing 'requestId'.");
  }

  const requestRef = db.collection("networkJoinRequests").doc(requestId);
  const networkOwnerProfileRef = db.collection("userProfiles").doc(callerUid);

  try {
    return await db.runTransaction(async (transaction) => {
      const requestDoc = await transaction.get(requestRef);
      if (!requestDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Network join request not found.");
      }
      const requestData = requestDoc.data();
      if (!requestData) {
        throw new functions.https.HttpsError("internal", "Request data is missing.");
      }

      if (requestData.networkOwnerId !== callerUid) {
        throw new functions.https.HttpsError("permission-denied", "Not authorized to accept this request.");
      }
      if (requestData.status !== "pending") {
        throw new functions.https.HttpsError("failed-precondition", "Request is not pending.");
      }

      const senderProfileRef = db.collection("userProfiles").doc(requestData.senderId);
      
      // Check if sender profile exists
      const senderDoc = await transaction.get(senderProfileRef);
      if (!senderDoc.exists) {
          throw new functions.https.HttpsError("not-found", `Sender profile (ID: ${requestData.senderId}) not found.`);
      }

      transaction.update(requestRef, { status: "accepted", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      transaction.update(networkOwnerProfileRef, { myNetworkMembers: admin.firestore.FieldValue.arrayUnion(requestData.senderId) });
      transaction.update(senderProfileRef, { memberOfNetworks: admin.firestore.FieldValue.arrayUnion(callerUid) });
      
      return { success: true, message: "Network join request accepted." };
    });
  } catch (error: any) {
    console.error("Error accepting network join request:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError("internal", error.message || "Failed to accept network join request.");
  }
});

export const declineNetworkJoinRequest = functions.https.onCall(async (data, context) => {
    const callerUid = ensureAuthenticated(context); // Network owner
    const { requestId } = data;

    if (!requestId || typeof requestId !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Missing 'requestId'.");
    }
    const requestRef = db.collection("networkJoinRequests").doc(requestId);
    try {
        const requestDoc = await requestRef.get();
        if (!requestDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Request not found.");
        }
        const requestData = requestDoc.data();
        if (requestData?.networkOwnerId !== callerUid) {
            throw new functions.https.HttpsError("permission-denied", "Not authorized.");
        }
        await requestRef.update({ status: "declined", updatedAt: admin.firestore.FieldValue.serverTimestamp() });
        return { success: true, message: "Network join request declined." };
    } catch (error: any) {
        console.error("Error declining network join request:", error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError("internal", error.message || "Failed to decline request.");
    }
});


export const removeNetworkMember = functions.https.onCall(async (data, context) => {
  const callerUid = ensureAuthenticated(context); // This is the network owner
  const { memberId } = data;

  if (!memberId || typeof memberId !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Missing 'memberId'.");
  }

  const networkOwnerProfileRef = db.collection("userProfiles").doc(callerUid);
  const memberProfileRef = db.collection("userProfiles").doc(memberId);

  try {
    const batch = db.batch();
    batch.update(networkOwnerProfileRef, { myNetworkMembers: admin.firestore.FieldValue.arrayRemove(memberId) });
    // Also remove the network owner's ID from the removed member's 'memberOfNetworks' list
    batch.update(memberProfileRef, { memberOfNetworks: admin.firestore.FieldValue.arrayRemove(callerUid) });
    await batch.commit();
    return { success: true, message: "Network member removed." };
  } catch (error: any) {
    console.error("Error removing network member:", error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError("internal", error.message || "Failed to remove network member.");
  }
});
