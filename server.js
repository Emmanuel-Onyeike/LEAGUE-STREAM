const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*' }
});

app.use(express.static('public'));

// ==========================
// CONFIG
// ==========================
const ADMIN_PIN = "1234";

// rooms[roomId] = {
//   hostId,
//   users: {}
// }
const rooms = {};

io.on('connection', (socket) => {
  console.log('🟢 Connected:', socket.id);

  // ==========================
  // ADMIN / BROADCASTER
  // ==========================
  socket.on('create-room', ({ roomId, username, pin }) => {
    console.log(`🔐 PIN attempt from ${socket.id}:`, pin);

    // Validate PIN
    if (pin !== ADMIN_PIN) {
      console.log('❌ Invalid PIN');
      return socket.emit('pin-invalid');
    }

    // If room exists, check if host reconnecting
    if (rooms[roomId]) {
      console.log('⚠️ Room exists, reassigning host');

      rooms[roomId].hostId = socket.id;
      rooms[roomId].users[socket.id] = username;

      socket.join(roomId);
      socket.username = username;
      socket.roomId = roomId;

      socket.emit('pin-valid');
      io.to(roomId).emit('update-user-list', rooms[roomId].users);
      return;
    }

    // Create new room
    socket.join(roomId);
    socket.username = username;
    socket.roomId = roomId;

    rooms[roomId] = {
      hostId: socket.id,
      users: {
        [socket.id]: username
      }
    };

    console.log(`✅ Room created: ${roomId}`);

    socket.emit('pin-valid');
    io.to(roomId).emit('update-user-list', rooms[roomId].users);
  });

  // ==========================
  // VIEWER
  // ==========================
  socket.on('join-room', ({ roomId, username }) => {
    const room = rooms[roomId];

    if (!room) {
      console.log('❌ Viewer tried to join missing room');
      return socket.emit('error', 'Room not found');
    }

    socket.join(roomId);
    socket.username = username;
    socket.roomId = roomId;

    room.users[socket.id] = username;

    console.log(`👀 Viewer joined: ${username}`);

    io.to(room.hostId).emit('new-viewer', {
      viewerId: socket.id
    });

    io.to(roomId).emit('update-user-list', room.users);
  });

  // ==========================
  // WEBRTC SIGNALING
  // ==========================
  socket.on('host-offer', ({ offer, viewerId }) => {
    io.to(viewerId).emit('receive-offer', {
      offer,
      hostId: socket.id
    });
  });

  socket.on('viewer-answer', ({ answer, hostId }) => {
    io.to(hostId).emit('receive-answer', {
      answer,
      viewerId: socket.id
    });
  });

  socket.on('ice-candidate', ({ candidate, targetId }) => {
    io.to(targetId).emit('ice-candidate', {
      candidate,
      senderId: socket.id
    });
  });

  // ==========================
  // DISCONNECT
  // ==========================
  socket.on('disconnect', () => {
    console.log('🔴 Disconnected:', socket.id);

    const roomId = socket.roomId;
    const room = rooms[roomId];
    if (!room) return;

    delete room.users[socket.id];

    // If broadcaster disconnects
    if (socket.id === room.hostId) {
      console.log(`📴 Host left room ${roomId}`);
      io.to(roomId).emit('stream-ended');
      delete rooms[roomId];
    } else {
      io.to(roomId).emit('update-user-list', room.users);
    }
  });
});

server.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
