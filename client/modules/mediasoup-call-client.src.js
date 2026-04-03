import { Device } from 'mediasoup-client';

(function attachMediasoupCallClient(global) {
  function createAckEmitter(socket) {
    return function emitAck(event, payload = {}) {
      return new Promise((resolve, reject) => {
        socket.emit(event, payload, (response = {}) => {
          if (response && response.error) {
            reject(new Error(response.error));
            return;
          }

          resolve(response);
        });
      });
    };
  }

  function createController(options) {
    const state = {
      callId: null,
      consumedProducerIds: new Set(),
      consumers: new Map(),
      device: null,
      emitAck: createAckEmitter(options.socket),
      peerStreams: new Map(),
      producers: new Map(),
      recvTransport: null,
      sendTransport: null
    };

    function bindSocketEvents() {
      if (state.bound) return;
      state.bound = true;

      options.socket.on('mediasoup:new-producer', async (data) => {
        if (!data || data.callId !== state.callId || data.peerId === options.socket.id) return;
        await consumeProducer(data.producerId);
      });

      options.socket.on('mediasoup:producer-closed', (data) => {
        if (!data || data.callId !== state.callId) return;
        removeConsumerByProducer(data.producerId, data.peerId);
      });
    }

    async function createTransport(direction) {
      const params = await state.emitAck('mediasoup:create-transport', {
        callId: state.callId,
        direction
      });
      const transport = direction === 'send'
        ? state.device.createSendTransport(params)
        : state.device.createRecvTransport(params);

      transport.on('connect', ({ dtlsParameters }, callback, errback) => {
        state.emitAck('mediasoup:connect-transport', {
          transportId: transport.id,
          dtlsParameters
        }).then(callback).catch(errback);
      });

      return transport;
    }

    function getPeerStream(peerId) {
      if (!state.peerStreams.has(peerId)) {
        state.peerStreams.set(peerId, new MediaStream());
      }

      return state.peerStreams.get(peerId);
    }

    async function consumeProducer(producerId) {
      if (!producerId || state.consumedProducerIds.has(producerId) || !state.recvTransport) return;

      state.consumedProducerIds.add(producerId);
      const data = await state.emitAck('mediasoup:consume', {
        callId: state.callId,
        producerId,
        transportId: state.recvTransport.id,
        rtpCapabilities: state.device.rtpCapabilities
      });

      const consumer = await state.recvTransport.consume({
        id: data.id,
        producerId: data.producerId,
        kind: data.kind,
        rtpParameters: data.rtpParameters
      });

      state.consumers.set(consumer.id, consumer);
      const peerId = data.peerId || data.userId || data.producerId;
      const stream = getPeerStream(peerId);
      stream.addTrack(consumer.track);
      options.onRemoteStream({
        kind: data.kind,
        peerId,
        stream,
        userId: data.userId,
        username: data.username
      });

      consumer.on('transportclose', () => {
        removeConsumer(consumer.id, peerId);
      });
      consumer.on('trackended', () => {
        removeConsumer(consumer.id, peerId);
      });
    }

    function removeConsumer(consumerId, peerId) {
      const consumer = state.consumers.get(consumerId);
      if (!consumer) return;

      const stream = state.peerStreams.get(peerId);
      if (stream) {
        stream.removeTrack(consumer.track);
        if (stream.getTracks().length === 0) {
          state.peerStreams.delete(peerId);
          options.onPeerClosed(peerId);
        } else {
          options.onRemoteStream({ peerId, stream });
        }
      }

      state.consumers.delete(consumerId);
      try {
        consumer.close();
      } catch (error) {
        console.warn('Failed to close consumer:', error.message);
      }
    }

    function removeConsumerByProducer(producerId, peerId) {
      state.consumedProducerIds.delete(producerId);
      Array.from(state.consumers.entries()).forEach(([consumerId, consumer]) => {
        if (consumer.producerId === producerId) {
          removeConsumer(consumerId, peerId);
        }
      });
    }

    async function produceTrack(kind, track) {
      if (!track || !state.sendTransport) return null;

      const producer = await state.sendTransport.produce({
        track,
        stopTracks: false,
        appData: { kind }
      });

      state.producers.set(kind, producer);
      producer.on('transportclose', () => {
        state.producers.delete(kind);
      });
      return producer;
    }

    async function createProducers(localStream) {
      const audioTrack = localStream.getAudioTracks()[0] || null;
      const videoTrack = localStream.getVideoTracks()[0] || null;

      if (audioTrack && !state.producers.has('audio')) {
        await produceTrack('audio', audioTrack);
      }
      if (videoTrack && !state.producers.has('video')) {
        await produceTrack('video', videoTrack);
      }
    }

    async function consumeExistingProducers() {
      const { producers } = await state.emitAck('mediasoup:list-producers', {
        callId: state.callId
      });

      for (const producer of producers || []) {
        await consumeProducer(producer.producerId);
      }
    }

    async function start(callId, localStream) {
      if (!callId || !localStream) {
        throw new Error('callId and localStream are required');
      }

      if (state.callId === callId && state.sendTransport && state.recvTransport) {
        return;
      }

      await close({ notifyServer: false });
      state.callId = callId;
      bindSocketEvents();

      const { rtpCapabilities } = await state.emitAck('mediasoup:get-router-rtp-capabilities');
      state.device = new Device();
      await state.device.load({ routerRtpCapabilities: rtpCapabilities });
      await state.emitAck('mediasoup:join-call', { callId });

      state.sendTransport = await createTransport('send');
      state.sendTransport.on('produce', ({ kind, rtpParameters, appData }, callback, errback) => {
        state.emitAck('mediasoup:produce', {
          callId: state.callId,
          transportId: state.sendTransport.id,
          kind,
          rtpParameters,
          appData
        }).then(({ id }) => callback({ id })).catch(errback);
      });

      state.recvTransport = await createTransport('recv');
      await createProducers(localStream);
      await consumeExistingProducers();
    }

    async function replaceProducerTrack(kind, track) {
      const producer = state.producers.get(kind);
      if (!producer) {
        await produceTrack(kind, track);
        return;
      }

      await producer.replaceTrack({ track });
    }

    async function setProducerEnabled(kind, enabled) {
      const producer = state.producers.get(kind);
      if (!producer) return;

      if (enabled) {
        await producer.resume();
        return;
      }

      await producer.pause();
    }

    async function close({ notifyServer = true } = {}) {
      if (notifyServer && state.callId) {
        try {
          await state.emitAck('mediasoup:leave-call');
        } catch (error) {
          console.warn('Failed to leave mediasoup call:', error.message);
        }
      }

      state.consumedProducerIds.clear();
      state.peerStreams.forEach((_, peerId) => {
        options.onPeerClosed(peerId);
      });
      state.peerStreams.clear();

      state.consumers.forEach((consumer) => consumer.close());
      state.consumers.clear();
      state.producers.forEach((producer) => producer.close());
      state.producers.clear();

      if (state.recvTransport) {
        state.recvTransport.close();
        state.recvTransport = null;
      }
      if (state.sendTransport) {
        state.sendTransport.close();
        state.sendTransport = null;
      }

      state.device = null;
      state.callId = null;
    }

    return {
      close,
      replaceAudioTrack(track) {
        return replaceProducerTrack('audio', track);
      },
      replaceVideoTrack(track) {
        return replaceProducerTrack('video', track);
      },
      setAudioEnabled(enabled) {
        return setProducerEnabled('audio', enabled);
      },
      setVideoEnabled(enabled) {
        return setProducerEnabled('video', enabled);
      },
      start
    };
  }

  global.VoxiiMediasoupCalls = { createController };
})(window);
