import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  get,
  onValue,
  push
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

// 🔥 YOUR FIREBASE CONFIG
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
    { urls: "stun:stun.l.google.com:19302" }
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
}

init();

const username = document.getElementById("username").value;
await set(ref(db, "rooms/" + roomId + "/participants/" + username), true);


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
      peerConnection.addIceCandidate(
        new RTCIceCandidate(child.val())
      );
    });
  });

  listenChat();
};

window.joinCall = async () => {
  roomId = document.getElementById("roomId").value;
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
      peerConnection.addIceCandidate(
        new RTCIceCandidate(child.val())
      );
    });
  });

  listenChat();
};

window.sendMessage = () => {
  const input = document.getElementById("chatInput");
  const message = input.value;
  if (!message) return;

  push(ref(db, "rooms/" + roomId + "/chat"), {
    message
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

window.generateRoom = () => {
  const randomId = Math.random().toString(36).substring(2, 8);
  document.getElementById("roomId").value = randomId;
};

window.copyLink = () => {
  const id = document.getElementById("roomId").value;
  const link = window.location.origin + "?room=" + id;
  navigator.clipboard.writeText(link);
  alert("Link Copied!");
};

window.toggleMute = () => {
  const track = localStream.getAudioTracks()[0];
  track.enabled = !track.enabled;
};

window.toggleCamera = () => {
  const track = localStream.getVideoTracks()[0];
  track.enabled = !track.enabled;
};

window.leaveCall = () => {
  if (peerConnection) peerConnection.close();
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  remoteVideo.srcObject = null;
  localVideo.srcObject = null;
  location.reload();
};
