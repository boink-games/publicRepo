
// Simple Audio wrapper
(() => {
  const playSound = (src) => {
    try {
      const audio = new Audio(src);
      audio.play();
    } catch (e) {
      console.error(`Failed to play sound: ${src}`, e);
    }
  };

  window.LE_AUDIO = {
    // Using existing assets from the root assets folder
    playDing: () => playSound('../../assets/hit.mp3'),
    playBuzz: () => playSound('../../assets/sink.mp3'),
    playVictory: () => {
      // Play the 'ding' sound twice for a simple victory effect
      playSound('../../assets/hit.mp3');
      setTimeout(() => playSound('../../assets/hit.mp3'), 150);
    }
  };
})();
