/**
 * Web Audio API synthesizer & Speech Synthesis for M3Car driver dispatch alerts and notifications.
 * Pure native browser audio & voice - zero external MP3 dependencies.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Speak Indonesian voice announcement
 */
export function speakIndonesian(text: string) {
  if (typeof window === 'undefined') return;
  try {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID';
      utterance.rate = 1.0;
      utterance.pitch = 1.05;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  } catch (e) {
    console.warn('Speech synthesis error:', e);
  }
}

/**
 * Play loud fanfare & speak "ANDA SUDAH DITERIMA"
 */
export function playDriverAcceptedSound() {
  const ctx = getAudioContext();
  if (ctx) {
    try {
      const now = ctx.currentTime;
      // Fanfare chords
      const notes = [
        { freq: 523.25, start: 0.0, dur: 0.15 }, // C5
        { freq: 659.25, start: 0.12, dur: 0.15 }, // E5
        { freq: 783.99, start: 0.24, dur: 0.2 }, // G5
        { freq: 1046.5, start: 0.42, dur: 0.45 }, // C6
      ];

      notes.forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + start);

        gain.gain.setValueAtTime(0.001, now + start);
        gain.gain.exponentialRampToValueAtTime(0.4, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + start);
        osc.stop(now + start + dur);
      });
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // Speak: "ANDA SUDAH DITERIMA!"
  setTimeout(() => {
    speakIndonesian('Anda sudah diterima! Selamat, akun driver Anda kini aktif.');
  }, 250);
}

/**
 * Play loud Grab-style incoming order bell alert
 */
export function playOrderAlertChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;

    // Pattern: Ding-Dong-Ding rapid chime
    const notes = [
      { freq: 880, start: 0.0, dur: 0.12 },
      { freq: 1174.66, start: 0.14, dur: 0.18 },
      { freq: 880, start: 0.35, dur: 0.12 },
      { freq: 1174.66, start: 0.49, dur: 0.25 },
      { freq: 1479.98, start: 0.78, dur: 0.35 }
    ];

    notes.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + start);

      gain.gain.setValueAtTime(0.001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.35, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + start);
      osc.stop(now + start + dur);
    });
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

/**
 * Play pleasant success chime when transaction or booking finishes
 */
export function playSuccessChime() {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.5, now + 0.25); // C6

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.45);
  } catch (e) {
    console.warn('Audio play error:', e);
  }
}

/**
 * Play pleasant notification chime for customer when driver status updates
 * (SUDAH JEMPUT, SUDAH SAMPAI, SELESAI)
 */
export function playPassengerNotificationChime(spokenMessage?: string) {
  const ctx = getAudioContext();
  if (ctx) {
    try {
      const now = ctx.currentTime;

      // Pattern: Gentle double chime (Ding-Dong) - 587Hz (D5) -> 880Hz (A5)
      const tones = [
        { freq: 587.33, start: 0.0, dur: 0.2 },
        { freq: 880.0, start: 0.18, dur: 0.35 },
      ];

      tones.forEach(({ freq, start, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + start);

        gain.gain.setValueAtTime(0.001, now + start);
        gain.gain.exponentialRampToValueAtTime(0.3, now + start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + start);
        osc.stop(now + start + dur);
      });
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  if (spokenMessage) {
    setTimeout(() => {
      speakIndonesian(spokenMessage);
    }, 280);
  }
}


