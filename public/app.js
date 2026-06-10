const socket = io();

let localStream;
let peerConnections = {};
let myId;
let myRole = "user";

const config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
};

socket.on("connect", () => {
  myId = socket.id;
});

async function joinRoom() {

  const nickname =
    document.getElementById("nickname").value.trim();

  const password =
    document.getElementById("password").value.trim();

  if (!nickname) {
    alert("Enter nickname");
    return;
  }

  try {

    localStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true
      });

    socket.emit("join-room", {
      nickname,
      password
    });

    document.getElementById("status").innerText =
      "Joined as " + nickname;

  } catch (err) {

    alert("Microphone access denied");

  }

}

// ROOM DATA

socket.on("room-data", (data) => {

  myRole = data.role;

  if (
    myRole === "owner" ||
    myRole === "admin"
  ) {

    document.getElementById("adminPanel").style.display =
      "block";

  } else {

    document.getElementById("adminPanel").style.display =
      "none";

  }

  renderUsers(data.users);

});

// USERS UPDATE

socket.on("users-update", (users) => {
  renderUsers(users);
});

// USER LIST

function renderUsers(users) {

  const list =
    document.getElementById("usersList");

  list.innerHTML = "";

  users.forEach(user => {

    const div =
      document.createElement("div");

    let badge = "👤 USER";

    if (user.role === "owner") {
      badge = "👑 OWNER";
    }

    if (user.role === "admin") {
      badge = "🛡️ ADMIN";
    }

    let buttons = "";

    if (
      myRole === "owner" ||
      myRole === "admin"
    ) {

      buttons = `
        <button class="btn" onclick="muteUser('${user.id}')">
          ${user.muted ? "Unmute" : "Mute"}
        </button>

        <button onclick="kickUser('${user.id}')">
          Kick
        </button>
      `;
    }

    div.innerHTML = `
      <b>${user.nickname}</b>
      <span>${badge}</span>
      <span>${user.muted ? "🔇" : "🔊"}</span>
      ${buttons}
    `;

    list.appendChild(div);

  });

}

// MUTE

function muteUser(id) {

  socket.emit("toggle-mute", {
    targetId: id
  });

}

// KICK

function kickUser(id) {

  socket.emit("kick-user", {
    targetId: id
  });

}

// KICKED

socket.on("kicked", () => {

  alert("You were kicked");

  location.reload();

});

// FORCED MUTE

socket.on("mute-update", ({ targetId, muted }) => {

  if (
    targetId === myId &&
    localStream
  ) {

    localStream
      .getAudioTracks()
      .forEach(track => {

        track.enabled = !muted;

      });

  }

});

// NEW USER

socket.on("user-joined", id => {

  createPeer(id, true);

});

// WEBRTC

function createPeer(id, initiator) {

  const pc =
    new RTCPeerConnection(config);

  peerConnections[id] = pc;

  if (localStream) {

    localStream
      .getTracks()
      .forEach(track => {

        pc.addTrack(track, localStream);

      });

  }

  pc.ontrack = event => {

    document.getElementById(
      "remoteAudio"
    ).srcObject = event.streams[0];

  };

  pc.onicecandidate = event => {

    if (event.candidate) {

      socket.emit("ice-candidate", {
        candidate: event.candidate,
        to: id
      });

    }

  };

  if (initiator) {

    pc.createOffer()
      .then(offer => {

        return pc
          .setLocalDescription(offer)
          .then(() => offer);

      })
      .then(offer => {

        socket.emit("offer", {
          offer,
          to: id
        });

      });

  }

  return pc;

}

// OFFER

socket.on("offer", async ({ offer, from }) => {

  const pc =
    createPeer(from, false);

  await pc.setRemoteDescription(
    new RTCSessionDescription(offer)
  );

  const answer =
    await pc.createAnswer();

  await pc.setLocalDescription(
    answer
  );

  socket.emit("answer", {
    answer,
    to: from
  });

});

// ANSWER

socket.on("answer", async ({ answer, from }) => {

  const pc =
    peerConnections[from];

  if (!pc) return;

  await pc.setRemoteDescription(
    new RTCSessionDescription(answer)
  );

});

// ICE

socket.on(
  "ice-candidate",
  async ({ candidate, from }) => {

    const pc =
      peerConnections[from];

    if (!pc) return;

    await pc.addIceCandidate(
      new RTCIceCandidate(candidate)
    );

  }
);

socket.on("disconnect", () => {

  Object.values(peerConnections).forEach(pc => {
    pc.close();
  });

  peerConnections = {};

});

socket.on("user-left", (id) => {

  if (peerConnections[id]) {

    peerConnections[id].close();

    delete peerConnections[id];

  }

});
