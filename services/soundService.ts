
class SoundService {
  private ctx: AudioContext | null = null;

  private init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  private playTone(freq: number, type: OscillatorType, duration: number, volume: number, ramp: boolean = true) {
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    if (ramp) {
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    } else {
      gain.gain.setValueAtTime(0, this.ctx.currentTime + duration);
    }

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playDrop() {
    // Subtle low blip for start
    this.playTone(150, 'sine', 0.1, 0.1);
  }

  playMoney() {
    // "Cha-ching" effect for price drops
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;

    // A C-Major triad in high register (C6, E6, G6)
    const notes = [1046.50, 1318.51, 1567.98]; 
    
    notes.forEach((freq, index) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + (index * 0.05));
        
        // Crisp attack and decay
        gain.gain.setValueAtTime(0, now + (index * 0.05));
        gain.gain.linearRampToValueAtTime(0.08, now + (index * 0.05) + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + (index * 0.05) + 0.4);
        
        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        
        osc.start(now + (index * 0.05));
        osc.stop(now + (index * 0.05) + 0.5);
    });
  }

  playBid() {
    // Upward chime
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    const playNote = (freq: number, delay: number) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + delay);
      gain.gain.setValueAtTime(0.15, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.4);
    };

    playNote(523.25, 0); // C5
    playNote(659.25, 0.08); // E5
    playNote(783.99, 0.16); // G5
  }

  playEnd() {
    // Neutral double blip
    this.playTone(200, 'sine', 0.1, 0.1);
    setTimeout(() => this.playTone(150, 'sine', 0.15, 0.1), 150);
  }
}

export const soundService = new SoundService();
