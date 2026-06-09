const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const ADMIN_PASSWORD = "1234";

const users = {};
const rooms = {};

io.on("connection", (socket) => {

  socket.on("join-room", ({ roomId, nickname, password }) => {

    socket.join(roomId);

    const isAdmin = password === ADMIN_PASSWORD;

    users[socket.id] = {
      nickname,
      roomId,
      muted: false,
      isAdmin
    };

    if (!rooms[roomId]) {
      rooms[roomId] = {
        admin: isAdmin ? socket.id : null
      };
    }

    if (isAdmin && !rooms[roomId].admin) {
      rooms[roomId].admin = socket.id;
    }

    socket.emit("room-data", {
      admin: rooms[roomId].admin,
      users: getUsers(roomId)
    });

    io.to(roomId).emit("users-update", getUsers(roomId));
    socket.to(roomId).emit("user-joined", socket.id);
  });

  function getUsers(roomId) {
    return Object.keys(users)
      .filter(id => users[id]?.roomId === roomId)
      .map(id => ({
        id,
        nickname: users[id].nickname,
        muted: users[id].muted,
        isAdmin: users[id].isAdmin
      }));
  }

  // WEBRTC
  socket.on("offer", d =>
    io.to(d.to).emit("offer", { offer: d.offer, from: socket.id })
  );

  socket.on("answer", d =>
    io.to(d.to).emit("answer", { answer: d.answer, from: socket.id })
  );

  socket.on("ice-candidate", d =>
    io.to(d.to).emit("ice-candidate", { candidate: d.candidate, from: socket.id })
  );

  // 🚫 KICK
  socket.on("kick-user", ({ targetId }) => {
    const roomId = users[socket.id]?.roomId;

    if (rooms[roomId]?.admin === socket.id) {
      io.to(targetId).emit("kicked");
      io.sockets.sockets.get(targetId)?.disconnect();
    }
  });

  // 🔇 MUTE (FIXED)
  socket.on("toggle-mute", ({ targetId }) => {
    const roomId = users[socket.id]?.roomId;

    if (rooms[roomId]?.admin === socket.id) {

      users[targetId].muted = !users[targetId].muted;

      io.to(roomId).emit("mute-update", {
        targetId,
        muted: users[targetId].muted
      });

      io.to(roomId).emit("users-update", getUsers(roomId));
    }
  });

  socket.on("disconnect", () => {
    const user = users[socket.id];

    if (user) {
      const roomId = user.roomId;

      delete users[socket.id];

      if (rooms[roomId]?.admin === socket.id) {
        const next = Object.keys(users)
          .find(id => users[id]?.roomId === roomId);

        rooms[roomId].admin = next || null;
      }

      io.to(roomId).emit("users-update", getUsers(roomId));
    }
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});