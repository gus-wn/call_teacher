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
      try {
        const s = JSON.parse(saved);
        // 저장된 배치표가 비어 있거나 망가졌으면 config.js 배치표를 사용
        if (!Array.isArray(s.layout) || !s.layout.length || !s.layout.every(Array.isArray)) delete s.layout;
        Object.assign(cfg, s);
      } catch (e) {}
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
  // 목소리 설정 (이 기기에 저장): { voice: 목소리 이름, rate: 빠르기, pitch: 높낮이, volume: 크기 }
  const VOICE_PREF_KEY = "staffroom_call_voice_pref";
  function voicePref() {
    try { return Object.assign({ voice: "", rate: 0.95, pitch: 1, volume: 1 }, JSON.parse(safeGet(VOICE_PREF_KEY) || "{}")); }
    catch (e) { return { voice: "", rate: 0.95, pitch: 1, volume: 1 }; }
  }
  function setVoicePref(p) { safeSet(VOICE_PREF_KEY, JSON.stringify(p)); }
  function koreanVoices() {
    if (!("speechSynthesis" in window)) return [];
    return speechSynthesis.getVoices().filter(v => v.lang && v.lang.toLowerCase().startsWith("ko"));
  }
  function speak(text, pref) {
    if (!("speechSynthesis" in window)) return;
    const p = pref || voicePref();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR"; u.rate = +p.rate; u.pitch = +p.pitch; u.volume = +p.volume;
    const list = koreanVoices();
    u.voice = list.find(v => v.name === p.voice) || list[0] || null;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // 칸 내용 해석: "" 빈자리 / "#문" 표지 / "이름|업무" 선생님
  function parseSeat(raw) {
    const v = String(raw || "").trim();
    if (!v) return { kind: "empty" };
    if (v.startsWith("#")) return { kind: "label", text: v.slice(1) };
    const i = v.indexOf("|");
    return i < 0 ? { kind: "teacher", name: v, role: "" }
                 : { kind: "teacher", name: v.slice(0, i).trim(), role: v.slice(i + 1).trim() };
  }
  function teacherNames(cfg) {
    return [...new Set(cfg.layout.flat().map(parseSeat).filter(s => s.kind === "teacher").map(s => s.name))];
  }

  window.StaffCall = { parseSeat, teacherNames, loadConfig, saveConfig, resetConfig, send, listen, unlockAudio, chime, speak, esc, voicePref, setVoicePref, koreanVoices };
})();
