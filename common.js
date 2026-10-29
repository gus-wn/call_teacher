// 공통 기능: 설정 불러오기, 신호 보내기/받기, 소리
(function () {
  const STORE_KEY = "staffroom_call_config";
  const RELAY = "https://ntfy.sh"; // 가입 없이 쓰는 무료 알림 중계 서버

  function safeGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function safeSet(key, v) { try { localStorage.setItem(key, v); } catch (e) {} }
  function safeDel(key) { try { localStorage.removeItem(key); } catch (e) {} }

  // 설정 우선순위: 주소의 ?ch=코드 > 이 기기에 저장된 설정 > config.js
  function loadConfig() {
    let cfg = JSON.parse(JSON.stringify(window.DEFAULT_CONFIG));
    const saved = safeGet(STORE_KEY);
    if (saved) {
      try { Object.assign(cfg, JSON.parse(saved)); } catch (e) {}
    }
    const ch = new URLSearchParams(location.search).get("ch");
    if (ch) cfg.channel = ch;
    return cfg;
  }
  function saveConfig(cfg) { safeSet(STORE_KEY, JSON.stringify(cfg)); }
  function resetConfig() { safeDel(STORE_KEY); }

  function topic(cfg) {
    return "staffcall-" + String(cfg.channel || "default").replace(/[^a-zA-Z0-9_-]/g, "");
  }

  async function send(cfg, payload) {
    const res = await fetch(RELAY + "/", {
      method: "POST",
      body: JSON.stringify({ topic: topic(cfg), message: JSON.stringify(payload) })
    });
    if (!res.ok) throw new Error("전송 실패 (" + res.status + ")");
  }

  // 실시간 수신. onStatus("open"|"error")
  function listen(cfg, onMessage, onStatus) {
    const es = new EventSource(RELAY + "/" + topic(cfg) + "/sse");
    es.onopen = () => onStatus && onStatus("open");
    es.onerror = () => onStatus && onStatus("error");
    es.onmessage = (ev) => {
      try {
        const outer = JSON.parse(ev.data);
        if (outer.event !== "message") return;
        const data = JSON.parse(outer.message);
        data._id = outer.id;
        data._time = outer.time * 1000;
        onMessage(data);
      } catch (e) {}
    };
    return es;
  }

  // 띵동 소리 (Web Audio)
  let ctx = null;
  function unlockAudio() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  }
  function chime() {
    if (!ctx) return;
    const now = ctx.currentTime;
    [[880, 0], [659.25, 0.35]].forEach(([f, t]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.4, now + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 1.1);
      o.connect(g).connect(ctx.destination);
      o.start(now + t); o.stop(now + t + 1.2);
    });
  }
  function speak(text) {
    if (!("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR"; u.rate = 0.95;
    const ko = speechSynthesis.getVoices().find(v => v.lang && v.lang.startsWith("ko"));
    if (ko) u.voice = ko;
    speechSynthesis.speak(u);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.StaffCall = { loadConfig, saveConfig, resetConfig, send, listen, unlockAudio, chime, speak, esc };
})();
