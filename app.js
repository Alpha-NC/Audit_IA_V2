/* ============================
   CONFIG
   ============================ */
const CONFIG = {
  WEBHOOK_PROD: "https://n8n.srv1159833.hstgr.cloud/webhook/audit-agences-creatives?token=alphanc_2026_VX7mP2kQ9rL4sT1wY6eN8hJ0cB3aD5fG",
  ALLOW_ORIGIN: "https://alpha-nc.github.io",
  INTERNAL_EMAIL: "agence.alphanc@gmail.com",
  CALENDLY_URL: "https://calendly.com/agence-alphanc/audit-decouverte",
  SITE_URL: "https://alpha-nc.github.io/",
  FORM_TAG: "audit-agences-creatives"
};

const STORAGE_KEY = `${CONFIG.FORM_TAG}:v1`;
const TTL_DAYS = 30;
const SAVE_DEBOUNCE_MS = 250;
const TOTAL_PAGES = 8;

const DEV = new URLSearchParams(location.search).get("dev") === "1";

let schema = null;

const state = {
  stepIndex: 0,
  answers: {},
  tracking: null,
  submitting: false,
  lastResponse: null,
  rateLimitUntil: 0
};

const el = {
  banner: document.getElementById("banner"),
  stepKicker: document.getElementById("stepKicker"),
  stepTitle: document.getElementById("stepTitle"),
  stepSubtitle: document.getElementById("stepSubtitle"),
  stepBody: document.getElementById("stepBody"),
  progressTop: document.getElementById("progressTop"),
  progressTextTop: document.getElementById("progressTextTop"),
  progressBarTop: document.getElementById("progressBarTop"),
  saveStateTop: document.getElementById("saveStateTop"),
  sidebar: document.getElementById("sidebar"),
  cardActions: document.getElementById("cardActions"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  analysisWrap: document.getElementById("analysisWrap"),
  analysisFrame: document.getElementById("analysisFrame"),
  submissionId: document.getElementById("submissionId"),
  calendlyBtn: document.getElementById("calendlyBtn"),
  restartBtn: document.getElementById("restartBtn"),
  restartBtnTop: document.getElementById("restartBtnTop"),
  copyIdBtn: document.getElementById("copyIdBtn"),
  devPanel: document.getElementById("devPanel"),
  devPayload: document.getElementById("devPayload"),
  copyPayloadBtn: document.getElementById("copyPayloadBtn")
};

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}

function uuid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function nowMs() { return Date.now(); }

function isExpired(iso) {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return (nowMs() - t) / (1000 * 60 * 60 * 24) > TTL_DAYS;
}

function getTracking() {
  const params = new URLSearchParams(location.search);
  const stored = loadStorageRaw();
  const sessionId = stored?.tracking?.sessionId || uuid();
  return {
    sessionId,
    tag: CONFIG.FORM_TAG,
    params: {
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
      utm_term: params.get("utm_term") || "",
      utm_content: params.get("utm_content") || "",
      ref: params.get("ref") || "",
      variant: params.get("variant") || ""
    }
  };
}

function showBanner(msg) {
  el.banner.textContent = msg;
  el.banner.classList.remove("banner--hidden");
}

function hideBanner() {
  el.banner.textContent = "";
  el.banner.classList.add("banner--hidden");
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveStorage();
    setSaveIndicator("Sauvegardé");
    setTimeout(() => setSaveIndicator(""), 1200);
  }, SAVE_DEBOUNCE_MS);
}

function setSaveIndicator(t) {
  if (el.saveStateTop) el.saveStateTop.textContent = t || "";
}

function loadStorageRaw() {
  return safeJsonParse(localStorage.getItem(STORAGE_KEY) || "");
}

function saveStorage() {
  const payload = {
    schemaVersion: schema?.version || "unknown",
    stepIndex: state.stepIndex,
    answers: state.answers,
    tracking: state.tracking,
    rateLimitUntil: state.rateLimitUntil || 0,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function clearStorage() { localStorage.removeItem(STORAGE_KEY); }
function currentStep() { return schema.steps[state.stepIndex]; }
function isConfirmStep() { return currentStep()?.type === "confirm"; }
function isIntroStep() { return currentStep()?.type === "intro"; }
function isLastFormStep() {
  const st = currentStep();
  return st?.type === "form" && st?.page === 7;
}

function setBtnState() {
  const isIntro = isIntroStep();
  const isConfirm = isConfirmStep();
  const atRateLimit = nowMs() < (state.rateLimitUntil || 0);

  el.prevBtn.disabled = isIntro || state.submitting;
  el.nextBtn.disabled = state.submitting || (isLastFormStep() && atRateLimit);

  if (isIntro) {
    el.nextBtn.textContent = schema.steps[0].cta || "Commencer";
  } else if (isConfirm) {
    el.nextBtn.textContent = "Terminé";
  } else if (isLastFormStep()) {
    if (atRateLimit) {
      const s = Math.ceil((state.rateLimitUntil - nowMs()) / 1000);
      el.nextBtn.textContent = `Réessayer dans ${s}s`;
    } else {
      el.nextBtn.textContent = state.submitting ? "Envoi..." : "Envoyer";
    }
  } else {
    el.nextBtn.textContent = "Suivant";
  }
}

function evalCondition(cond) {
  if (!cond) return true;
  const v = state.answers[cond.field];
  if ("equals" in cond) return v === cond.equals;
  if ("not_equals" in cond) return v !== cond.not_equals;
  if ("includes" in cond) return Array.isArray(v) && v.includes(cond.includes);
  return true;
}

function isFieldVisible(field) {
  if (!field.showWhen) return true;
  return evalCondition(field.showWhen);
}

function isFieldRequired(field) {
  if (field.required === true) return true;
  if (field.required === false || field.required == null) return false;
  if (typeof field.required === "object" && field.required.when) {
    return evalCondition(field.required.when);
  }
  return false;
}

function progressInfo() {
  const step = currentStep();
  const page = step?.page || 1;
  const pct = Math.round(((page - 1) / (TOTAL_PAGES - 1)) * 100);
  return { page, pct };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
}

function normalizeValue(field, raw) {
  if (raw == null) return raw;
  if (field.type === "number" || field.type === "range") {
    if (raw === "") return "";
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (typeof raw === "string") return raw.trim();
  return raw;
}

function isConditionDriver(fieldId) {
  return ["agency_type", "biggest_challenge", "goal_type", "current_tools"].includes(fieldId);
}

function cleanupHiddenConditionalFields() {
  for (const st of schema.steps) {
    if (!st.fields) continue;
    for (const f of st.fields) {
      if (!f.showWhen) continue;
      if (!isFieldVisible(f) && state.answers[f.id] != null && state.answers[f.id] !== "") {
        delete state.answers[f.id];
      }
    }
  }
}

function updateDevPanel() {
  if (!DEV) return;
  el.devPayload.textContent = JSON.stringify(buildPayload(), null, 2);
}

function updateSidebarVisibility() {
  if (el.sidebar) {
    el.sidebar.classList.toggle("sidebar--hidden", isConfirmStep());
  }
  // Cacher les boutons sur la page de confirmation (analyse)
  if (el.cardActions) {
    el.cardActions.classList.toggle("card__actions--hidden", isConfirmStep());
  }
}

function updateProgressBar() {
  if (el.progressTop) {
    el.progressTop.classList.toggle("progress-top--hidden", isIntroStep());
  }
  const p = progressInfo();
  const pct = isConfirmStep() ? 100 : p.pct;
  if (el.progressTextTop) {
    el.progressTextTop.textContent = isIntroStep() ? "Prêt ?" : (isConfirmStep() ? "Analyse reçue" : `Progression : page ${p.page}/${TOTAL_PAGES}`);
  }
  if (el.progressBarTop) {
    el.progressBarTop.style.width = `${pct}%`;
  }
}

function render() {
  hideBanner();
  const step = currentStep();
  el.stepTitle.textContent = step.title || "";
  el.stepSubtitle.textContent = step.subtitle || "";
  el.stepKicker.textContent = step.page ? `Étape ${step.page}/${TOTAL_PAGES}` : "";
  updateProgressBar();
  updateSidebarVisibility();
  el.stepBody.innerHTML = "";
  el.analysisWrap.classList.add("analysis--hidden");
  el.analysisFrame.srcdoc = "";
  el.submissionId.textContent = "";
  el.calendlyBtn.href = CONFIG.CALENDLY_URL;

  if (step.type === "intro") renderIntro(step);
  else if (step.type === "confirm") renderConfirmPlaceholder();
  else renderFormStep(step);

  if (DEV) {
    el.devPanel.classList.remove("dev--hidden");
    updateDevPanel();
  } else {
    el.devPanel.classList.add("dev--hidden");
  }
  setBtnState();
}

function renderIntro(step) {
  const wrap = document.createElement("div");
  wrap.className = "grid";
  const box = document.createElement("div");
  box.className = "field";
  const stored = loadStorageRaw();
  const hasResume = stored?.answers && Object.keys(stored.answers).length > 0 && !isExpired(stored.updatedAt);
  box.innerHTML = `
    <div class="label">Bienvenue !</div>
    <div class="muted" style="margin-bottom:10px;">Répondez à quelques questions pour recevoir votre analyse personnalisée.</div>
    <div class="muted" style="font-size:13px;">Temps estimé : 3 minutes. Vos réponses sont sauvegardées automatiquement.</div>
    ${hasResume ? `<div class="muted" style="margin-top:12px; font-size:13px; color: var(--primary);">Reprise automatique détectée : vous pouvez continuer là où vous vous étiez arrêté.</div>` : ``}
  `;
  wrap.appendChild(box);
  el.stepBody.appendChild(wrap);
}

function renderConfirmPlaceholder() {
  const info = document.createElement("div");
  info.className = "field";
  info.innerHTML = `<div class="label">Analyse</div><div class="muted">Envoi du formulaire réussi.</div>`;
  el.stepBody.appendChild(info);
}

function renderFormStep(step) {
  const wrap = document.createElement("div");
  wrap.className = "grid";
  for (const field of (step.fields || [])) {
    if (!isFieldVisible(field)) continue;
    wrap.appendChild(renderField(field));
  }
  el.stepBody.appendChild(wrap);
}

function renderField(field) {
  const box = document.createElement("div");
  box.className = "field";
  box.dataset.fieldId = field.id;
  const required = isFieldRequired(field);

  if (field.type === "checkbox_link") {
    const control = document.createElement("div");
    control.className = "control";
    const row = document.createElement("label");
    row.className = "option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = field.id;
    input.name = field.id;
    input.checked = !!state.answers[field.id];
    input.addEventListener("change", () => {
      state.answers[field.id] = input.checked;
      scheduleSave();
      updateDevPanel();
    });
    const span = document.createElement("span");
    span.innerHTML = `${escapeHtml(field.label || '')} <a href="${escapeHtml(field.linkUrl || '#')}" target="_blank" rel="noopener" style="color: var(--primary); text-decoration: underline;">${escapeHtml(field.linkText || 'Lien')}</a>${required ? ' <span class="req">*</span>' : ''}`;
    row.appendChild(input);
    row.appendChild(span);
    control.appendChild(row);
    box.appendChild(control);
    attachErrorArea(box);
    return box;
  }

  if (field.type === "checkbox") {
    const control = document.createElement("div");
    control.className = "control";
    const row = document.createElement("label");
    row.className = "option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.id = field.id;
    input.name = field.id;
    input.checked = !!state.answers[field.id];
    input.addEventListener("change", () => {
      state.answers[field.id] = input.checked;
      scheduleSave();
      updateDevPanel();
    });
    const span = document.createElement("span");
    span.innerHTML = escapeHtml(field.label || field.id) + (required ? ' <span class="req">*</span>' : '');
    row.appendChild(input);
    row.appendChild(span);
    control.appendChild(row);
    box.appendChild(control);
    attachErrorArea(box);
    return box;
  }

  if (field.hidden) {
    const control = document.createElement("div");
    control.className = "control";
    const input = document.createElement("input");
    input.type = "text";
    input.id = field.id;
    input.name = field.id;
    input.style.display = "none";
    input.tabIndex = field.tabindex || -1;
    input.autocomplete = "off";
    input.value = state.answers[field.id] || "";
    input.addEventListener("input", () => { state.answers[field.id] = input.value; });
    control.appendChild(input);
    box.appendChild(control);
    box.style.display = "none";
    return box;
  }

  const label = document.createElement("div");
  label.className = "label";
  label.innerHTML = `<span>${escapeHtml(field.label || field.id)}</span>${required ? `<span class="req">*</span>` : ``}`;

  const control = document.createElement("div");
  control.className = "control";
  const value = state.answers[field.id];

  if (["text", "email", "tel", "number"].includes(field.type)) {
    const row = document.createElement("div");
    row.className = "controlRow";
    const input = document.createElement("input");
    input.type = field.type === "number" ? "number" : field.type;
    input.id = field.id;
    input.name = field.id;
    input.placeholder = field.placeholder || "";
    if (field.autocomplete) input.autocomplete = field.autocomplete;
    if (typeof field.tabindex === "number") input.tabIndex = field.tabindex;
    if (field.min != null && field.type === "number") input.min = String(field.min);
    if (value != null) input.value = String(value);
    input.addEventListener("input", () => {
      state.answers[field.id] = normalizeValue(field, input.value);
      if (isConditionDriver(field.id)) { cleanupHiddenConditionalFields(); render(); }
      else { scheduleSave(); updateDevPanel(); }
    });
    row.appendChild(input);
    if (field.unit) {
      const unit = document.createElement("div");
      unit.className = "unitPill";
      unit.textContent = field.unit;
      row.appendChild(unit);
    }
    control.appendChild(row);
  } else if (field.type === "select") {
    const select = document.createElement("select");
    select.id = field.id;
    select.name = field.id;
    const ph = document.createElement("option");
    ph.value = "";
    ph.textContent = field.placeholder || "Sélectionner...";
    ph.disabled = true;
    ph.selected = (value == null || value === "");
    select.appendChild(ph);
    for (const opt of (field.options || [])) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (value === opt) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener("change", () => {
      state.answers[field.id] = select.value;
      cleanupHiddenConditionalFields();
      scheduleSave();
      render();
      updateDevPanel();
    });
    control.appendChild(select);
  } else if (field.type === "radio") {
    const group = document.createElement("div");
    group.className = "radios";
    for (const opt of (field.options || [])) {
      const row = document.createElement("label");
      row.className = "option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = field.id;
      input.value = opt;
      input.checked = value === opt;
      input.addEventListener("change", () => {
        state.answers[field.id] = opt;
        cleanupHiddenConditionalFields();
        scheduleSave();
        render();
        updateDevPanel();
      });
      const span = document.createElement("span");
      span.textContent = opt;
      row.appendChild(input);
      row.appendChild(span);
      group.appendChild(row);
    }
    control.appendChild(group);
  } else if (field.type === "checkboxes") {
    const group = document.createElement("div");
    group.className = "checks";
    const arr = Array.isArray(value) ? value : [];
    for (const opt of (field.options || [])) {
      const row = document.createElement("label");
      row.className = "option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.name = field.id;
      input.value = opt;
      input.checked = arr.includes(opt);
      input.addEventListener("change", () => {
        const current = Array.isArray(state.answers[field.id]) ? state.answers[field.id] : [];
        if (input.checked) {
          state.answers[field.id] = Array.from(new Set([...current, opt]));
        } else {
          state.answers[field.id] = current.filter(x => x !== opt);
        }
        if (isConditionDriver(field.id)) { cleanupHiddenConditionalFields(); render(); }
        else { scheduleSave(); updateDevPanel(); }
      });
      const span = document.createElement("span");
      span.textContent = opt;
      row.appendChild(input);
      row.appendChild(span);
      group.appendChild(row);
    }
    control.appendChild(group);
  } else if (field.type === "range") {
    const row = document.createElement("div");
    row.className = "rangeRow";
    const input = document.createElement("input");
    input.type = "range";
    input.id = field.id;
    input.name = field.id;
    input.min = String(field.min);
    input.max = String(field.max);
    const startVal = (value != null && value !== "") ? Number(value) : Number(field.default ?? field.min);
    input.value = String(startVal);
    const pill = document.createElement("div");
    pill.className = "rangeVal";
    pill.textContent = String(startVal);
    input.addEventListener("input", () => {
      pill.textContent = input.value;
      state.answers[field.id] = Number(input.value);
      scheduleSave();
      updateDevPanel();
    });
    if (state.answers[field.id] == null) state.answers[field.id] = startVal;
    row.appendChild(input);
    row.appendChild(pill);
    if (field.unit) {
      const unit = document.createElement("div");
      unit.className = "unitPill";
      unit.textContent = field.unit;
      row.appendChild(unit);
    }
    control.appendChild(row);
  }

  box.appendChild(label);
  box.appendChild(control);
  attachErrorArea(box);
  return box;
}

function attachErrorArea(box) {
  const err = document.createElement("div");
  err.className = "error";
  err.style.display = "none";
  err.dataset.role = "error";
  box.appendChild(err);
}

function clearStepErrors() {
  document.querySelectorAll(".field").forEach(f => {
    const err = f.querySelector('[data-role="error"]');
    if (err) { err.textContent = ""; err.style.display = "none"; }
    f.querySelectorAll("input,select").forEach(i => i.classList.remove("invalid"));
  });
}

function setFieldError(fieldId, message) {
  const box = document.querySelector(`.field[data-field-id="${CSS.escape(fieldId)}"]`);
  if (!box) return;
  const err = box.querySelector('[data-role="error"]');
  if (err) { err.textContent = message; err.style.display = "block"; }
  box.querySelectorAll("input,select").forEach(i => i.classList.add("invalid"));
}

function validateStep(step, { silent } = { silent: false }) {
  let firstInvalid = null;
  const fields = step.fields || [];

  for (const field of fields) {
    if (!isFieldVisible(field)) continue;
    if (field.id === "hp_field") continue;

    const required = isFieldRequired(field);
    const v = state.answers[field.id];

    if (required) {
      if (field.type === "checkbox" || field.type === "checkbox_link") {
        if (v !== true) {
          firstInvalid ||= field.id;
          if (!silent) setFieldError(field.id, "Champ obligatoire.");
        }
      } else if (field.type === "checkboxes") {
        const arr = Array.isArray(v) ? v : [];
        const minItems = field.minItems || 1;
        if (arr.length < minItems) {
          firstInvalid ||= field.id;
          if (!silent) setFieldError(field.id, `Sélectionnez au moins ${minItems} option(s).`);
        }
      } else {
        if (v == null || v === "") {
          firstInvalid ||= field.id;
          if (!silent) setFieldError(field.id, "Champ obligatoire.");
        }
      }
    }

    if (v != null && v !== "") {
      if (field.type === "email") {
        const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v));
        if (!ok) { firstInvalid ||= field.id; if (!silent) setFieldError(field.id, "Email invalide."); }
      }
      if (field.type === "number") {
        const num = Number(v);
        if (Number.isNaN(num)) { firstInvalid ||= field.id; if (!silent) setFieldError(field.id, "Nombre invalide."); }
        else if (field.min != null && num < field.min) { firstInvalid ||= field.id; if (!silent) setFieldError(field.id, `Minimum : ${field.min}.`); }
      }
      if (field.type === "range") {
        const num = Number(v);
        if (Number.isNaN(num)) { firstInvalid ||= field.id; if (!silent) setFieldError(field.id, "Valeur invalide."); }
      }
    }
  }
  return { ok: !firstInvalid, firstInvalid };
}

function validateCurrentStep() {
  clearStepErrors();
  const step = currentStep();
  if (!step || step.type !== "form") return { ok: true, firstInvalid: null };
  const r = validateStep(step, { silent: false });
  if (!r.ok && r.firstInvalid) {
    const box = document.querySelector(`.field[data-field-id="${CSS.escape(r.firstInvalid)}"]`);
    box?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return r;
}

function findFirstInvalidStepIndex() {
  for (let i = 0; i < schema.steps.length; i++) {
    const st = schema.steps[i];
    if (st.type !== "form") continue;
    const r = validateStep(st, { silent: true });
    if (!r.ok) return i;
  }
  return null;
}

function buildPayload() {
  return {
    meta: {
      submittedAt: new Date().toISOString(),
      tracking: { sessionId: state.tracking.sessionId, tag: CONFIG.FORM_TAG, params: state.tracking.params }
    },
    answers: state.answers
  };
}

/**
 * Transforme l'analyse HTML pour remplacer le ROI % par un gain/jour
 * Cherche les patterns de ROI en pourcentage et les convertit en temps/jour
 */
function transformAnalysisROI(htmlContent) {
  // Calcul du gain temps basé sur time_wasted_weekly
  const timeWastedWeekly = state.answers.time_wasted_weekly || 10;
  // On estime qu'on peut récupérer 30-50% du temps perdu
  const estimatedSavingsWeekly = timeWastedWeekly * 0.4;
  const estimatedSavingsDaily = estimatedSavingsWeekly / 5; // 5 jours de travail
  
  // Formatage du gain journalier
  let gainText;
  if (estimatedSavingsDaily >= 1) {
    const hours = Math.floor(estimatedSavingsDaily);
    const minutes = Math.round((estimatedSavingsDaily - hours) * 60);
    if (minutes > 0) {
      gainText = `~${hours}h${minutes.toString().padStart(2, '0')} / jour`;
    } else {
      gainText = `~${hours}h / jour`;
    }
  } else {
    const minutes = Math.round(estimatedSavingsDaily * 60);
    gainText = minutes > 0 ? `~${minutes} min / jour` : `~15 min / jour`;
  }
  
  let transformed = htmlContent;
  
  // Pattern 1: "+XXX%" ou "XXX%" dans un contexte ROI
  transformed = transformed.replace(
    /(\+?\d{1,4}%)/gi,
    function(match, p1, offset, string) {
      // Vérifie si c'est dans un contexte ROI (regarder les 50 caractères avant)
      const before = string.substring(Math.max(0, offset - 50), offset).toLowerCase();
      if (before.includes('roi')) {
        return gainText;
      }
      return match;
    }
  );
  
  // Pattern 2: "ROI ESTIMÉ" ou "ROI Estimé" - remplacer le label
  transformed = transformed.replace(
    /ROI\s*ESTIM[ÉE]/gi,
    'GAIN TEMPS ESTIMÉ'
  );
  
  transformed = transformed.replace(
    /ROI\s*[Ee]stim[ée]/g,
    'Gain temps estimé'
  );
  
  // Pattern 3: Juste "ROI" seul comme label
  transformed = transformed.replace(
    />ROI</gi,
    '>GAIN TEMPS<'
  );
  
  // Pattern 4: Bloc complet avec ROI et pourcentage (pattern HTML typique)
  // Ex: <div class="metric"><span class="value">+454%</span><span class="label">ROI ESTIMÉ</span></div>
  transformed = transformed.replace(
    /(<[^>]*class="[^"]*value[^"]*"[^>]*>)\s*\+?\d{1,4}%\s*(<\/[^>]+>)/gi,
    `$1${gainText}$2`
  );
  
  // Pattern 5: Cellule de tableau ou div avec ROI
  transformed = transformed.replace(
    /(<td[^>]*>|<div[^>]*>)\s*\+?\d{1,4}%\s*(<\/td>|<\/div>)(\s*<td[^>]*>|<div[^>]*>)\s*(ROI[^<]*)\s*(<\/td>|<\/div>)/gi,
    `$1${gainText}$2$3GAIN TEMPS$5`
  );

  return transformed;
}

async function handleSubmit() {
  const atRateLimit = nowMs() < (state.rateLimitUntil || 0);
  if (atRateLimit) return;

  state.submitting = true;
  setBtnState();
  hideBanner();

  try {
    const payload = buildPayload();
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(CONFIG.WEBHOOK_PROD, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "X-Form-Tag": CONFIG.FORM_TAG,
        "X-Client-Origin": location.origin
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    clearTimeout(t);

    let json = null;
    try { json = await res.json(); }
    catch { json = { ok: false, error_code: "BAD_RESPONSE", message_user: "Réponse serveur invalide.", details: {} }; }

    if (!json || typeof json.ok !== "boolean") {
      json = { ok: false, error_code: "BAD_RESPONSE", message_user: "Réponse serveur invalide.", details: {} };
    }

    state.lastResponse = json;

    if (json.ok !== true) {
      if (json.error_code === "RATE_LIMIT" && json.details?.retry_after_seconds) {
        state.rateLimitUntil = nowMs() + (Number(json.details.retry_after_seconds) * 1000);
        scheduleSave();
      }
      showBanner(json.message_user || "Erreur. Réessayez.");
      state.submitting = false;
      setBtnState();
      return;
    }

    let analysis = String(json.analysis_html || "");
    if (!analysis) {
      showBanner("Analyse manquante. Réessayez.");
      state.submitting = false;
      setBtnState();
      return;
    }

    // Transformer le ROI % en gain/jour
    analysis = transformAnalysisROI(analysis);

    clearStorage();
    state.stepIndex = schema.steps.length - 1;
    render();

    el.analysisWrap.classList.remove("analysis--hidden");
    el.submissionId.textContent = json.submissionId || "";
    el.calendlyBtn.href = CONFIG.CALENDLY_URL;
    el.analysisFrame.srcdoc = analysis;

    state.submitting = false;
    setBtnState();

  } catch (e) {
    const msg = (e?.name === "AbortError") ? "Temps de réponse trop long. Réessayez." : "Réseau indisponible. Réessayez.";
    showBanner(msg);
    state.submitting = false;
    setBtnState();
  }
}

function goNext() {
  if (state.submitting) return;
  const step = currentStep();

  if (step.type === "intro") {
    state.stepIndex = 1;
    scheduleSave();
    render();
    return;
  }

  if (step.type === "confirm") return;

  const v = validateCurrentStep();
  if (!v.ok) return;

  if (isLastFormStep()) {
    handleSubmit();
    return;
  }

  state.stepIndex = Math.min(state.stepIndex + 1, schema.steps.length - 1);
  scheduleSave();
  render();
}

function goPrev() {
  if (state.submitting) return;
  if (state.stepIndex <= 0) return;
  state.stepIndex = Math.max(0, state.stepIndex - 1);
  scheduleSave();
  render();
}

function restart() {
  clearStorage();
  state.stepIndex = 0;
  state.answers = {};
  state.tracking = getTracking();
  state.submitting = false;
  state.lastResponse = null;
  state.rateLimitUntil = 0;
  setSaveIndicator("");
  render();
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    setSaveIndicator("Copié");
    setTimeout(() => setSaveIndicator(""), 900);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    setSaveIndicator("Copié");
    setTimeout(() => setSaveIndicator(""), 900);
  }
}

let rateLimitTimer = null;
function startRateLimitCountdown() {
  if (rateLimitTimer) clearInterval(rateLimitTimer);
  rateLimitTimer = setInterval(() => {
    if (nowMs() >= (state.rateLimitUntil || 0)) {
      clearInterval(rateLimitTimer);
      rateLimitTimer = null;
      state.rateLimitUntil = 0;
      setBtnState();
    } else {
      setBtnState();
    }
  }, 1000);
}

async function init() {
  try {
    const res = await fetch("schema.json", { cache: "no-store" });
    schema = await res.json();
  } catch (e) {
    showBanner("Impossible de charger le formulaire (schema.json). Vérifiez le déploiement.");
    return;
  }

  state.tracking = getTracking();

  const stored = loadStorageRaw();
  const invalidDueToTtl = stored?.updatedAt && isExpired(stored.updatedAt);
  const invalidSchema = stored?.schemaVersion && stored.schemaVersion !== schema.version;

  if (invalidDueToTtl || invalidSchema) {
    clearStorage();
  } else if (stored) {
    if (stored.answers && typeof stored.answers === "object") state.answers = stored.answers;
    if (typeof stored.stepIndex === "number") state.stepIndex = stored.stepIndex;
    if (typeof stored.rateLimitUntil === "number") state.rateLimitUntil = stored.rateLimitUntil;
  }

  if (schema.steps[state.stepIndex]?.type === "confirm") state.stepIndex = 0;

  const firstBad = findFirstInvalidStepIndex();
  if (firstBad != null && state.stepIndex > firstBad) state.stepIndex = firstBad;

  el.nextBtn.addEventListener("click", goNext);
  el.prevBtn.addEventListener("click", goPrev);
  el.restartBtn.addEventListener("click", restart);
  el.restartBtnTop.addEventListener("click", restart);
  el.copyIdBtn.addEventListener("click", () => copyToClipboard(el.submissionId.textContent || ""));

  if (DEV) {
    el.copyPayloadBtn.addEventListener("click", () => {
      copyToClipboard(JSON.stringify(buildPayload(), null, 2));
    });
  }

  if (state.rateLimitUntil > nowMs()) startRateLimitCountdown();

  saveStorage();
  render();
}

init();
