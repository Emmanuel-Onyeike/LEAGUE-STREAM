const socket = io();

const roomId = "school-league";
const username = "Admin";

// DOM
const pinModal = document.getElementById("pinModal");
const pinInput = document.getElementById("pinInput");
const pinSubmit = document.getElementById("pinSubmit");
const pinError = document.getElementById("pinError");

const video = document.getElementById("video");
const startBtn = document.getElementById("start-btn");
const stopBtn = document.getElementById("stop-btn");
const statusText = document.getElementById("status");

let localStream = null;
const peers = {};

// =======================
// PIN SUBMIT
// =======================
pinSubmit.addEventListener("click", () => {
  const pin = pinInput.value.trim();

  if (pin.length !== 4) {
    pinError.textContent = "PIN must be 4 digits";
    pinError.classList.remove("hidden");
    return;
  }

  socket.emit("create-room", {
    roomId,
    username,
    pin
  });
});

socket.on("pin-valid", () => {
  pinModal.style.display = "none";
  startBtn.disabled = false;
  statusText.textContent = "PIN verified. Ready to stream.";
});

socket.on("pin-invalid", () => {
  pinError.textContent = "Invalid PIN";
  pinError.classList.remove("hidden");
});

// =======================
// START STREAM
// =======================
startBtn.addEventListener("click", async () => {
  startBtn.disabled = true;
  stopBtn.disabled = false;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    video.srcObject = localStream;
    statusText.textContent = "🔴 Live streaming started";
  } catch (err) {
    statusText.textContent = "Camera access denied";
    startBtn.disabled = false;
  }
});

// =======================
// STOP STREAM
// =======================
stopBtn.addEventListener("click", () => {
  stopBtn.disabled = true;
  startBtn.disabled = false;

  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }

  // Close all peer connections
  Object.values(peers).forEach(peer => peer.close());
  Object.keys(peers).forEach(id => delete peers[id]);

  video.srcObject = null;
  statusText.textContent = "Streaming stopped";
});

// =======================
// WEBRTC: VIEWERS
// =======================
socket.on("new-viewer", async ({ viewerId }) => {
  if (!localStream) return;

  const peer = new RTCPeerConnection();

  localStream.getTracks().forEach(track => {
    peer.addTrack(track, localStream);
  });

  peer.onicecandidate = event => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        targetId: viewerId,
        candidate: event.candidate
      });
    }
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  socket.emit("host-offer", {
    viewerId,
    offer
  });

  peers[viewerId] = peer;
});

socket.on("receive-answer", ({ viewerId, answer }) => {
  if (peers[viewerId]) {
    peers[viewerId].setRemoteDescription(answer);
  }
});

socket.on("ice-candidate", ({ senderId, candidate }) => {
  if (peers[senderId]) {
    peers[senderId].addIceCandidate(candidate);
  }
});
