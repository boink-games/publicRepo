
// Simple Text-to-Speech wrapper
(() => {
  if (!window.speechSynthesis) {
    console.warn('Text-to-Speech not supported in this browser.');
    window.LE_TTS = { speak: () => {} }; // Provide a dummy object
    return;
  }

  let voices = [];
  const loadVoices = () => {
    voices = window.speechSynthesis.getVoices();
  };

  // Load voices initially and on change
  loadVoices();
  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }

  const speak = (text, lang = 'en-US') => {
    try {
      if (!text) return;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      // Find a suitable voice
      const voice = voices.find(v => v.lang === lang && v.name.includes('Google'));
      if (voice) {
        utterance.voice = voice;
      }

      window.speechSynthesis.cancel(); // Cancel any previous speech
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.error('TTS speak failed', e);
    }
  };

  window.LE_TTS = {
    speak,
  };
})();
