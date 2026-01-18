const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

// ==========================
// SOCKET.IO
// ==========================
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// ==========================
// ROOT ROUTE (FIXES NOT FOUND)
// ==========================
app.get("/", (req, res) => {
  res.send("✅ School League Socket Server is running");
});

// ==========================
// CONFIG
// ==========================
const ADMIN_PIN = "1234";

// rooms[roomId] = { hostId, users }
const rooms = {};

// ==========================
// CONNECTION
// ==========================
io.on("connection", (socket) => {
  console.log("🟢 Connected:", socket.id);

  // ==========================
  // ADMIN / BROADCASTER
  // ==========================
  socket.on("create-room", ({ roomId, username, pin }) => {
    console.log("🔐 PIN attempt:", pin);

    if (pin !== ADMIN_PIN) {
      console.log("❌ Invalid PIN");
      return socket.emit("pin-invalid");
    }

    // Reconnect host
    if (rooms[roomId]) {
      rooms[roomId].hostId = socket.id;
      rooms[roomId].users[socket.id] = username;

      socket.join(roomId);
      socket.roomId = roomId;
      socket.username = username;

      socket.emit("pin-valid");
      io.to(roomId).emit("update-user-list", rooms[roomId].users);
      return;
    }

    // Create room
    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    rooms[roomId] = {
      hostId: socket.id,
      users: { [socket.id]: username }
    };

    console.log("✅ Room created:", roomId);

    socket.emit("pin-valid");
    io.to(roomId).emit("update-user-list", rooms[roomId].users);
  });

  // ==========================
  // VIEWER
  // ==========================
  socket.on("join-room", ({ roomId, username }) => {
    const room = rooms[roomId];
    if (!room) {
      return socket.emit("error", "Room not found");
    }

    socket.join(roomId);
    socket.roomId = roomId;
    socket.username = username;

    room.users[socket.id] = username;

    io.to(room.hostId).emit("new-viewer", {
      viewerId: socket.id
    });

    io.to(roomId).emit("update-user-list", room.users);
  });

  // ==========================
  // WEBRTC SIGNALING
  // ==========================
  socket.on("host-offer", ({ offer, viewerId }) => {
    io.to(viewerId).emit("receive-offer", {
      offer,
      hostId: socket.id
    });
  });

  socket.on("viewer-answer", ({ answer, hostId }) => {
    io.to(hostId).emit("receive-answer", {
      answer,
      viewerId: socket.id
    });
  });

  socket.on("ice-candidate", ({ candidate, targetId }) => {
    io.to(targetId).emit("ice-candidate", {
      candidate,
      senderId: socket.id
    });
  });

  // ==========================
  // DISCONNECT
  // ==========================
  socket.on("disconnect", () => {
    console.log("🔴 Disconnected:", socket.id);

    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;

    delete room.users[socket.id];

    if (socket.id === room.hostId) {
      io.to(roomId).emit("stream-ended");
      delete rooms[roomId];
      console.log("📴 Room closed:", roomId);
    } else {
      io.to(roomId).emit("update-user-list", room.users);
    }
  });
});

// ==========================
// START SERVER (RENDER SAFE)
// ==========================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});
