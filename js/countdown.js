/**
 * Countdown to 2026-09-17 00:00:00 KST (UTC+9)
 * Flip-clock digit display
 */
const Countdown = {
  target: new Date("2026-09-17T00:00:00+09:00").getTime(),
  timerId: null,

  pad(n) {
    return String(Math.max(0, n)).padStart(2, "0").slice(-2);
  },

  setUnit(prefix, value) {
    const digits = this.pad(value);
    for (let i = 0; i < 2; i++) {
      const el = document.getElementById(`${prefix}-${i}`);
      if (el && el.textContent !== digits[i]) {
        el.textContent = digits[i];
      }
    }
  },

  tick() {
    const now = Date.now();
    let diff = Math.max(0, this.target - now);

    const day = Math.floor(diff / 86400000);
    diff %= 86400000;
    const hrs = Math.floor(diff / 3600000);
    diff %= 3600000;
    const mins = Math.floor(diff / 60000);
    diff %= 60000;
    const secs = Math.floor(diff / 1000);

    this.setUnit("cd-day", day);
    this.setUnit("cd-hrs", hrs);
    this.setUnit("cd-mins", mins);
    this.setUnit("cd-secs", secs);

    if (this.target - now <= 0 && this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  },

  init() {
    this.tick();
    this.timerId = setInterval(() => this.tick(), 1000);
  },
};
