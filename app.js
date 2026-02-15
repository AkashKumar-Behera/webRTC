import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getDatabase,
    ref,
    set,
    get,
    onChildAdded,
    onValue,
    push,
    remove,
    off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

/* ================= FIREBASE ================= */

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

/* ================= GLOBALS ================= */

let localStream;
let remoteStream;
let pc;
let roomId;
let isCaller = false;

/* ================= TURN + STUN ================= */

const servers = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: [
        "turn:82.25.104.130:3478?transport=udp",
        "turn:82.25.104.130:3478?transport=tcp"
      ],
      username: "akash",
      credential: "123456"
    }
  ]
};


/* ================= DOM ================= */

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

/* ================= INIT ================= */

async function initMedia() {
    localStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
    });

    remoteStream = new MediaStream();

    localVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;
}

function createPeerConnection() {
    pc = new RTCPeerConnection(servers);

    localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
    });

    pc.ontrack = e => {
        e.streams[0].getTracks().forEach(track => {
            remoteStream.addTrack(track);
        });
    };

    pc.onconnectionstatechange = () => {
        console.log("Connection:", pc.connectionState);
    };
}

/* ================= CREATE ================= */

window.createCall = async () => {
    roomId = document.getElementById("roomId").value;
    if (!roomId) return alert("Enter Room ID");

    isCaller = true;

    createPeerConnection();

    const roomRef = ref(db, "rooms/" + roomId);
    const offerCandidates = ref(db, "rooms/" + roomId + "/offerCandidates");
    const answerCandidates = ref(db, "rooms/" + roomId + "/answerCandidates");

    pc.onicecandidate = e => {
        if (e.candidate) {
            push(offerCandidates, e.candidate.toJSON());
        }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await set(roomRef, { offer });

    /* WAIT FOR ANSWER */
    onValue(ref(db, "rooms/" + roomId + "/answer"), async snapshot => {
        const data = snapshot.val();
        if (!data) return;

        if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(data));
        }
    });

    /* ICE */
    onChildAdded(answerCandidates, snapshot => {
        const candidate = snapshot.val();
        if (candidate) {
            pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });
};

/* ================= JOIN ================= */

window.joinCall = async () => {
    roomId = document.getElementById("roomId").value;
    if (!roomId) return alert("Enter Room ID");

    isCaller = false;

    const roomRef = ref(db, "rooms/" + roomId);
    const roomSnapshot = await get(roomRef);

    if (!roomSnapshot.exists()) {
        return alert("Room not found");
    }

    createPeerConnection();

    const offerCandidates = ref(db, "rooms/" + roomId + "/offerCandidates");
    const answerCandidates = ref(db, "rooms/" + roomId + "/answerCandidates");

    pc.onicecandidate = e => {
        if (e.candidate) {
            push(answerCandidates, e.candidate.toJSON());
        }
    };

    const offer = roomSnapshot.val().offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await set(ref(db, "rooms/" + roomId + "/answer"), answer);

    onChildAdded(offerCandidates, snapshot => {
        const candidate = snapshot.val();
        if (candidate) {
            pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
    });
};

/* ================= CHAT ================= */

window.sendMessage = async () => {
    const input = document.getElementById("chatInput");
    if (!input.value || !roomId) return;

    await push(ref(db, "rooms/" + roomId + "/chat"), {
        message: input.value
    });

    input.value = "";
};

function listenChat() {
    onChildAdded(ref(db, "rooms/" + roomId + "/chat"), snapshot => {
        const chatBox = document.getElementById("chatBox");
        const msg = snapshot.val().message;
        chatBox.innerHTML += `<div>${msg}</div>`;
    });
}

/* ================= CONTROLS ================= */

window.leaveCall = async () => {
    if (pc) pc.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());

    if (roomId && isCaller) {
        await remove(ref(db, "rooms/" + roomId));
    }

    location.reload();
};

window.toggleMute = () => {
    const track = localStream.getAudioTracks()[0];
    track.enabled = !track.enabled;
};

window.toggleCamera = () => {
    const track = localStream.getVideoTracks()[0];
    track.enabled = !track.enabled;
};

/* ================= START ================= */

initMedia();
