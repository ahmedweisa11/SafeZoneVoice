const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

app.use(express.static("public"));

const OWNER_PASSWORD = "DeathNote";
const ADMIN_PASSWORD = "RMITK";

const users = {};

function roomUsers() {
  return Object.entries(users).map(([id, user]) => ({
    id,
    nickname: user.nickname,
    muted: user.muted,
    role: user.role
  }));
}

io.on("connection", (socket) => {

  socket.on("join-room", ({ nickname, password }) => {

    let role = "user";

    if (password === OWNER_PASSWORD) {
      role = "owner";
    }
    else if (password === ADMIN_PASSWORD) {
      role = "admin";
    }

    users[socket.id] = {
      nickname,
      role,
      muted: role === "user"
    };

    socket.emit("room-data", {
      role,
      users: roomUsers()
    });
    socket.broadcast.emit("user-joined", socket.id);
    io.emit("users-update", roomUsers());

  });

  // WEBRTC SIGNALING

  socket.on("offer", data => {
    io.to(data.to).emit("offer", {
      offer: data.offer,
      from: socket.id
    });
  });

  socket.on("answer", data => {
    io.to(data.to).emit("answer", {
      answer: data.answer,
      from: socket.id
    });
  });

  socket.on("ice-candidate", data => {
    io.to(data.to).emit("ice-candidate", {
      candidate: data.candidate,
      from: socket.id
    });
  });

  // MUTE

  socket.on("toggle-mute", ({ targetId }) => {

    const me = users[socket.id];
    const target = users[targetId];

    if (!me || !target) return;

    if (me.role === "owner") {

      target.muted = !target.muted;

      io.emit("mute-update", {
        targetId,
        muted: target.muted
      });

      io.emit("users-update", roomUsers());
    }

    else if (
      me.role === "admin" &&
      target.role === "user"
    ) {

      target.muted = !target.muted;

      io.emit("mute-update", {
        targetId,
        muted: target.muted
      });

      io.emit("users-update", roomUsers());
    }

  });

  // KICK

  socket.on("kick-user", ({ targetId }) => {

    const me = users[socket.id];
    const target = users[targetId];

    if (!me || !target) return;

    if (me.role === "owner") {

      io.to(targetId).emit("kicked");

      io.sockets.sockets.get(targetId)?.disconnect();

      return;
    }

    if (
      me.role === "admin" &&
      target.role === "user"
    ) {

      io.to(targetId).emit("kicked");

      io.sockets.sockets.get(targetId)?.disconnect();
    }

  });

  socket.on("disconnect", () => {

    io.emit("user-left", socket.id);

    delete users[socket.id];

    io.emit("users-update", roomUsers());

  });

  }); // <-- دي كانت ناقصة

  const PORT = process.env.PORT || 3000;

  server.listen(PORT, () => {
    console.log("Server running on", PORT);
  });
