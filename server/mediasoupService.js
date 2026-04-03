const mediasoup = require('mediasoup');

const mediaCodecs = [
    {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2
    },
    {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
            'x-google-start-bitrate': 1000
        }
    }
];

let workerPromise = null;
let routerPromise = null;

const peers = new Map();
const rooms = new Map();

function getRoom(callId) {
    if (!rooms.has(callId)) {
        rooms.set(callId, {
            peers: new Set(),
            producerOwners: new Map()
        });
    }

    return rooms.get(callId);
}

function getPeer(socket) {
    if (!peers.has(socket.id)) {
        peers.set(socket.id, {
            socketId: socket.id,
            userId: socket.userId,
            username: socket.username || 'User',
            callId: null,
            transports: new Map(),
            producers: new Map(),
            consumers: new Map()
        });
    }

    return peers.get(socket.id);
}

function closeEntries(collection) {
    collection.forEach((entry) => {
        try {
            entry.close();
        } catch (error) {
            console.warn('Failed to close mediasoup entry:', error.message);
        }
    });
    collection.clear();
}

function serializeTransport(transport) {
    return {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
    };
}

async function getWorker() {
    if (!workerPromise) {
        workerPromise = mediasoup.createWorker({
            logLevel: 'warn',
            rtcMinPort: 40000,
            rtcMaxPort: 49999
        });

        const worker = await workerPromise;
        worker.on('died', () => {
            workerPromise = null;
            routerPromise = null;
            console.error('mediasoup worker died');
        });
    }

    return workerPromise;
}

async function getRouter() {
    if (!routerPromise) {
        routerPromise = (async () => {
            const worker = await getWorker();
            return worker.createRouter({ mediaCodecs });
        })();
    }

    return routerPromise;
}

async function createWebRtcTransport() {
    const router = await getRouter();
    const transport = await router.createWebRtcTransport({
        listenInfos: [
            { protocol: 'udp', ip: '0.0.0.0' },
            { protocol: 'tcp', ip: '0.0.0.0' }
        ],
        enableUdp: true,
        enableTcp: true,
        preferUdp: true
    });

    return transport;
}

function getRoomProducerList(callId, excludedSocketId = null) {
    const room = rooms.get(callId);
    if (!room) return [];

    return Array.from(room.producerOwners.entries())
        .filter(([, ownerSocketId]) => ownerSocketId !== excludedSocketId)
        .map(([producerId, ownerSocketId]) => {
            const ownerPeer = peers.get(ownerSocketId);
            return {
                producerId,
                peerId: ownerSocketId,
                userId: ownerPeer?.userId || null,
                username: ownerPeer?.username || 'Participant'
            };
        });
}

function removePeerFromRoom(peer) {
    if (!peer?.callId) return;

    const room = rooms.get(peer.callId);
    if (!room) {
        peer.callId = null;
        return;
    }

    room.peers.delete(peer.socketId);
    peer.producers.forEach((_, producerId) => {
        room.producerOwners.delete(producerId);
    });

    if (room.peers.size === 0) {
        rooms.delete(peer.callId);
    }

    peer.callId = null;
}

function closePeer(socketId) {
    const peer = peers.get(socketId);
    if (!peer) return null;

    const roomId = peer.callId;
    removePeerFromRoom(peer);
    closeEntries(peer.consumers);
    closeEntries(peer.producers);
    closeEntries(peer.transports);
    peers.delete(socketId);
    return roomId;
}

async function getRouterRtpCapabilities() {
    const router = await getRouter();
    return { rtpCapabilities: router.rtpCapabilities };
}

async function joinCall(socket, { callId }) {
    if (!callId) {
        throw new Error('callId is required');
    }

    const peer = getPeer(socket);
    removePeerFromRoom(peer);
    peer.callId = callId;
    peer.username = socket.username || peer.username;

    const room = getRoom(callId);
    room.peers.add(socket.id);
    socket.join(`call-${callId}`);

    return { callId };
}

async function createTransport(socket, { callId, direction }) {
    const peer = getPeer(socket);
    if (!peer.callId || peer.callId !== callId) {
        throw new Error('Peer is not joined to the call');
    }

    const transport = await createWebRtcTransport();
    peer.transports.set(transport.id, transport);
    transport.appData = { direction };

    transport.on('dtlsstatechange', (state) => {
        if (state === 'closed') {
            peer.transports.delete(transport.id);
        }
    });

    return serializeTransport(transport);
}

async function connectTransport(socket, { transportId, dtlsParameters }) {
    const peer = getPeer(socket);
    const transport = peer.transports.get(transportId);
    if (!transport) {
        throw new Error('Transport not found');
    }

    await transport.connect({ dtlsParameters });
    return { connected: true };
}

async function produce(socket, payload) {
    const peer = getPeer(socket);
    const transport = peer.transports.get(payload.transportId);
    if (!transport) {
        throw new Error('Transport not found');
    }

    const producer = await transport.produce({
        kind: payload.kind,
        rtpParameters: payload.rtpParameters,
        appData: {
            ...payload.appData,
            peerId: socket.id,
            userId: socket.userId,
            username: socket.username || peer.username
        }
    });

    peer.producers.set(producer.id, producer);
    const room = getRoom(peer.callId);
    room.producerOwners.set(producer.id, socket.id);

    producer.on('transportclose', () => {
        peer.producers.delete(producer.id);
        room.producerOwners.delete(producer.id);
    });

    socket.to(`call-${peer.callId}`).emit('mediasoup:new-producer', {
        callId: peer.callId,
        producerId: producer.id,
        peerId: socket.id,
        userId: socket.userId,
        username: socket.username || peer.username,
        kind: payload.kind
    });

    return { id: producer.id };
}

async function listProducers(socket, { callId }) {
    return { producers: getRoomProducerList(callId, socket.id) };
}

async function consume(socket, payload) {
    const peer = getPeer(socket);
    const transport = peer.transports.get(payload.transportId);
    if (!transport) {
        throw new Error('Transport not found');
    }

    const router = await getRouter();
    if (!router.canConsume({
        producerId: payload.producerId,
        rtpCapabilities: payload.rtpCapabilities
    })) {
        throw new Error('Cannot consume this producer');
    }

    const ownerSocketId = getRoom(peer.callId).producerOwners.get(payload.producerId);
    const ownerPeer = peers.get(ownerSocketId);
    const consumer = await transport.consume({
        producerId: payload.producerId,
        rtpCapabilities: payload.rtpCapabilities
    });

    peer.consumers.set(consumer.id, consumer);
    consumer.on('transportclose', () => {
        peer.consumers.delete(consumer.id);
    });
    consumer.on('producerclose', () => {
        peer.consumers.delete(consumer.id);
        socket.emit('mediasoup:producer-closed', {
            callId: peer.callId,
            producerId: payload.producerId,
            consumerId: consumer.id,
            peerId: ownerSocketId
        });
    });

    return {
        id: consumer.id,
        producerId: payload.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        peerId: ownerSocketId,
        userId: ownerPeer?.userId || null,
        username: ownerPeer?.username || 'Participant'
    };
}

async function leaveCall(socket) {
    const roomId = closePeer(socket.id);
    return { callId: roomId };
}

module.exports = {
    closePeer,
    connectTransport,
    consume,
    createTransport,
    getRouterRtpCapabilities,
    joinCall,
    leaveCall,
    listProducers,
    produce
};
