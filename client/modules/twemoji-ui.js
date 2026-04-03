(function attachTwemojiUiModule(global) {
  function parse(root = document.body) {
    if (typeof twemoji === 'undefined' || !root) return;

    global.VoxiiTwemojiState.isParsing = true;
    try {
      twemoji.parse(root, {
        folder: 'svg',
        ext: '.svg'
      });
    } finally {
      global.VoxiiTwemojiState.isParsing = false;
    }
  }

  function queueParse(node) {
    if (typeof twemoji === 'undefined' || !node) return;

    const targetNode = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    if (!targetNode || targetNode.nodeType !== Node.ELEMENT_NODE) return;
    if (targetNode.matches && targetNode.matches('img.emoji')) return;

    global.VoxiiTwemojiState.pendingNodes.add(targetNode);
    if (global.VoxiiTwemojiState.parseTimer) return;

    global.VoxiiTwemojiState.parseTimer = setTimeout(() => {
      global.VoxiiTwemojiState.parseTimer = null;
      const nodes = Array.from(global.VoxiiTwemojiState.pendingNodes);
      global.VoxiiTwemojiState.pendingNodes.clear();
      nodes.forEach(parse);
    }, 0);
  }

  function initialize() {
    if (typeof twemoji === 'undefined' || !document.body) return;

    parse(document.body);

    if (global.VoxiiTwemojiState.observer) {
      global.VoxiiTwemojiState.observer.disconnect();
    }

    global.VoxiiTwemojiState.observer = new MutationObserver((mutations) => {
      if (global.VoxiiTwemojiState.isParsing) return;

      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          queueParse(mutation.target);
          return;
        }

        mutation.addedNodes.forEach((addedNode) => {
          if (addedNode.nodeType === Node.TEXT_NODE) {
            queueParse(addedNode);
            return;
          }

          if (addedNode.nodeType !== Node.ELEMENT_NODE) return;
          if (addedNode.matches && addedNode.matches('img.emoji')) return;
          queueParse(addedNode);
        });
      });
    });

    global.VoxiiTwemojiState.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  global.VoxiiTwemojiState = {
    observer: null,
    parseTimer: null,
    pendingNodes: new Set(),
    isParsing: false
  };
  global.VoxiiTwemojiUI = { initialize, parse, queueParse };
})(window);
