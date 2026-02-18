import { io } from "socket.io-client";

export const initSocket = async () => {
  const options = {
    "force new connection": true,
    reconnectionAttempts: Infinity,
    timeout: 10000,
    transports: ["websocket"],
  };

  // In dev, React runs on :3000 but the Socket.IO server is on :7000.
  // In prod, the backend serves the app, so same-origin "/" works.
  const url =
    process.env.REACT_APP_SOCKET_URL ||
    (process.env.NODE_ENV === "development" ? "http://localhost:7000" : "/");

  return io(url, options);
};
//This file is responsible for connecting your website to the backend in real-time.
// Your frontend (React) = You

// Your backend (Node server) = Your friend

// initSocket() = Making a phone call

// socket.id = Your call ID

// this file is responsible to make live connection like phone call bw frontend and backend
