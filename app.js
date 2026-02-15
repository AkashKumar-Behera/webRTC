import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  push,
  remove,
  off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyBGnFw13ko0b4KAs7plpFmHlg0GohowElA",
  authDomain: "webrtc-cd5af.firebaseapp.com",
  databaseURL: "https://webrtc-cd5af-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "webrtc-cd5af",
  storageBucket: "webrtc-cd5af.firebasestorage.app",
  messagingSenderId: "373326963708",
  appId: "1:373326963708:web:3d67179d8a8d4698fe4879"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

let localStream;
let remoteStream;
let peerConnection;
let roomId;
let answerListener;
let offerListener;

const servers = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject"
    }
  ]
};

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

async function createPeerConnection() {
  peerConnection = new RTCPeerConnection(servers);

  peerConnection.ontrack = event => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
  };

  peerConnection.onconnectionstatechange = () => {
    const status = document.getElementById("statusIndicator");
    const loader = document.getElementById("loader");

    if (peerConnection.connectionState === "connected") {
      status.innerText = "Connected";
      status.style.background = "green";
      loader.style.display = "none";
    } else {
      status.innerText = "Connecting...";
      status.style.background = "red";
      loader.style.display = "block";
    }
  };
}

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true
  });

  remoteStream = new MediaStream();

  localVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  await createPeerConnection();

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });
}

init();

/* ================= CREATE CALL ================= */

window.createCall = async () => {
  roomId = document.getElementById("roomId").value;

  const roomRef = ref(db, "rooms/" + roomId);
  const offerCandidates = ref(db, "rooms/" + roomId + "/offerCandidates");
  const answerCandidates = ref(db, "rooms/" + roomId + "/answerCandidates");

  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      push(offerCandidates, event.candidate.toJSON());
    }
  };

  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  await set(roomRef, { offer });

  // LISTEN FOR ANSWER ONCE
  const answerRef = ref(db, "rooms/" + roomId + "/answer");

  answerListener = onValue(answerRef, async snapshot => {
    const answer = snapshot.val();
    if (!answer) return;

    if (peerConnection.signalingState !== "have-local-offer") return;

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );

    off(answerRef); // REMOVE LISTENER AFTER SET
  });

  // LISTEN FOR ICE
  onValue(answerCandidates, snapshot => {
    snapshot.forEach(child => {
      peerConnection.addIceCandidate(
        new RTCIceCandidate(child.val())
      );
    });
  });
};

/* ================= JOIN CALL ================= */

window.joinCall = async () => {
  roomId = document.getElementById("roomId").value;

  const roomRef = ref(db, "rooms/" + roomId);
  const roomSnapshot = await get(roomRef);
  const roomData = roomSnapshot.val();

  if (!roomData) {
    alert("Room does not exist");
    return;
  }

  const offerCandidates = ref(db, "rooms/" + roomId + "/offerCandidates");
  const answerCandidates = ref(db, "rooms/" + roomId + "/answerCandidates");

  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      push(answerCandidates, event.candidate.toJSON());
    }
  };

  // SET OFFER ONLY IF STABLE
  if (peerConnection.signalingState === "stable") {
    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(roomData.offer)
    );
  }

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  await set(ref(db, "rooms/" + roomId + "/answer"), answer);

  // LISTEN FOR ICE
  onValue(offerCandidates, snapshot => {
    snapshot.forEach(child => {
      peerConnection.addIceCandidate(
        new RTCIceCandidate(child.val())
      );
    });
  });
};

/* ================= CHAT ================= */

window.sendMessage = () => {
  const input = document.getElementById("chatInput");
  if (!input.value) return;

  push(ref(db, "rooms/" + roomId + "/chat"), {
    message: input.value
  });

  input.value = "";
};

onValue(ref(db, "rooms"), snapshot => {
  if (!roomId) return;
  const chatRef = ref(db, "rooms/" + roomId + "/chat");
  onValue(chatRef, snap => {
    const chatBox = document.getElementById("chatBox");
    chatBox.innerHTML = "";
    snap.forEach(child => {
      chatBox.innerHTML += "<div>" + child.val().message + "</div>";
    });
  });
});

/* ================= CONTROLS ================= */

window.toggleMute = () => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
};

window.toggleCamera = () => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
};

window.leaveCall = async () => {
  if (peerConnection) peerConnection.close();
  if (localStream) localStream.getTracks().forEach(track => track.stop());

  if (roomId) {
    await remove(ref(db, "rooms/" + roomId + "/offer"));
    await remove(ref(db, "rooms/" + roomId + "/answer"));
  }

  location.reload();
};

window.toggleTheme = () => {
  document.body.classList.toggle("light");
};

window.copyLink = () => {
  const link = window.location.origin + "?room=" + roomId;
  navigator.clipboard.writeText(link);
  alert("Link Copied!");
};
