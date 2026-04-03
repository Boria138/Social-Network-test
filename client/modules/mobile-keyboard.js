(function attachMobileKeyboardModule(global) {
  function initializeMessageKeyboardAvoidance() {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput || !window.visualViewport) return;

    const root = document.documentElement;
    const isMobile = () => window.innerWidth <= 820;
    const isInputFocused = () => document.activeElement === messageInput;

    const resetOffset = () => {
      root.style.setProperty('--vk-offset', '0px');
      document.body.classList.remove('vk-open');
    };

    const updateKeyboardOffset = () => {
      if (!isMobile() || !isInputFocused()) {
        resetOffset();
        return;
      }

      const vv = window.visualViewport;
      const rawKeyboardHeight = window.innerHeight - vv.height - vv.offsetTop;
      const keyboardHeight = rawKeyboardHeight > 120 ? Math.round(rawKeyboardHeight) : 0;
      root.style.setProperty('--vk-offset', `${keyboardHeight}px`);
      document.body.classList.toggle('vk-open', keyboardHeight > 0);

      if (keyboardHeight > 0) {
        requestAnimationFrame(() => {
          messageInput.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        });
      }
    };

    messageInput.addEventListener('focus', () => {
      setTimeout(updateKeyboardOffset, 60);
    });

    messageInput.addEventListener('blur', () => {
      setTimeout(resetOffset, 60);
    });

    window.visualViewport.addEventListener('resize', updateKeyboardOffset);
    window.visualViewport.addEventListener('scroll', updateKeyboardOffset);
    window.addEventListener('resize', updateKeyboardOffset);
  }

  global.VoxiiMobileKeyboard = { initializeMessageKeyboardAvoidance };
})(window);
