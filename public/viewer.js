const socket = io();

const roomId = "school-league";
const username = "Viewer-" + Math.floor(Math.random() * 10000);

// DOM
const video = document.getElementById("video");
const statusText = document.getElementById("status");

let peer = null;

// =======================
// JOIN ROOM
// =======================
socket.emit("join-room", {
  roomId,
  username
});

// =======================
// RECEIVE STREAM
// =======================
socket.on("receive-offer", async ({ offer, hostId }) => {
  statusText.textContent = "Connecting to live stream...";

  peer = new RTCPeerConnection();

  peer.ontrack = event => {
    video.srcObject = event.streams[0];
    statusText.textContent = "🔴 Live";
  };

  peer.onicecandidate = event => {
    if (event.candidate) {
      socket.emit("ice-candidate", {
        targetId: hostId,
        candidate: event.candidate
      });
    }
  };

  await peer.setRemoteDescription(offer);
  const answer = await peer.createAnswer();
  await peer.setLocalDescription(answer);

  socket.emit("viewer-answer", {
    hostId,
    answer
  });
});

socket.on("ice-candidate", ({ candidate }) => {
  if (peer) {
    peer.addIceCandidate(candidate);
  }
});

// =======================
// STREAM ENDED
// =======================
socket.on("stream-ended", () => {
  statusText.textContent = "Stream ended";
  if (peer) {
    peer.close();
    peer = null;
  }
  video.srcObject = null;
});
