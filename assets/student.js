(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const config = window.JDC_CONFIG;
  const db = window.supabase?.createClient(config?.url || "", config?.publishableKey || "");
  const state = { profile: null, academySettings: {}, batches: [], batchIds: [], view: "home", userId: "", attempt: null, questionIndex: 0, review: new Set(), timer: null, timeoutSent: false, unread: 0, reads: new Set(), busy: false, videoCleanup: [] };
  let youtubeApiPromise = null;
  const views = {
    home: ["Home", "Your preparation, all in one place."], courses: ["My Courses", "Your enrolled defence batches."], live: ["Live Classes", "Upcoming and running academy classes."],
    recorded: ["Recorded Classes", "Revisit lessons shared with your batch."], pdfs: ["Study Material", "Your batch notes and learning PDFs."], tests: ["Test Series", "Take timed tests and track your scores."],
    results: ["My Results", "Your submitted test attempts and performance."], notifications: ["Notifications", "Announcements from your academy."], profile: ["My Profile", "Your student account and learning progress."]
  };

  function node(tag, cls = "", text = null) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== null) n.textContent = text; return n; }
  function btn(label, fn, quiet = false) { const b = node("button", `btn${quiet ? " btn-quiet" : ""}`, label); b.type = "button"; b.addEventListener("click", fn); return b; }
  function setStatus(id, message = "", kind = "") { const n = $(id); if (n) { n.textContent = message; n.className = `status${kind ? ` ${kind}` : ""}`; } }
  function initials(name = "Student") { return name.trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "S"; }
  function fmt(value, withTime = true) { if (!value) return "Time to be announced"; const d = new Date(value); return Number.isNaN(d.valueOf()) ? "Time to be announced" : d.toLocaleString(undefined, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }); }
  function showError(container, title, detail) { container.replaceChildren(); const box = node("div", "empty-state"); const body = node("div"); body.append(node("span", "empty-mark", "!"), node("strong", "", title), node("span", "small", detail)); box.append(body); container.append(box); }
  function empty(container, title, detail) { const box = node("div", "empty-state"); const body = node("div"); body.append(node("span", "empty-mark", "✦"), node("strong", "", title), node("span", "small", detail)); box.append(body); container.append(box); }
  function surface(title, cls = "surface surface-pad span-12") { const section = node("section", cls); const head = node("div", "surface-head"); head.append(node("h2", "", title)); section.append(head); return section; }
  function setActiveNav(view) {
    document.querySelectorAll("[data-view]").forEach((n) => n.classList.toggle("active", n.dataset.view === view));
    $("studentPageTitle").textContent = views[view]?.[0] || "Home";
    $("studentPageSubtitle").textContent = views[view]?.[1] || "Your preparation, all in one place.";
  }
  function countsBadge() { const badge = $("unreadBadge"); if (!badge) return; badge.textContent = String(state.unread); badge.classList.toggle("hidden", !state.unread); }
  function applyAcademyBranding() {
    const name = state.academySettings.academy_name || "JOSHI DEFENCE CLASSES";
    document.querySelectorAll("[data-academy-name]").forEach((el) => { el.textContent = name; });
    const logoUrl = state.academySettings.logo_url;
    if (!logoUrl) { document.querySelectorAll(".brand-mark.has-academy-logo").forEach((mark) => { mark.replaceChildren("JDC"); mark.classList.remove("has-academy-logo"); }); return; }
    let parsed; try { parsed = new URL(logoUrl); } catch { return; }
    if (parsed.protocol !== "https:") return;
    document.querySelectorAll(".brand-mark").forEach((mark) => {
      const img = node("img", "academy-logo-image"); img.src = parsed.href; img.alt = "";
      img.addEventListener("error", () => { mark.replaceChildren("JDC"); mark.classList.remove("has-academy-logo"); }, { once: true });
      mark.replaceChildren(img); mark.classList.add("has-academy-logo");
    });
  }
  function cleanupVideoPlayers() { for (const cleanup of state.videoCleanup.splice(0)) { try { cleanup(); } catch {} } }
  function nav(view) { if (!views[view]) return; cleanupVideoPlayers(); state.view = view; if (state.timer) { clearInterval(state.timer); state.timer = null; } setActiveNav(view); render(view); }
  async function checked(query) { const { data, error } = await query; if (error) throw error; return data || []; }
  async function invoke(name, body) { const { data, error } = await db.functions.invoke(name, { body }); if (error) throw error; if (data?.error) throw new Error(data.error); return data || {}; }

  async function loadIdentity(user) {
    if (!user || state.userId === user.id) return;
    state.userId = user.id;
    try {
      const { data, error } = await db.from("profiles").select("id,full_name,phone,role,is_active").eq("id", user.id).maybeSingle();
      if (error) throw error;
      if (!data || data.role !== "student" || data.is_active !== true) throw new Error("This login does not have an active student account. Please contact your academy administrator.");
      state.profile = data;
      try { const settings = await checked(db.from("academy_settings").select("academy_name,tagline,support_email,support_phone,logo_url").eq("id", true)); state.academySettings = settings[0] || {}; applyAcademyBranding(); } catch (error) { console.warn("Academy profile settings are unavailable:", error.message); }
      $("loginScreen").classList.add("hidden"); $("studentApp").classList.remove("hidden");
      $("studentAvatar").textContent = initials(data.full_name || "Student");
      await loadBatches();
      await refreshNotificationState();
      await render("home");
    } catch (error) {
      state.profile = null; state.userId = "";
      setStatus("loginMessage", error.message || "Could not open the student account.", "error");
      await db.auth.signOut();
      $("studentApp").classList.add("hidden"); $("loginScreen").classList.remove("hidden");
    }
  }
  async function loadBatches() {
    const rows = await checked(db.from("enrollments").select("batch_id,batches(id,name,description,is_active,course_id,lead_faculty_id)").eq("student_id", state.profile.id));
    state.batches = rows.map((row) => row.batches).filter((batch) => batch?.is_active === true);
    state.batchIds = [...new Set(state.batches.map((batch) => batch.id).filter(Boolean))];
  }
  async function contentRows(table, fields, filters = []) {
    if (!state.batchIds.length) return [];
    let query = db.from(table).select(fields).in("batch_id", state.batchIds);
    for (const [method, args] of filters) query = query[method](...args);
    return checked(query);
  }
  async function notifications() {
    const rows = await checked(db.from("announcements").select("id,title,body,target_batch_id,is_published,created_at").eq("is_published", true).order("created_at", { ascending: false }));
    return rows.filter((row) => !row.target_batch_id || state.batchIds.includes(row.target_batch_id));
  }
  async function refreshNotificationState(rows = null) {
    if (!state.profile) return;
    try {
      const items = rows || await notifications();
      if (!items.length) { state.reads = new Set(); state.unread = 0; countsBadge(); return; }
      const readRows = await checked(db.from("notification_reads").select("announcement_id,read_at").eq("student_id", state.profile.id).in("announcement_id", items.map((x) => x.id)));
      state.reads = new Set(readRows.map((x) => x.announcement_id));
      state.unread = items.filter((x) => !state.reads.has(x.id)).length;
      countsBadge();
    } catch (error) {
      // Until the additive read-receipts migration is applied, still show announcements.
      console.warn("Notification read state is unavailable:", error.message);
      state.reads = new Set(); state.unread = 0; countsBadge();
    }
  }

  function metric(label, value, icon) { const box = node("article", "metric"); box.append(node("span", "quick-icon", icon), node("div", "metric-label", label), node("div", "metric-value", String(value))); return box; }
  function quickLink(title, note, icon, view) { const b = node("button", "feature-card"); b.type = "button"; b.append(node("span", "quick-icon", icon)); const text = node("span"); text.append(node("strong", "", title), node("small", "", note)); b.append(text); b.addEventListener("click", () => nav(view)); return b; }
  function cardRow(title, detail, icon = "◈", badge = "", action = null, cls = "") {
    const row = node("article", `list-row ${cls}`.trim()); row.append(node("span", "list-icon", icon)); const copy = node("div", "list-body"); copy.append(node("strong", "", title), node("span", "", detail || "")); row.append(copy);
    if (badge) row.append(node("span", `badge${badge === "LIVE" ? " badge-red" : badge === "ACTIVE" ? " badge-green" : ""}`, badge));
    if (action) row.append(action); return row;
  }
  async function homePage(out) {
    const [classes, live, pdfs, testData, resultData, progress] = await Promise.all([
      contentRows("classes", "id,title,status", [["eq", ["status", "published"]]]),
      contentRows("live_sessions", "id,title,status,scheduled_start,live_url", [["in", ["status", ["scheduled", "live"]]]]),
      contentRows("study_pdfs", "id,title,status", [["eq", ["status", "published"]]]),
      invoke("student-test", { action: "list" }), invoke("student-test", { action: "results" }),
      state.profile ? checked(db.from("class_progress").select("id,completed_at").eq("student_id", state.profile.id)) : []
    ]);
    const first = node("section", "student-hero");
    first.append(node("span", "eyebrow", "YOUR DREAM · OUR MISSION"), node("h2", "", `Welcome${state.profile.full_name ? `, ${state.profile.full_name.split(/\s+/)[0]}` : ""}`), node("p", "", state.batches.map((x) => x.name).join(" · ") || "Your academy will assign your batch here."));
    const actions = node("div", "hero-actions"); actions.append(btn("Live classes", () => nav("live")), btn("Study material", () => nav("pdfs"), true)); first.append(actions); out.append(first);
    const completed = progress.filter((item) => item.completed_at).length; const progressPercent = classes.length ? Math.round(completed / classes.length * 100) : 0;
    const stats = node("div", "four-metrics"); stats.append(metric("Live / upcoming", live.length, "◉"), metric("Recorded lessons", classes.length, "▶"), metric("Study PDFs", pdfs.length, "▤"), metric("Tests attempted", resultData.data?.length || 0, "▣"), metric("Learning progress", `${progressPercent}%`, "✓")); out.append(stats);
    const access = surface("Quick Access"); access.classList.add("screen-section"); const grid = node("div", "feature-cards"); grid.append(quickLink("Live Classes", `${live.length} available`, "◉", "live"), quickLink("Recorded Classes", `${classes.length} lessons`, "▶", "recorded"), quickLink("Study Material", `${pdfs.length} PDFs`, "▤", "pdfs"), quickLink("Test Series", `${testData.data?.length || 0} tests`, "▣", "tests"), quickLink("My Results", `${resultData.data?.length || 0} attempts`, "🏆", "results"), quickLink("Notifications", `${state.unread} unread`, "♧", "notifications")); access.append(grid); out.append(access);
    const upcoming = live.slice(0, 3); const liveSection = surface("Upcoming Classes"); liveSection.classList.add("screen-section");
    if (!upcoming.length) empty(liveSection, "No upcoming classes", "Your administrator’s published schedule will appear here.");
    else for (const row of upcoming) liveSection.append(cardRow(row.title, fmt(row.scheduled_start), "◉", row.status === "live" ? "LIVE" : "UPCOMING", btn(row.status === "live" ? "Join now" : "Details", () => nav("live"))));
    out.append(liveSection);
    if (!state.batches.length) { const note = node("div", "replay-note"); note.textContent = "No batch is assigned to this student account yet. Ask the academy administrator to assign one."; out.append(note); }
  }
  async function coursesPage(out) {
    const [categories, courses] = await Promise.all([
      checked(db.from("exam_categories").select("id,name,description,position").eq("is_active", true).order("position")),
      checked(db.from("courses").select("id,name,description,exam_category_id,is_active").eq("is_active", true).order("name"))
    ]);
    const catalog = surface("Defence Preparation"); const tabs = node("div", "admin-tabs"); let selected = "all"; const courseBox = node("div", "course-grid");
    const draw = () => {
      tabs.replaceChildren();
      [["all", "All"], ...categories.map((x) => [x.id, x.name])].forEach(([id, label]) => tabs.append(btn(label, () => { selected = id; draw(); }, selected !== id)));
      courseBox.replaceChildren(); const shown = courses.filter((course) => selected === "all" || course.exam_category_id === selected);
      if (!shown.length) empty(courseBox, "No courses published", "Your academy administrator can add Army, Navy, Air Force, NDA, CDS and other preparation courses.");
      for (const course of shown) { const category = categories.find((x) => x.id === course.exam_category_id)?.name || "Defence preparation"; const assigned = state.batches.some((batch) => batch.course_id === course.id); courseBox.append(cardRow(course.name, `${category} · ${course.description || "Course access is assigned by the academy."}`, "✦", assigned ? "MY BATCH" : "ACADEMY COURSE", assigned ? btn("Open batch", () => nav("live"), true) : null)); }
    };
    draw(); catalog.append(tabs, courseBox); out.append(catalog);
    const wrap = surface("My Batches");
    if (!state.batches.length) empty(wrap, "No batch assigned", "Contact the academy administrator to be assigned to a batch.");
    else for (const batch of state.batches) wrap.append(cardRow(batch.name || "Batch", batch.description || "Academy preparation batch", "♜", batch.is_active === false ? "INACTIVE" : "ACTIVE"));
    out.append(wrap);
    const access = surface("Learning Access"); access.classList.add("screen-section"); const grid = node("div", "feature-cards"); grid.append(quickLink("Live Classes", "Join your batch", "◉", "live"), quickLink("Recorded Classes", "Watch lessons", "▶", "recorded"), quickLink("Study Material", "Open PDFs", "▤", "pdfs")); access.append(grid); out.append(access);
  }
  function youtubeId(raw) {
    try { const u = new URL(raw); let id = u.hostname.includes("youtu.be") ? u.pathname.slice(1) : u.searchParams.get("v"); if (!id && /\/(?:live|embed)\//.test(u.pathname)) id = u.pathname.split("/").filter(Boolean).at(-1); return /^[\w-]{11}$/.test(id || "") ? id : null; } catch { return null; }
  }
  function loadYoutubeApi() {
    if (window.YT?.Player) return Promise.resolve(window.YT);
    if (!youtubeApiPromise) youtubeApiPromise = new Promise((resolve, reject) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { try { previous?.(); } finally { resolve(window.YT); } };
      const script = document.createElement("script"); script.src = "https://www.youtube.com/iframe_api"; script.async = true; script.onerror = () => { youtubeApiPromise = null; reject(new Error("Video progress service could not load.")); }; document.head.append(script);
    });
    return youtubeApiPromise;
  }
  function trackLesson(frame, lesson) {
    const handle = { player: null, timer: null, cancelled: false, savedAt: Number(lesson.progress?.watched_seconds || 0), completedAt: lesson.progress?.completed_at || null };
    const save = async (ended = false) => {
      if (!handle.player || !state.profile) return;
      let current = 0, duration = 0;
      try { current = Math.max(0, Math.floor(handle.player.getCurrentTime() || 0)); duration = Math.max(0, Math.floor(handle.player.getDuration() || 0)); } catch { return; }
      if (current === handle.savedAt && !ended) return;
      const complete = ended || (duration > 0 && current / duration >= 0.9);
      const completedAt = handle.completedAt || (complete ? new Date().toISOString() : null);
      try {
        const { error } = await db.from("class_progress").upsert({ student_id: state.profile.id, class_id: lesson.id, watched_seconds: current, completed_at: completedAt, updated_at: new Date().toISOString() }, { onConflict: "student_id,class_id" });
        if (error) throw error;
        handle.savedAt = current; handle.completedAt = completedAt;
      } catch (error) { console.warn("Video progress could not be saved:", error.message); }
    };
    const stop = () => { if (handle.timer) clearInterval(handle.timer); handle.timer = null; void save(); };
    state.videoCleanup.push(() => { handle.cancelled = true; stop(); try { handle.player?.destroy(); } catch {} });
    loadYoutubeApi().then((YT) => {
      if (handle.cancelled || !YT?.Player) return;
      handle.player = new YT.Player(frame.id, { events: {
        onReady: (event) => { if (handle.savedAt > 5) event.target.seekTo(handle.savedAt, true); },
        onStateChange: (event) => {
          if (event.data === YT.PlayerState.PLAYING && !handle.timer) handle.timer = setInterval(() => void save(), 15000);
          else if (event.data === YT.PlayerState.PAUSED) stop();
          else if (event.data === YT.PlayerState.ENDED) { if (handle.timer) clearInterval(handle.timer); handle.timer = null; void save(true); }
        }
      } });
    }).catch((error) => console.warn(error.message));
  }
  function youtubeFrame(url, title, lesson = null) {
    const id = youtubeId(url); if (!id) return null;
    const params = new URLSearchParams(); params.set("playsinline", "1");
    if (lesson) { params.set("enablejsapi", "1"); params.set("origin", window.location.origin); if (Number(lesson.progress?.watched_seconds) > 5) params.set("start", String(Math.floor(Number(lesson.progress.watched_seconds)))); }
    const frame = node("iframe", "video-frame"); frame.id = `jdc-video-${crypto.randomUUID()}`; frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?${params}`; frame.title = title; frame.loading = "lazy"; frame.referrerPolicy = "strict-origin-when-cross-origin"; frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"; frame.allowFullscreen = true;
    if (lesson) trackLesson(frame, lesson);
    return frame;
  }
  function openSafeUrl(url, target = "_blank") { try { const parsed = new URL(url); if (parsed.protocol !== "https:") throw new Error("Only secure video links can be opened."); window.open(parsed.href, target, "noopener,noreferrer"); } catch (error) { throw new Error(error.message || "This media link is not valid."); } }
  async function livePage(out) {
    const rows = await contentRows("live_sessions", "id,batch_id,subject_id,title,description,provider,live_url,status,scheduled_start,recorded_video_url", [["in", ["status", ["scheduled", "live"]]], ["order", ["scheduled_start", { ascending: true }]]]);
    const wrap = surface("Live Classes");
    if (!rows.length) empty(wrap, "No scheduled live class", "Your administrator’s published schedule will appear here.");
    for (const row of rows) {
      const card = cardRow(row.title, [row.description, fmt(row.scheduled_start)].filter(Boolean).join(" · "), "◉", row.status === "live" ? "LIVE" : "UPCOMING", row.live_url ? btn(row.status === "live" ? "Join class" : "Open class", () => openSafeUrl(row.live_url)) : null);
      if (row.status === "live") {
        const form = node("form", "private-comment"); const input = node("input"); input.placeholder = "Ask a private question to the academy"; input.maxLength = 1000; input.required = true; input.setAttribute("aria-label", "Private question for the academy administrator"); const send = node("button", "btn btn-quiet", "Send privately"); send.type = "submit"; const status = node("span", "small muted");
        form.append(input, send); form.addEventListener("submit", async (event) => { event.preventDefault(); send.disabled = true; try { await invoke("student-live-comment", { live_session_id: row.id, message: input.value.trim() }); input.value = ""; status.textContent = "Sent privately to the academy administrator."; } catch (error) { status.textContent = error.message || "Could not send your message."; } finally { send.disabled = false; } }); card.append(form, status);
      }
      wrap.append(card);
    }
    const replayRows = await contentRows("live_sessions", "id,title,description,status,actual_end,recorded_video_url", [["eq", ["status", "ended"]], ["not", ["recorded_video_url", "is", null]], ["order", ["actual_end", { ascending: false }]]]);
    if (replayRows.length) { const replay = surface("Past Live Classes"); replay.classList.add("screen-section"); for (const row of replayRows) replay.append(cardRow(row.title, row.description || fmt(row.actual_end), "▶", "REPLAY", btn("Watch replay", () => openSafeUrl(row.recorded_video_url)))); out.append(replay); }
    out.append(wrap);
  }
  async function recordedPage(out) {
    const [classes, replays, progress] = await Promise.all([
      contentRows("classes", "id,title,description,video_url,status,created_at", [["eq", ["status", "published"]], ["order", ["created_at", { ascending: false }]]]),
      contentRows("live_sessions", "id,title,description,recorded_video_url,status,actual_end", [["eq", ["status", "ended"]], ["not", ["recorded_video_url", "is", null]], ["order", ["actual_end", { ascending: false }]]]),
      checked(db.from("class_progress").select("class_id,watched_seconds,completed_at").eq("student_id", state.profile.id))
    ]);
    const progressByClass = new Map(progress.map((x) => [x.class_id, x]));
    const rows = [...classes.map((x) => ({ ...x, url: x.video_url, replay: false, progress: progressByClass.get(x.id) || null })), ...replays.map((x) => ({ ...x, url: x.recorded_video_url, replay: true }))];
    const wrap = surface("Recorded Classes"); const filter = node("input", "search"); filter.placeholder = "Search lessons"; filter.setAttribute("aria-label", "Search recorded lessons"); wrap.append(filter); const list = node("div", "list"); wrap.append(list);
    const paint = () => { cleanupVideoPlayers(); list.replaceChildren(); const shown = rows.filter((r) => `${r.title} ${r.description || ""}`.toLowerCase().includes(filter.value.toLowerCase())); if (!shown.length) return empty(list, "No recorded lessons", "Published lessons and live replays will appear here."); for (const row of shown) { const item = node("article", "list-row"); item.append(node("span", "list-icon", row.replay ? "◉" : "▶")); const body = node("div", "list-body"); const resume = row.progress?.watched_seconds ? `Continue from ${Math.floor(row.progress.watched_seconds / 60)}:${String(row.progress.watched_seconds % 60).padStart(2, "0")}` : row.replay ? "Live class replay" : "Recorded lesson"; body.append(node("strong", "", row.title), node("span", "", row.description || resume)); const frame = row.url && youtubeFrame(row.url, row.title, row.replay ? null : row); if (frame) body.append(frame); else if (row.url) body.append(btn("Open lesson", () => openSafeUrl(row.url), true)); item.append(body); if (row.replay) item.append(node("span", "badge", "REPLAY")); list.append(item); } };
    filter.addEventListener("input", paint); paint(); out.append(wrap);
  }
  async function pdfPage(out) {
    const rows = await contentRows("study_pdfs", "id,title,batch_id,subject_id,status,created_at", [["eq", ["status", "published"]], ["order", ["created_at", { ascending: false }]]]);
    const wrap = surface("Study Material"); const search = node("input", "search"); search.placeholder = "Search PDFs"; search.setAttribute("aria-label", "Search study PDFs"); wrap.append(search); const list = node("div", "list"); wrap.append(list);
    const paint = () => { list.replaceChildren(); const found = rows.filter((r) => `${r.title}`.toLowerCase().includes(search.value.toLowerCase())); if (!found.length) return empty(list, "No PDFs available", "Published study material for your batch will appear here."); for (const row of found) { const open = btn("Open PDF", async () => { const tab = window.open("about:blank", "_blank", "noopener,noreferrer"); try { const data = await invoke("student-pdf-link", { pdf_id: row.id }); if (!data.signed_url) throw new Error("Secure PDF link was not returned."); if (tab) tab.location = data.signed_url; else openSafeUrl(data.signed_url); } catch (error) { if (tab) tab.close(); setStatus("studentMessage", error.message || "Could not open PDF.", "error"); } }, true); list.append(cardRow(row.title, "PDF · Secure batch access", "▤", "PDF", open)); } };
    search.addEventListener("input", paint); paint(); out.append(wrap);
  }
  async function testPage(out) {
    if (state.attempt) return testRunner(out);
    const { data = [] } = await invoke("student-test", { action: "list" });
    const wrap = surface("Available Tests");
    if (!data.length) empty(wrap, "No test series available", "Published tests assigned to your batch will appear here.");
    for (const test of data) {
      const row = node("article", "test-card"); row.append(node("span", "test-mark", "▣")); const copy = node("div", "test-copy"); copy.append(node("strong", "", test.title), node("small", "", `${test.batch_name || "Your batch"} · ${test.duration_minutes} minutes${test.description ? ` · ${test.description}` : ""}`)); row.append(copy);
      const attempt = test.attempt; if (attempt?.status === "submitted") row.append(btn(`Score ${attempt.score ?? 0}/${attempt.max_score ?? 0}`, () => nav("results"), true)); else row.append(btn(attempt?.status === "in_progress" ? "Resume test" : "Start test", () => startTest(test.id)));
      wrap.append(row);
    }
    out.append(wrap);
  }
  async function startTest(id) {
    setStatus("studentMessage", "Opening your test…");
    try { const data = await invoke("student-test", { action: "start", test_series_id: id }); state.attempt = data; state.questionIndex = 0; state.review = new Set(data.review_questions || []); state.timeoutSent = false; if (data.expired) { await submitTest(true); return; } await testPage($("studentPageContent")); }
    catch (error) { setStatus("studentMessage", error.message || "Could not start this test.", "error"); }
  }
  function timeLeft() { return Math.max(0, Math.ceil((Date.parse(state.attempt?.expires_at || "") - Date.now()) / 1000)); }
  function testRunner(out) {
    const data = state.attempt; const questions = data.questions || []; if (!questions.length) { empty(out, "Test has no questions", "Ask the academy administrator to check this test."); return; }
    const wrap = surface(data.test?.title || "Test"); const status = node("div", "test-progress"); const progress = node("span"); const clock = node("strong", ""); const total = node("span"); status.append(progress, clock, total); wrap.append(status);
    const paintClock = () => { const secs = timeLeft(); clock.textContent = `Time left ${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(secs % 60).padStart(2, "0")}`; if (!secs && !state.busy && !state.timeoutSent) { state.timeoutSent = true; void submitTest(true); } };
    const q = questions[state.questionIndex]; const panel = node("section", "test-question"); panel.append(node("span", "eyebrow", `Question ${state.questionIndex + 1}`), node("h2", "", q.question_text));
    const options = Array.isArray(q.options) ? q.options : [];
    options.forEach((label, index) => { const item = node("label", "answer-option"); const radio = node("input"); radio.type = "radio"; radio.name = `question-${q.id}`; radio.checked = data.answers?.[q.id] !== undefined && Number(data.answers[q.id]) === index; const copy = node("span", "", String(label)); item.append(radio, copy); radio.addEventListener("change", async () => { radio.disabled = true; try { await invoke("student-test", { action: "save_answer", attempt_id: data.attempt.id, question_id: q.id, selected_option: index }); data.answers = { ...(data.answers || {}), [q.id]: index }; setStatus("studentMessage", "Answer saved.", "success"); } catch (error) { radio.checked = false; setStatus("studentMessage", error.message || "Could not save your answer.", "error"); } finally { radio.disabled = false; } }); panel.append(item); });
    const palette = node("div", "question-palette"); questions.forEach((item, itemIndex) => { const jump = btn(`${itemIndex + 1}${state.review.has(item.id) ? " ·" : ""}`, () => { state.questionIndex = itemIndex; testPage($("studentPageContent")); }, true); if (itemIndex === state.questionIndex) jump.classList.add("current"); if (data.answers?.[item.id] !== undefined) jump.classList.add("answered"); if (state.review.has(item.id)) jump.classList.add("review"); palette.append(jump); }); panel.append(palette);
    const actions = node("div", "test-actions"); const prev = btn("← Previous", () => { if (state.questionIndex > 0) { state.questionIndex--; testPage($("studentPageContent")); } }, true); prev.disabled = state.questionIndex === 0; const review = btn(state.review.has(q.id) ? "✓ Marked for review" : "Mark for review", async () => { review.disabled = true; const marked = !state.review.has(q.id); try { await invoke("student-test", { action: "save_answer", attempt_id: data.attempt.id, question_id: q.id, mark_for_review: marked }); if (marked) state.review.add(q.id); else state.review.delete(q.id); testPage($("studentPageContent")); } catch (error) { setStatus("studentMessage", error.message || "Could not save the review mark.", "error"); review.disabled = false; } }, true); const next = state.questionIndex < questions.length - 1 ? btn("Next →", () => { state.questionIndex++; testPage($("studentPageContent")); }) : btn("Submit test", () => confirmSubmit(), false); actions.append(prev, review, next); panel.append(actions); wrap.append(panel); out.replaceChildren(wrap);
    progress.textContent = `Question ${state.questionIndex + 1} of ${questions.length}`; const saved = Object.keys(data.answers || {}).length; total.textContent = `${saved} answered · ${state.review.size} to review`;
    paintClock(); if (state.timer) clearInterval(state.timer); state.timer = setInterval(paintClock, 1000);
  }
  async function confirmSubmit(auto = false) { if (auto || window.confirm("Submit this test now? Your answers will be scored after submission.")) await submitTest(auto); }
  async function submitTest(auto = false) {
    if (!state.attempt || state.busy) return; state.busy = true; setStatus("studentMessage", auto ? "Time ended. Submitting saved answers…" : "Submitting your test…");
    try { const result = await invoke("student-test", { action: "submit", attempt_id: state.attempt.attempt.id }); if (state.timer) clearInterval(state.timer); state.timer = null; state.attempt = null; setStatus("studentMessage", `Test submitted. Score: ${result.score}/${result.max_score}.`, "success"); await render("results"); }
    catch (error) { setStatus("studentMessage", error.message || "Could not submit your test.", "error"); }
    finally { state.busy = false; }
  }
  async function resultsPage(out) {
    const [{ data = [] }, progress] = await Promise.all([invoke("student-test", { action: "results" }), checked(db.from("class_progress").select("id,watched_seconds,completed_at").eq("student_id", state.profile.id))]);
    const total = data.length; const average = total ? Math.round(data.reduce((sum, item) => sum + Number(item.score || 0) / Math.max(1, Number(item.max_score || 0)) * 100, 0) / total) : 0; const best = total ? Math.max(...data.map((item) => Math.round(Number(item.score || 0) / Math.max(1, Number(item.max_score || 0)) * 100))) : 0;
    const grid = node("div", "four-metrics"); grid.append(metric("Tests attempted", total, "▣"), metric("Average score", `${average}%`, "◉"), metric("Highest score", `${best}%`, "🏆"), metric("Lessons completed", progress.filter((x) => x.completed_at).length, "▶")); out.append(grid);
    const subjectStats = new Map(); for (const item of data) { const subject = item.subject_name || "General"; const stats = subjectStats.get(subject) || { count: 0, scores: [] }; stats.count++; stats.scores.push(Math.round(Number(item.score || 0) / Math.max(1, Number(item.max_score || 0)) * 100)); subjectStats.set(subject, stats); }
    const subjects = surface("Subject Performance"); if (!subjectStats.size) empty(subjects, "No subject results yet", "Subject performance appears after a test is submitted."); for (const [subject, stats] of subjectStats) subjects.append(cardRow(subject, `${stats.count} test${stats.count === 1 ? "" : "s"} · average ${Math.round(stats.scores.reduce((sum, score) => sum + score, 0) / stats.scores.length)}%`, "▣")); out.append(subjects);
    const history = surface("Test History"); if (!data.length) empty(history, "No test results yet", "Your submitted tests and scores will appear here.");
    for (const item of data) { const percentage = Math.round(Number(item.score || 0) / Math.max(1, Number(item.max_score || 0)) * 100); history.append(cardRow(item.title, `${item.subject_name ? `${item.subject_name} · ` : ""}${fmt(item.submitted_at || item.started_at)} · ${percentage}%`, "🏆", "SUBMITTED", node("span", "result-score", `${item.score ?? 0}/${item.max_score ?? 0}`))); }
    out.append(history);
  }
  async function notificationPage(out) {
    const rows = await notifications(); await refreshNotificationState(rows); const wrap = surface("Academy Notifications");
    if (!rows.length) empty(wrap, "No announcements", "New academy notices will appear here.");
    for (const row of rows) {
      const read = state.reads.has(row.id); const card = cardRow(row.title, `${fmt(row.created_at)}${row.body ? ` · ${row.body}` : ""}`, "♧", read ? "READ" : "NEW", null, read ? "notification-row" : "notification-row unread");
      if (!read) card.append(btn("Mark read", async () => { try { const { error } = await db.from("notification_reads").upsert({ student_id: state.profile.id, announcement_id: row.id, read_at: new Date().toISOString() }, { onConflict: "student_id,announcement_id" }); if (error) throw error; state.reads.add(row.id); await refreshNotificationState(rows); await notificationPage(out); } catch (error) { setStatus("studentMessage", error.message || "Could not update notification state.", "error"); } }, true));
      wrap.append(card);
    }
    out.append(wrap);
  }
  async function profilePage(out) {
    const progress = await checked(db.from("class_progress").select("id,completed_at,watched_seconds").eq("student_id", state.profile.id));
    const header = node("section", "profile-hero"); header.append(node("span", "avatar", initials(state.profile.full_name || "Student"))); const identity = node("div"); identity.append(node("h2", "", state.profile.full_name || "Student"), node("p", "", `Student ID · ${state.profile.id.slice(0, 8).toUpperCase()}`)); header.append(identity); out.append(header);
    const details = surface("Account Details"); details.append(cardRow("Registered mobile", state.profile.phone || "On file", "▣")); details.append(cardRow("My batches", state.batches.map((x) => x.name).join(", ") || "No batch assigned", "♜")); details.append(cardRow("Lessons completed", String(progress.filter((x) => x.completed_at).length), "▶"));
    const form = node("form", "surface surface-pad screen-section"); form.append(node("h2", "", "Edit profile")); const wrap = node("div", "form-field"); const label = node("label", "", "Student name"); label.htmlFor = "studentName"; const input = node("input"); input.id = "studentName"; input.value = state.profile.full_name || ""; input.required = true; input.maxLength = 100; wrap.append(label, input); const save = node("button", "btn", "Save profile"); save.type = "submit"; form.append(wrap, save);
    form.addEventListener("submit", async (event) => { event.preventDefault(); const name = input.value.trim(); if (name.length < 2) return setStatus("studentMessage", "Enter your name.", "error"); save.disabled = true; try { const { data, error } = await db.from("profiles").update({ full_name: name }).eq("id", state.profile.id).select("id,full_name,phone,role,is_active").single(); if (error) throw error; state.profile = data; $("studentAvatar").textContent = initials(name); setStatus("studentMessage", "Profile saved.", "success"); out.replaceChildren(); await profilePage(out); } catch (error) { setStatus("studentMessage", error.message || "Could not save profile.", "error"); } finally { save.disabled = false; } });
    details.append(form); out.append(details);
    const help = surface("Help & Support"); const settings = state.academySettings; const academyName = settings.academy_name || "the academy";
    if (settings.support_email) { const link = node("a", "btn btn-quiet", "Email support"); link.href = `mailto:${settings.support_email}`; help.append(cardRow(academyName, settings.support_email, "✉", "SUPPORT", link)); }
    if (settings.support_phone) { const link = node("a", "btn btn-quiet", "Call support"); link.href = `tel:${settings.support_phone.replace(/[^+\d]/g, "")}`; help.append(cardRow("Academy phone", settings.support_phone, "☎", "SUPPORT", link)); }
    if (!settings.support_email && !settings.support_phone) help.append(cardRow("Contact the academy", `Ask your batch administrator for help with ${academyName} account or access.`, "☎")); out.append(help);
  }
  async function render(view) {
    cleanupVideoPlayers();
    const out = $("studentPageContent"); if (!out || !state.profile) return; out.replaceChildren(); setStatus("studentMessage");
    const loading = node("div", "empty-state"); loading.append(node("div", "", "Loading your academy data…")); out.append(loading);
    try {
      const pages = { home: homePage, courses: coursesPage, live: livePage, recorded: recordedPage, pdfs: pdfPage, tests: testPage, results: resultsPage, notifications: notificationPage, profile: profilePage };
      await (pages[view] || homePage)(out);
    } catch (error) { showError(out, "Could not load this section", error.message || "Refresh the page or contact your academy administrator."); setStatus("studentMessage", error.message || "A request failed.", "error"); }
  }

  $("phoneForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const phone = $("phoneInput").value.trim();
    if (!db) return setStatus("loginMessage", "Login service could not load. Check your connection and try again.", "error");
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) return setStatus("loginMessage", "Enter the registered number with country code, for example +91XXXXXXXXXX.", "error");
    const button = $("sendOtpButton"); button.disabled = true; button.textContent = "Sending OTP…";
    try { const { error } = await db.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } }); if (error) throw error; $("otpForm").classList.remove("hidden"); setStatus("loginMessage", "OTP request accepted. Check your phone for the SMS code.", "success"); }
    catch (error) { const message = error.message || "Could not send OTP."; setStatus("loginMessage", /sms|provider|phone/i.test(message) ? `${message} Student SMS sign-in requires an enabled Supabase SMS provider.` : message, "error"); }
    finally { button.disabled = false; button.innerHTML = 'Send OTP <span aria-hidden="true">→</span>'; }
  });
  $("otpForm").addEventListener("submit", async (event) => {
    event.preventDefault(); const phone = $("phoneInput").value.trim(), token = $("otpInput").value.trim(); if (!/^\d{6}$/.test(token)) return setStatus("loginMessage", "Enter the 6 digit SMS code.", "error");
    const button = $("verifyOtpButton"); button.disabled = true; button.textContent = "Verifying…";
    try { const { data, error } = await db.auth.verifyOtp({ phone, token, type: "sms" }); if (error) throw error; await loadIdentity(data.session?.user); }
    catch (error) { setStatus("loginMessage", error.message || "OTP could not be verified.", "error"); }
    finally { button.disabled = false; button.textContent = "Verify and sign in"; }
  });
  $("changeNumberButton").addEventListener("click", () => { $("otpForm").classList.add("hidden"); $("otpInput").value = ""; setStatus("loginMessage", "Enter the registered mobile number again."); });
  $("signOutButton").addEventListener("click", async () => { if (state.timer) clearInterval(state.timer); await db.auth.signOut(); state.profile = null; state.academySettings = {}; state.userId = ""; state.attempt = null; $("studentApp").classList.add("hidden"); $("loginScreen").classList.remove("hidden"); $("otpForm").classList.add("hidden"); $("phoneInput").value = ""; $("otpInput").value = ""; });
  document.querySelectorAll("[data-view]").forEach((element) => element.addEventListener("click", () => nav(element.dataset.view)));
  if (db) { db.auth.onAuthStateChange((_event, session) => { if (session?.user) void loadIdentity(session.user); else if (!$("studentApp").classList.contains("hidden")) { state.profile = null; state.userId = ""; $("studentApp").classList.add("hidden"); $("loginScreen").classList.remove("hidden"); } }); db.auth.getSession().then(({ data }) => { if (data.session?.user) void loadIdentity(data.session.user); }).catch(() => {}); }
})();
