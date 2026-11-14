/*
 * JDC isolated browser preview. Activated only by ?demo=student or ?demo=admin.
 * It never connects to Supabase, and all changes stay in this browser's local
 * storage / IndexedDB. Remove the query string to use real Auth and Supabase.
 */
(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const role = params.get("demo");
  if (!["student", "admin"].includes(role)) return;

  const KEY = "jdc.preview.workspace.v1";
  const now = () => new Date().toISOString();
  const id = (prefix = "preview") => `${prefix}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
  const copy = (value) => value == null ? value : JSON.parse(JSON.stringify(value));
  const uuidLike = (value) => typeof value === "string" && value.length > 0;
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString();

  function seed() {
    const created = now();
    const adminId = "preview-owner";
    const studentId = "preview-student";
    const categoryId = "preview-nda";
    const courseId = "preview-nda-course";
    const batchId = "preview-nda-batch";
    const subjectId = "preview-polity";
    const chapterId = "preview-constitution";
    const facultyId = "preview-faculty";
    const classId = "preview-recorded-class";
    const liveId = "preview-live-class";
    const testId = "preview-test";
    const announcementId = "preview-notice";
    return {
      tables: {
        profiles: [
          { id: adminId, full_name: "JDC Owner (Preview)", phone: null, role: "admin", is_active: true, created_at: created },
          { id: studentId, full_name: "Demo Student", phone: "+919000000001", role: "student", is_active: true, created_at: created },
        ],
        academy_settings: [{ id: true, academy_name: "JOSHI DEFENCE CLASSES", tagline: "YOUR DREAM · OUR MISSION", support_email: "", support_phone: "", logo_url: null, updated_at: created }],
        exam_categories: [{ id: categoryId, name: "NDA", description: "National Defence Academy entrance preparation", position: 1, is_active: true, created_at: created }],
        courses: [{ id: courseId, exam_category_id: categoryId, name: "NDA Foundation", description: "A preview course for the JDC student and admin workflows.", is_active: true, created_at: created }],
        faculty: [{ id: facultyId, full_name: "JDC Faculty (Preview)", bio: "Add the academy faculty profile from the real admin account.", is_active: true, created_at: created }],
        subjects: [{ id: subjectId, course_id: courseId, name: "Indian Polity", description: "Constitution and governance", created_at: created }],
        chapters: [{ id: chapterId, subject_id: subjectId, title: "Fundamental Rights", position: 1, is_active: true, created_at: created }],
        batches: [
          { id: batchId, name: "NDA Foundation · Preview", description: "Local preview batch for student content access.", is_active: true, course_id: courseId, lead_faculty_id: facultyId, price_inr: 0, is_purchasable: false, created_at: created },
          { id: "preview-buy-batch", name: "CDS Batch · UPI Flow Preview", description: "Sample ₹1 fee. Do not transfer money; the demo QR cannot accept payment.", is_active: true, course_id: courseId, lead_faculty_id: facultyId, price_inr: 1, is_purchasable: true, created_at: created },
        ],
        enrollments: [{ id: "preview-enrollment", student_id: studentId, batch_id: batchId, created_at: created }],
        classes: [{ id: classId, batch_id: batchId, subject_id: subjectId, chapter_id: chapterId, faculty_id: facultyId, title: "YouTube player check · Preview lesson", description: "A sample player check. Replace this URL with your own recorded JDC lecture before using the real portal.", video_url: "https://www.youtube.com/watch?v=M7lc1UVf-VE", status: "published", published_at: created, created_at: created }],
        live_sessions: [{ id: liveId, batch_id: batchId, subject_id: subjectId, chapter_id: chapterId, faculty_id: facultyId, title: "Indian Polity · Live class setup preview", description: "Add your actual YouTube Live URL and switch the status to Live from the Admin preview.", live_url: "", recorded_video_url: "", provider: "youtube_live", scheduled_start: day(1), status: "scheduled", actual_start: null, actual_end: null, created_at: created }],
        study_pdfs: [{ id: "preview-pdf", batch_id: batchId, subject_id: subjectId, chapter_id: chapterId, title: "Fundamental Rights · Sample notes.pdf", storage_path: "preview/sample-notes.pdf", status: "published", created_at: created }],
        test_series: [{ id: testId, batch_id: batchId, subject_id: subjectId, chapter_id: chapterId, title: "NDA Polity · Preview test", description: "Three sample questions to try the real test workflow.", duration_minutes: 15, is_published: true, available_from: null, available_until: null, created_at: created }],
        test_questions: [
          { id: "preview-q1", test_series_id: testId, question_text: "Which part of the Constitution of India contains Fundamental Rights?", options: ["Part II", "Part III", "Part IV", "Part V"], correct_option: 1, marks: 1, position: 1 },
          { id: "preview-q2", test_series_id: testId, question_text: "Article 21 protects which right?", options: ["Equality before law", "Freedom of religion", "Life and personal liberty", "Education only"], correct_option: 2, marks: 1, position: 2 },
          { id: "preview-q3", test_series_id: testId, question_text: "Who is the constitutional head of the Union executive?", options: ["Prime Minister", "President of India", "Chief Justice of India", "Speaker of Lok Sabha"], correct_option: 1, marks: 1, position: 3 },
        ],
        test_attempts: [], test_answers: [], class_progress: [],
        announcements: [{ id: announcementId, title: "Welcome to the JDC preview", body: "Try the student modules. Changes made in preview stay on this browser and do not publish to the real academy.", target_batch_id: batchId, is_published: true, scheduled_at: null, created_at: created }],
        notification_reads: [],
        live_session_comments: [],
        payment_settings: [{ id: true, upi_vpa: "preview-not-payable@upi", payee_name: "JDC Preview · Not payable", qr_storage_path: "preview-only", instructions: "This is a local preview. Do not transfer money. Enter any sample UTR to try the request and owner approval screens.", updated_at: created }],
        manual_payment_requests: [],
      },
      activeAttemptByStudent: {},
    };
  }

  function readStore() {
    try {
      const parsed = JSON.parse(localStorage.getItem(KEY) || "null");
      if (parsed?.tables && parsed.tables.profiles?.some((p) => p.id === "preview-owner")) return parsed;
    } catch { /* start a clean isolated preview */ }
    const initial = seed();
    localStorage.setItem(KEY, JSON.stringify(initial));
    return initial;
  }
  let store = readStore();
  function persist() { localStorage.setItem(KEY, JSON.stringify(store)); }
  function rows(table) { if (!store.tables[table]) store.tables[table] = []; return store.tables[table]; }
  const actorId = role === "admin" ? "preview-owner" : "preview-student";
  const actor = () => rows("profiles").find((p) => p.id === actorId);
  const authUser = () => ({ id: actorId, phone: actor()?.phone || null, email: role === "admin" ? "owner@preview.local" : null, app_metadata: {}, user_metadata: {} });
  let signedIn = true;
  let authListener = null;

  function error(message, code = "PREVIEW_ERROR") { return { message, code }; }
  function result(data, extra = {}) { return { data: copy(data), error: null, ...extra }; }

  function permitted(table, row) {
    if (role === "admin") return true;
    const student = actor();
    const assigned = rows("enrollments").filter((e) => e.student_id === student?.id).map((e) => e.batch_id);
    if (table === "profiles") return row.id === student?.id;
    if (table === "enrollments") return row.student_id === student?.id;
    if (["class_progress", "notification_reads", "manual_payment_requests"].includes(table)) return row.student_id === student?.id;
    if (["classes", "live_sessions", "study_pdfs", "test_series"].includes(table)) return assigned.includes(row.batch_id) && (table === "classes" ? row.status === "published" : table === "study_pdfs" ? row.status === "published" : table === "test_series" ? row.is_published === true : ["scheduled", "live", "ended"].includes(row.status));
    if (table === "announcements") return row.is_published === true && (!row.target_batch_id || assigned.includes(row.target_batch_id)) && (!row.scheduled_at || Date.parse(row.scheduled_at) <= Date.now());
    if (table === "batches") return row.is_active === true && row.is_purchasable === true;
    if (table === "live_session_comments" || table === "test_questions" || table === "test_answers" || table === "test_attempts") return false;
    return true;
  }

  function project(table, row, selection) {
    const output = copy(row);
    if (table === "enrollments" && /batches\s*\(/.test(selection || "")) output.batches = copy(rows("batches").find((batch) => batch.id === row.batch_id) || null);
    return output;
  }

  class Query {
    constructor(table) { this.table = table; this.action = "select"; this.filters = []; this.selection = "*"; this.options = {}; this.orderBy = null; this.singleMode = "many"; this.values = null; }
    select(fields = "*", options = {}) { this.selection = fields; this.options = options || {}; if (this.action === "select") this.action = "select"; return this; }
    eq(key, value) { this.filters.push((row) => row?.[key] === value || String(row?.[key]) === String(value)); return this; }
    neq(key, value) { this.filters.push((row) => row?.[key] !== value && String(row?.[key]) !== String(value)); return this; }
    is(key, value) { this.filters.push((row) => value === null ? row?.[key] == null : row?.[key] === value); return this; }
    not(key, operator, value) {
      this.filters.push((row) => {
        const actual = row?.[key];
        if (operator === "is") return value === null ? actual != null : actual !== value;
        if (operator === "eq") return actual !== value && String(actual) !== String(value);
        if (operator === "neq") return actual === value || String(actual) === String(value);
        return false;
      });
      return this;
    }
    in(key, values) { const set = new Set(values || []); this.filters.push((row) => set.has(row?.[key])); return this; }
    order(key, options = {}) { this.orderBy = [key, options.ascending !== false]; return this; }
    limit(value) { this.maxRows = Number(value); return this; }
    maybeSingle() { this.singleMode = "maybe"; return this; }
    single() { this.singleMode = "single"; return this; }
    update(data) { this.action = "update"; this.values = data || {}; return this; }
    insert(data) { this.action = "insert"; this.values = data; return this; }
    upsert(data, options = {}) { this.action = "upsert"; this.values = data; this.onConflict = options.onConflict || "id"; return this; }
    delete() { this.action = "delete"; return this; }
    then(resolve, reject) { return this.execute().then(resolve, reject); }
    async execute() {
      if (this.action === "select" && role !== "admin" && this.table === "manual_payment_requests" && !signedIn) return { data: null, error: error("Preview session has ended.") };
      let tableRows = rows(this.table);
      const candidates = tableRows.filter((row) => permitted(this.table, row) && this.filters.every((test) => test(row)));
      if (this.action === "select") {
        let selected = candidates;
        if (this.orderBy) { const [key, ascending] = this.orderBy; selected = [...selected].sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? "")) * (ascending ? 1 : -1)); }
        if (Number.isFinite(this.maxRows)) selected = selected.slice(0, this.maxRows);
        const data = selected.map((row) => project(this.table, row, this.selection));
        if (this.options.head) return { data: null, error: null, count: candidates.length };
        if (this.singleMode === "single") return data.length === 1 ? result(data[0]) : { data: null, error: error(data.length ? "Multiple rows returned" : "No rows found", "PGRST116") };
        if (this.singleMode === "maybe") return result(data[0] || null);
        return result(data);
      }
      if (this.action === "delete") {
        if (role !== "admin" && this.table !== "class_progress" && this.table !== "notification_reads") return { data: null, error: error("This preview role cannot delete this record.", "42501") };
        const removed = candidates.map(copy);
        store.tables[this.table] = tableRows.filter((row) => !candidates.includes(row)); persist();
        return result(removed);
      }
      if (this.action === "update") {
        if (role !== "admin" && !["profiles", "class_progress", "notification_reads"].includes(this.table)) return { data: null, error: error("This preview role cannot update this record.", "42501") };
        const updated = candidates.map((row) => { Object.assign(row, copy(this.values)); return copy(row); }); persist();
        if (this.singleMode === "single") return updated.length === 1 ? result(updated[0]) : { data: null, error: error("No rows found", "PGRST116") };
        return result(updated);
      }
      const inputRows = Array.isArray(this.values) ? this.values : [this.values || {}];
      const saved = [];
      for (const input of inputRows) {
        if (role !== "admin" && this.table !== "class_progress" && this.table !== "notification_reads") return { data: null, error: error("This preview role cannot create this record.", "42501") };
        const keys = String(this.onConflict || "id").split(",").map((x) => x.trim()).filter(Boolean);
        const existing = this.action === "upsert" ? tableRows.find((row) => keys.every((key) => row[key] === input[key])) : null;
        if (existing) { Object.assign(existing, copy(input)); saved.push(copy(existing)); }
        else { const item = { id: input.id ?? id(this.table), created_at: input.created_at || now(), ...copy(input) }; tableRows.push(item); saved.push(copy(item)); }
      }
      persist();
      if (this.singleMode === "single") return result(saved[0]);
      return result(saved);
    }
  }

  function currentBatchIds() { return rows("enrollments").filter((x) => x.student_id === actorId).map((x) => x.batch_id); }
  function isStudentEnrolled(studentId, batchId) { return rows("enrollments").some((e) => e.student_id === studentId && e.batch_id === batchId); }
  function sanitizeQuestion(row) { const { correct_option, ...visible } = row; return copy(visible); }
  function testResponse(attempt) {
    const test = rows("test_series").find((x) => x.id === attempt.test_series_id);
    const questions = rows("test_questions").filter((x) => x.test_series_id === test?.id).sort((a, b) => a.position - b.position);
    const answers = Object.fromEntries(rows("test_answers").filter((x) => x.attempt_id === attempt.id && x.selected_option !== null && x.selected_option !== undefined).map((x) => [x.question_id, x.selected_option]));
    const review_questions = rows("test_answers").filter((x) => x.attempt_id === attempt.id && x.mark_for_review).map((x) => x.question_id);
    return { test: copy(test), attempt: copy(attempt), questions: questions.map(sanitizeQuestion), answers, review_questions, expires_at: attempt.expires_at, duration_minutes: test?.duration_minutes || 15, expired: Date.parse(attempt.expires_at) <= Date.now() };
  }
  function makePdf() {
    const stream = [
      "BT", "/F1 20 Tf", "72 740 Td", "(JOSHI DEFENCE CLASSES) Tj", "/F1 15 Tf", "0 -36 Td", "(Preview Study Material) Tj", "/F1 12 Tf", "0 -42 Td", "(Fundamental Rights - quick revision) Tj", "0 -24 Td", "(Article 14: equality before law.) Tj", "0 -20 Td", "(Article 19: key freedoms guaranteed by the Constitution.) Tj", "0 -20 Td", "(Article 21: protection of life and personal liberty.) Tj", "0 -36 Td", "(This sample PDF is stored only in your browser preview.) Tj", "ET",
    ].join("\n");
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let pdf = "%PDF-1.4\n"; const offsets = [0];
    objects.forEach((object, index) => { offsets.push(new TextEncoder().encode(pdf).length); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = new TextEncoder().encode(pdf).length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  }

  const indexedFiles = (() => {
    let databasePromise;
    function open() {
      if (typeof indexedDB === "undefined" || !indexedDB) return Promise.reject(new Error("Browser file storage is unavailable."));
      if (!databasePromise) databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open("jdc-preview-files", 1);
        request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains("files")) request.result.createObjectStore("files", { keyPath: "path" }); };
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error || new Error("Could not open preview file storage."));
      });
      return databasePromise;
    }
    async function change(mode, operation) {
      const db = await open();
      return new Promise((resolve, reject) => { const tx = db.transaction("files", mode); const store = tx.objectStore("files"); const req = operation(store); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); tx.onerror = () => reject(tx.error); });
    }
    return {
      put: (value) => change("readwrite", (store) => store.put(value)),
      get: (path) => change("readonly", (store) => store.get(path)),
      remove: (path) => change("readwrite", (store) => store.delete(path)),
      async clear() {
        try { const db = await open(); db.close(); databasePromise = null; } catch { databasePromise = null; }
        if (typeof indexedDB === "undefined" || !indexedDB) return;
        await new Promise((resolve) => { const request = indexedDB.deleteDatabase("jdc-preview-files"); request.onsuccess = resolve; request.onerror = resolve; request.onblocked = resolve; });
      },
    };
  })();

  async function invokeFunction(name, body = {}) {
    if (!signedIn) return { data: null, error: error("Preview session has ended. Choose a preview role to continue.", "401") };
    if (name === "admin-manage-data") {
      if (role !== "admin") return { data: null, error: error("Admin preview access is required.", "403") };
      const { action, table, id: recordId, data } = body;
      if (action === "list") {
        let found = copy(rows(table));
        if (table === "manual_payment_requests") found.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        if (table === "live_session_comments") found.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return result({ data: found });
      }
      if (table === "live_session_comments" || table === "manual_payment_requests" || table === "test_attempts" || table === "notification_reads") return { data: null, error: error(`${table} is read-only from this preview action.`) };
      if (table === "academy_settings" || table === "payment_settings") {
        if (action !== "update") return { data: null, error: error("Settings can only be updated.") };
        const row = rows(table)[0]; Object.assign(row, copy(data || {}), { updated_at: now() }); persist(); return result({ data: row });
      }
      if (!["create", "update", "delete"].includes(action)) return { data: null, error: error("Unsupported preview action.") };
      if (action === "delete") {
        store.tables[table] = rows(table).filter((row) => row.id !== recordId); persist(); return result({ success: true });
      }
      if (action === "create") {
        if (table === "profiles") return { data: null, error: error("Use Add student so a local preview account is created.") };
        const [created] = rows(table).concat([]);
        const next = { id: data?.id || id(table), created_at: data?.created_at || now(), ...copy(data || {}) };
        rows(table).push(next); persist(); return result({ data: next });
      }
      const row = rows(table).find((item) => item.id === recordId);
      if (!row) return { data: null, error: error("Record not found.", "PGRST116") };
      Object.assign(row, copy(data || {})); persist(); return result({ data: row });
    }
    if (name === "admin-create-student") {
      if (role !== "admin") return { data: null, error: error("Admin preview access is required.", "403") };
      const fullName = String(body.full_name || "").trim(); const phone = String(body.phone || "").trim();
      if (fullName.length < 2 || !/^\+[1-9]\d{7,14}$/.test(phone)) return { data: { error: "Enter a name and a valid international phone number." }, error: null };
      if (rows("profiles").some((p) => p.phone === phone)) return { data: { error: "A preview student already uses this mobile number." }, error: null };
      const profile = { id: id("preview-student"), full_name: fullName, phone, role: "student", is_active: true, created_at: now() };
      rows("profiles").push(profile); persist(); return result({ user_id: profile.id, message: "Local preview student created. Real Auth credentials are not issued in preview mode." });
    }
    if (name === "student-test") {
      if (role !== "student") return { data: null, error: error("Student preview access is required.", "403") };
      const { action } = body; const studentId = actorId;
      if (action === "list") {
        const available = rows("test_series").filter((test) => currentBatchIds().includes(test.batch_id) && test.is_published === true && (!test.available_from || Date.parse(test.available_from) <= Date.now()) && (!test.available_until || Date.parse(test.available_until) >= Date.now()));
        return result({ data: available.map((test) => { const attempt = rows("test_attempts").find((a) => a.student_id === studentId && a.test_series_id === test.id); return { ...copy(test), batch_name: rows("batches").find((b) => b.id === test.batch_id)?.name || "", attempt: copy(attempt || null) }; }) });
      }
      if (action === "results") {
        const submitted = rows("test_attempts").filter((a) => a.student_id === studentId && a.status === "submitted");
        return result({ data: submitted.map((attempt) => { const test = rows("test_series").find((t) => t.id === attempt.test_series_id); return { ...copy(attempt), title: test?.title || "Test", subject_name: rows("subjects").find((s) => s.id === test?.subject_id)?.name || "General" }; }) });
      }
      if (action === "start") {
        const test = rows("test_series").find((x) => x.id === body.test_series_id && currentBatchIds().includes(x.batch_id) && x.is_published === true);
        if (!test) return { data: { error: "This test is not available for your preview batch." }, error: null };
        let attempt = rows("test_attempts").find((a) => a.student_id === studentId && a.test_series_id === test.id);
        if (attempt?.status === "submitted") return { data: { error: "This test has already been submitted." }, error: null };
        if (!attempt) { const started = Date.now(); attempt = { id: id("preview-attempt"), student_id: studentId, test_series_id: test.id, status: "in_progress", started_at: new Date(started).toISOString(), expires_at: new Date(started + Number(test.duration_minutes || 15) * 60000).toISOString(), score: null, max_score: rows("test_questions").filter((q) => q.test_series_id === test.id).reduce((sum, q) => sum + Number(q.marks || 1), 0) }; rows("test_attempts").push(attempt); persist(); }
        return result(testResponse(attempt));
      }
      if (action === "save_answer") {
        const attempt = rows("test_attempts").find((a) => a.id === body.attempt_id && a.student_id === studentId && a.status === "in_progress");
        const question = rows("test_questions").find((q) => q.id === body.question_id && q.test_series_id === attempt?.test_series_id);
        if (!attempt || !question) return { data: { error: "This question or test attempt is no longer available." }, error: null };
        let saved = rows("test_answers").find((a) => a.attempt_id === attempt.id && a.question_id === question.id);
        if (!saved) { saved = { id: id("preview-answer"), attempt_id: attempt.id, question_id: question.id, selected_option: null, mark_for_review: false }; rows("test_answers").push(saved); }
        if (Number.isInteger(body.selected_option)) saved.selected_option = body.selected_option;
        if (typeof body.mark_for_review === "boolean") saved.mark_for_review = body.mark_for_review;
        persist(); return result({ success: true });
      }
      if (action === "submit") {
        const attempt = rows("test_attempts").find((a) => a.id === body.attempt_id && a.student_id === studentId && a.status === "in_progress");
        if (!attempt) return { data: { error: "This test attempt is not active." }, error: null };
        const questions = rows("test_questions").filter((q) => q.test_series_id === attempt.test_series_id);
        const answers = rows("test_answers").filter((a) => a.attempt_id === attempt.id);
        const answerMap = new Map(answers.map((a) => [a.question_id, a]));
        let score = 0; let maxScore = 0;
        for (const question of questions) { maxScore += Number(question.marks || 1); const answer = answerMap.get(question.id); if (answer && Number(answer.selected_option) === Number(question.correct_option)) { score += Number(question.marks || 1); answer.is_correct = true; answer.marks_awarded = Number(question.marks || 1); } else if (answer) { answer.is_correct = false; answer.marks_awarded = 0; } }
        attempt.status = "submitted"; attempt.submitted_at = now(); attempt.score = score; attempt.max_score = maxScore; persist();
        return result({ score, max_score: maxScore, submitted_at: attempt.submitted_at });
      }
      return { data: { error: "Unsupported test action." }, error: null };
    }
    if (name === "student-live-comment") {
      if (role !== "student") return { data: null, error: error("Student preview access is required.", "403") };
      const session = rows("live_sessions").find((x) => x.id === body.live_session_id && currentBatchIds().includes(x.batch_id) && x.status === "live");
      const message = String(body.message || "").trim();
      if (!session || message.length < 1 || message.length > 1000) return { data: { error: "Questions can be sent only to a running live class (maximum 1,000 characters)." }, error: null };
      const comment = { id: id("preview-question"), live_session_id: session.id, student_id: actorId, message, created_at: now() };
      rows("live_session_comments").push(comment); persist(); return result({ success: true, id: comment.id });
    }
    if (name === "student-pdf-link") {
      if (role !== "student") return { data: null, error: error("Student preview access is required.", "403") };
      const pdf = rows("study_pdfs").find((x) => x.id === body.pdf_id && currentBatchIds().includes(x.batch_id) && x.status === "published");
      if (!pdf) return { data: { error: "This PDF is not available in your preview batch." }, error: null };
      let stored = await indexedFiles.get(`study-pdfs/${pdf.storage_path}`).catch(() => null);
      if (!stored) stored = { file: makePdf(), name: pdf.title };
      const signed_url = URL.createObjectURL(stored.file instanceof Blob ? stored.file : new Blob([stored.file], { type: "application/pdf" }));
      return result({ signed_url });
    }
    if (name === "student-manual-payment") {
      if (role !== "student") return { data: null, error: error("Student preview access is required.", "403") };
      const batch = rows("batches").find((x) => x.id === body.batch_id && x.is_active && x.is_purchasable && Number(x.price_inr) > 0);
      if (!batch) return { data: { error: "This batch is not open for purchase. The admin must set a fee and enable purchase first." }, error: null };
      if (isStudentEnrolled(actorId, batch.id)) return { data: { error: "You already have access to this batch." }, error: null };
      const reference = String(body.payment_reference || "").trim().toUpperCase();
      if (reference.length < 8 || reference.length > 64) return { data: { error: "Enter the UPI transaction reference (8–64 characters)." }, error: null };
      if (rows("manual_payment_requests").some((x) => x.payment_reference.toLowerCase() === reference.toLowerCase())) return { data: { error: "This transaction reference is already attached to a request." }, error: null };
      if (rows("manual_payment_requests").some((x) => x.student_id === actorId && x.batch_id === batch.id && x.status === "pending")) return { data: { error: "A payment request for this batch is already awaiting review." }, error: null };
      const request = { id: id("preview-payment"), student_id: actorId, batch_id: batch.id, amount_inr: Number(batch.price_inr), payment_reference: reference, payer_name: String(body.payer_name || "").trim().slice(0, 120) || null, student_note: String(body.student_note || "").trim().slice(0, 500) || null, status: "pending", admin_note: null, reviewed_by: null, reviewed_at: null, created_at: now() };
      rows("manual_payment_requests").push(request); persist(); return result({ request, message: "Preview request saved. Admin approval only changes this browser's preview data." });
    }
    if (name === "admin-review-manual-payment") {
      if (role !== "admin") return { data: null, error: error("Admin preview access is required.", "403") };
      const request = rows("manual_payment_requests").find((x) => x.id === body.request_id && x.status === "pending");
      if (!request) return { data: { error: "Pending request not found; it may already have been reviewed." }, error: null };
      if (!["approved", "rejected"].includes(body.decision)) return { data: { error: "Choose approve or reject." }, error: null };
      request.status = body.decision; request.admin_note = String(body.admin_note || "").trim().slice(0, 500) || null; request.reviewed_by = actorId; request.reviewed_at = now();
      if (body.decision === "approved" && !isStudentEnrolled(request.student_id, request.batch_id)) rows("enrollments").push({ id: id("preview-enrollment"), student_id: request.student_id, batch_id: request.batch_id, manual_payment_request_id: request.id, created_at: now() });
      persist(); return result({ id: request.id, status: request.status, student_id: request.student_id, batch_id: request.batch_id });
    }
    return { data: null, error: error(`No preview implementation exists for ${name}.`) };
  }

  const client = {
    isPreview: true,
    from(table) { return new Query(table); },
    auth: {
      async getSession() { return { data: { session: signedIn ? { access_token: "local-preview-session", refresh_token: "local-preview-refresh", user: authUser() } : null }, error: null }; },
      async getUser() { return { data: { user: signedIn ? authUser() : null }, error: null }; },
      onAuthStateChange(callback) { authListener = callback; return { data: { subscription: { unsubscribe() { if (authListener === callback) authListener = null; } } } }; },
      async signOut() { signedIn = false; authListener?.("SIGNED_OUT", null); return { error: null }; },
      async signInWithPassword() { return { data: null, error: error("The preview login is separate from academy authentication. Remove ?demo=admin to use the real owner login.", "PREVIEW_ONLY") }; },
      async signInWithOtp() { return { data: null, error: error("SMS OTP is not sent in preview mode. Use the preview role link or remove ?demo=student for real OTP login.", "PREVIEW_ONLY") }; },
      async verifyOtp() { return { data: null, error: error("SMS OTP verification is not available in local preview mode.", "PREVIEW_ONLY") }; },
      async resetPasswordForEmail() { return { data: null, error: error("Password recovery is not used by local preview mode.", "PREVIEW_ONLY") }; },
    },
    functions: { async invoke(name, options = {}) { return invokeFunction(name, options.body || {}); } },
    storage: {
      from(bucket) {
        return {
          async upload(path, file) {
            if (role !== "admin") return { data: null, error: error("Admin preview access is required.", "403") };
            if (!(file instanceof Blob) || file.size > 8 * 1024 * 1024) return { data: null, error: error("Preview file storage supports files up to 8 MB.") };
            try { await indexedFiles.put({ path: `${bucket}/${path}`, file, name: file.name || path, type: file.type || "application/octet-stream" }); return { data: { path }, error: null }; }
            catch (e) { return { data: null, error: error(e.message || "Could not store this file in this browser.") }; }
          },
          async remove(paths) { if (role !== "admin") return { data: null, error: error("Admin preview access is required.", "403") }; await Promise.all((paths || []).map((path) => indexedFiles.remove(`${bucket}/${path}`))); return { data: paths || [], error: null }; },
        };
      },
    },
  };
  const original = window.supabase;
  window.JDC_DEMO_MODE = role;
  window.supabase = { ...(original || {}), createClient: () => client };
  window.JDC_DEMO_CLEAR = async () => { localStorage.removeItem(KEY); await indexedFiles.clear(); location.reload(); };
  window.addEventListener("DOMContentLoaded", () => {
    const host = document.querySelector(role === "admin" ? "#adminApp" : "#studentApp");
    if (!host) return;
    const banner = document.createElement("div");
    banner.className = "preview-banner";
    const nextRole = role === "student" ? "admin" : "student";
    const nextLabel = role === "student" ? "Open admin preview" : "Open student preview";
    banner.innerHTML = `<strong>PREVIEW MODE</strong><span>Sample records only · changes stay in this browser · no real SMS or payment is processed</span><a href="../${nextRole}/?demo=${nextRole}">${nextLabel}</a><button type="button" aria-label="Reset preview data">Reset preview</button>`;
    banner.querySelector("button").addEventListener("click", () => { if (confirm("Reset this browser’s JDC preview data?")) void window.JDC_DEMO_CLEAR(); });
    host.prepend(banner);
  });
})();
