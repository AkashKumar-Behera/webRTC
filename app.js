import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  push,
  remove
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

async function init() {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();

  localVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  peerConnection = new RTCPeerConnection(servers);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

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

init();

const urlParams = new URLSearchParams(window.location.search);
const autoRoom = urlParams.get("room");
if (autoRoom) {
  document.getElementById("roomId").value = autoRoom;
}

window.generateRoom = () => {
  document.getElementById("roomId").value =
    Math.random().toString(36).substring(2, 8);
};

window.createCall = async () => {
  roomId = document.getElementById("roomId").value;
  const username = document.getElementById("username").value;

  await set(ref(db, "rooms/" + roomId + "/participants/" + username), true);

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

  onValue(roomRef, async snapshot => {
    const data = snapshot.val();
    if (data?.answer && !peerConnection.currentRemoteDescription) {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
    }
  });

  onValue(answerCandidates, snapshot => {
    snapshot.forEach(child => {
      peerConnection.addIceCandidate(new RTCIceCandidate(child.val()));
    });
  });

  listenChat();
};

window.joinCall = async () => {
  roomId = document.getElementById("roomId").value;
  const username = document.getElementById("username").value;

  await set(ref(db, "rooms/" + roomId + "/participants/" + username), true);

  const roomRef = ref(db, "rooms/" + roomId);
  const roomSnapshot = await get(roomRef);
  const roomData = roomSnapshot.val();

  const offerCandidates = ref(db, "rooms/" + roomId + "/offerCandidates");
  const answerCandidates = ref(db, "rooms/" + roomId + "/answerCandidates");

  peerConnection.onicecandidate = event => {
    if (event.candidate) {
      push(answerCandidates, event.candidate.toJSON());
    }
  };

  await peerConnection.setRemoteDescription(
    new RTCSessionDescription(roomData.offer)
  );

  const answer = await peerConnection.createAnswer();
  await peerConnection.setLocalDescription(answer);

  await set(ref(db, "rooms/" + roomId + "/answer"), answer);

  onValue(offerCandidates, snapshot => {
    snapshot.forEach(child => {
      peerConnection.addIceCandidate(new RTCIceCandidate(child.val()));
    });
  });

  listenChat();
};

window.sendMessage = () => {
  const input = document.getElementById("chatInput");
  if (!input.value) return;

  push(ref(db, "rooms/" + roomId + "/chat"), {
    message: input.value
  });

  input.value = "";
};

function listenChat() {
  const chatRef = ref(db, "rooms/" + roomId + "/chat");
  onValue(chatRef, snapshot => {
    const chatBox = document.getElementById("chatBox");
    chatBox.innerHTML = "";
    snapshot.forEach(child => {
      chatBox.innerHTML += "<div>" + child.val().message + "</div>";
    });
  });
}

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
  await remove(ref(db, "rooms/" + roomId));
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
