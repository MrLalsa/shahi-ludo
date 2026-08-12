/**
 * Shahi Ludo — networking. Thin wrapper around PeerJS for a direct
 * browser-to-browser (WebRTC) data channel. PeerJS's free public broker
 * (0.peerjs.com) is only used for the initial handshake / signalling;
 * once connected, game data flows directly between the two browsers.
 *
 * The HOST is the single source of truth for game state (it runs
 * game-engine.js). The GUEST only ever sends "intents" and renders
 * whatever full state the host broadcasts back. This avoids any need
 * to keep two independently-computed game states in sync.
 */

const ROOM_ID_PREFIX = 'shahi-ludo-';

function randomRoomSuffix() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/l/i ambiguity
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

class LudoNetwork {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.roomId = null;
    this.onOpen = null;        // (roomId) => void          [host: room ready]
    this.onPeerConnected = null; // () => void               [both: data channel open]
    this.onMessage = null;     // (msg) => void              [both]
    this.onDisconnected = null; // (reason) => void          [both]
    this.onError = null;       // (err) => void
  }

  /** Host: create a room and wait for a guest to connect. */
  hostGame(attempt = 0) {
    this.isHost = true;
    const id = ROOM_ID_PREFIX + randomRoomSuffix();
    const peer = new Peer(id, { debug: 0 });
    this.peer = peer;

    peer.on('open', (assignedId) => {
      this.roomId = assignedId;
      if (this.onOpen) this.onOpen(assignedId);
    });

    peer.on('connection', (conn) => {
      if (this.conn) { conn.close(); return; } // only one guest allowed
      this._bindConnection(conn);
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id' && attempt < 5) {
        peer.destroy();
        this.hostGame(attempt + 1);
        return;
      }
      if (this.onError) this.onError(err);
    });
  }

  /** Guest: join an existing room by its code (short or full — the prefix is optional to type/paste). */
  joinGame(roomId) {
    this.isHost = false;
    const peer = new Peer(null, { debug: 0 });
    this.peer = peer;
    let clean = roomId.trim().toLowerCase();
    if (!clean.startsWith(ROOM_ID_PREFIX)) clean = ROOM_ID_PREFIX + clean;

    peer.on('open', () => {
      const conn = peer.connect(clean, { reliable: true });
      this._bindConnection(conn);
    });

    peer.on('error', (err) => {
      if (this.onError) this.onError(err);
    });
  }

  _bindConnection(conn) {
    this.conn = conn;
    conn.on('open', () => {
      if (this.onPeerConnected) this.onPeerConnected();
    });
    conn.on('data', (data) => {
      if (this.onMessage) this.onMessage(data);
    });
    conn.on('close', () => {
      if (this.onDisconnected) this.onDisconnected('closed');
    });
    conn.on('error', (err) => {
      if (this.onError) this.onError(err);
    });
  }

  send(msg) {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    }
  }

  destroy() {
    if (this.conn) { try { this.conn.close(); } catch (e) {} }
    if (this.peer) { try { this.peer.destroy(); } catch (e) {} }
    this.conn = null;
    this.peer = null;
  }
}

function shareLink(roomId) {
  const url = new URL(window.location.href);
  url.hash = '';
  url.search = '';
  url.searchParams.set('room', roomId);
  return url.toString();
}

const NETWORK_EXPORTS = { LudoNetwork, shareLink, ROOM_ID_PREFIX };
if (typeof window !== 'undefined') Object.assign(window, NETWORK_EXPORTS);
if (typeof module !== 'undefined') module.exports = NETWORK_EXPORTS;
