import { sendRoll, sendRollAtk, getNumberWpnEquipped, setBaseImg } from "../../../systems/cthulhu-no-kami/module/helpers/common.mjs";

const MODULE_ID = "enhancedcombathud-cthulhu-no-kami";
const SUPPORTED_ACTOR_TYPES = ["eiyu", "entite", "vehicule"];
const ENTRY_TYPES = {
  voies: ["voie", "voies"],
  avantages: ["avantage", "desavantage", "phobie", "folie", "capacite", "trait"]
};
const HOVER_ACTIONS = new Set(["voies", "avantages", "caracteristiques"]);

let currentHudActorId = null;
let hoverCloseTimer = null;
let argonOpenTimer = null;
let lastQueuedArgonTokenId = null;

function t(key) { return game.i18n.localize(`${MODULE_ID}.${key}`); }
function num(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function currentOf(data) { return num(data?.value ?? data?.actuel ?? 0); }
function maxOf(data) { return num(data?.max ?? data?.base ?? data?.value ?? data?.actuel ?? 0); }
function actorSystem(actor) { return actor?.system ?? {}; }
function isWeaponType(type) { return ["wpncontact", "wpndistance", "wpngrenade", "wpnartillerie"].includes(type); }
function isSortType(type) { return type === "sortilege"; }
function normalizeText(text) {
  return `${text ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function stripHtml(text) {
  return `${text ?? ""}`.replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function shortText(text, max = 110) {
  const clean = stripHtml(text);
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function svgIcon(path, color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path fill="${color}" d="${path}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const ICONS = {
  voies: "icons/magic/symbols/runes-star-pentagon-blue.webp",
  avantages: "icons/commodities/treasure/token-gold-rune-gem-blue.webp",
  caracteristiques: "icons/svg/d20-highlight.svg",
  initiative: "icons/skills/movement/arrow-upward-yellow.webp",
  resistancementale: "icons/magic/perception/third-eye-blue-red.webp",
  sheet: "icons/sundries/documents/document-sealed-red-tan.webp"
};

function ensureRuntimeStyle() {
  if (document.getElementById(`${MODULE_ID}-runtime-style`)) return;
  const style = document.createElement("style");
  style.id = `${MODULE_ID}-runtime-style`;
  style.textContent = `
    #enhancedcombathud .action-element,
    #enhancedcombathud [class*="action-element"],
    .argon .action-element,
    .argon [class*="action-element"] {
      min-height: 78px !important;
    }
    #enhancedcombathud .action-element .title,
    #enhancedcombathud .action-element .title *,
    #enhancedcombathud .action-element .label,
    #enhancedcombathud .action-element .label *,
    .argon .action-element .title,
    .argon .action-element .title *,
    .argon .action-element .label,
    .argon .action-element .label * {
      font-size: 16px !important;
      line-height: 1.12 !important;
      font-weight: 700 !important;
    }
    #enhancedcombathud .action-element .subtitle,
    #enhancedcombathud .action-element .subtitle *,
    .argon .action-element .subtitle,
    .argon .action-element .subtitle * {
      font-size: 12px !important;
      line-height: 1.1 !important;
    }
    #enhancedcombathud .action-element.cnk-argon-decorated .title,
    .argon .action-element.cnk-argon-decorated .title {
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 8px !important;
      text-align: center !important;
    }
    #enhancedcombathud .action-element.cnk-argon-decorated .cnk-argon-action-icon,
    .argon .action-element.cnk-argon-decorated .cnk-argon-action-icon {
      width: 22px !important;
      height: 22px !important;
      flex: 0 0 22px !important;
      display: inline-block !important;
      background-size: contain !important;
      background-repeat: no-repeat !important;
      background-position: center !important;
      filter: drop-shadow(0 0 6px rgba(0,0,0,0.35));
    }
    .cnk-argon-entry-button .title,
    .cnk-argon-entry-button .title * {
      font-size: 13px !important;
      line-height: 1.1 !important;
    }
    .cnk-argon-entry-button .subtitle,
    .cnk-argon-entry-button .subtitle * {
      font-size: 11px !important;
      line-height: 1.05 !important;
    }
    .cnk-argon-popover {
      position: fixed !important;
      pointer-events: auto !important;
      z-index: 20000 !important;
      width: min(420px, calc(100vw - 16px));
      background: rgba(22, 28, 34, 0.96) !important;
      border: 1px solid rgba(255,255,255,0.14) !important;
      border-radius: 12px !important;
      box-shadow: 0 18px 44px rgba(0,0,0,0.45) !important;
      backdrop-filter: blur(4px);
      overflow: hidden;
    }
    .cnk-argon-popover__title {
      padding: 10px 12px !important;
      font-size: 14px !important;
      font-weight: 700 !important;
      color: #f5f7fa !important;
      background: rgba(255,255,255,0.06) !important;
      border-bottom: 1px solid rgba(255,255,255,0.08) !important;
    }
    .cnk-argon-popover__body {
      display: flex !important;
      flex-direction: column !important;
      gap: 8px !important;
      padding: 8px !important;
      max-height: min(52vh, 420px) !important;
      overflow-y: auto !important;
    }
    .cnk-argon-popover__item {
      display: grid !important;
      grid-template-columns: 38px minmax(0, 1fr) !important;
      align-items: start !important;
      gap: 10px !important;
      width: 100% !important;
      min-height: 0 !important;
      height: auto !important;
      padding: 9px !important;
      border-radius: 10px !important;
      border: 1px solid rgba(255,255,255,0.08) !important;
      background: rgba(255,255,255,0.04) !important;
      color: #f5f7fa !important;
      text-align: left !important;
      cursor: pointer !important;
      pointer-events: auto !important;
    }
    .cnk-argon-popover__item:hover {
      background: rgba(255,255,255,0.10) !important;
      border-color: rgba(255,255,255,0.16) !important;
    }
    .cnk-argon-popover__item-icon {
      width: 36px !important;
      height: 36px !important;
      border-radius: 8px !important;
      align-self: start !important;
      margin-top: 1px !important;
      background-position: center !important;
      background-repeat: no-repeat !important;
      background-size: contain !important;
      background-color: rgba(255,255,255,0.08) !important;
    }
    .cnk-argon-popover__item-text {
      min-width: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      gap: 4px !important;
    }
    .cnk-argon-popover__item-title {
      display: block !important;
      position: static !important;
      margin: 0 !important;
      font-size: 13px !important;
      line-height: 1.3 !important;
      font-weight: 700 !important;
      color: #fff !important;
      white-space: normal !important;
      overflow: hidden !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
      text-overflow: ellipsis !important;
    }
    .cnk-argon-popover__item-subtitle {
      display: block !important;
      position: static !important;
      margin: 0 !important;
      font-size: 11px !important;
      line-height: 1.3 !important;
      color: rgba(255,255,255,0.74) !important;
      white-space: normal !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
    }
    .cnk-argon-popover__item-summary {
      display: -webkit-box !important;
      position: static !important;
      margin: 2px 0 0 0 !important;
      font-size: 11px !important;
      line-height: 1.35 !important;
      color: rgba(255,255,255,0.90) !important;
      white-space: normal !important;
      overflow: hidden !important;
      overflow-wrap: anywhere !important;
      word-break: break-word !important;
      -webkit-box-orient: vertical !important;
      -webkit-line-clamp: 2 !important;
    }
    .cnk-argon-popover__empty {
      padding: 10px !important;
      color: rgba(255,255,255,0.74) !important;
      text-align: center !important;
      font-size: 12px !important;
    }
  `;
  document.head.appendChild(style);
}

function decorateHudButtons() {
  const labels = {
    voies: normalizeText(game.i18n.localize(`${MODULE_ID}.buttons.voies`)),
    avantages: normalizeText(game.i18n.localize(`${MODULE_ID}.buttons.avantages`)),
    caracteristiques: normalizeText(game.i18n.localize(`${MODULE_ID}.buttons.caracteristiques`)),
    initiative: normalizeText(game.i18n.localize(`${MODULE_ID}.buttons.initiative`)),
    resistancementale: normalizeText(game.i18n.localize(`${MODULE_ID}.buttons.resistanceMentale`)),
    sheet: normalizeText(game.i18n.localize(`${MODULE_ID}.buttons.sheet`))
  };

  const candidates = document.querySelectorAll("#enhancedcombathud .action-element, .argon .action-element");
  for (const el of candidates) {
    const titleEl = el.querySelector(".title") || el.querySelector(".label") || el;
    const text = normalizeText(titleEl?.textContent ?? "");
    const entry = Object.entries(labels).find(([, value]) => value && text === value);
    if (!entry) continue;
    const [key] = entry;
    el.dataset.cnkAction = key;
    el.classList.add("cnk-argon-decorated", `cnk-argon-${key}`);
    if (!titleEl.querySelector(".cnk-argon-action-icon")) {
      const icon = document.createElement("span");
      icon.className = "cnk-argon-action-icon";
      icon.style.backgroundImage = `url('${ICONS[key]}')`;
      titleEl.prepend(icon);
    }
  }
}

function watchHudDom() {
  if (watchHudDom._observer) return;
  watchHudDom._observer = new MutationObserver(() => {
    decorateHudButtons();
    installHudHandlers();
  });
  watchHudDom._observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  decorateHudButtons();
  installHudHandlers();
}

function isDisplayedAttackItem(item) {
  if (!item) return false;
  if (isSortType(item.type)) return true;
  if (!isWeaponType(item.type)) return false;
  if (item.type === "wpnartillerie") return item.system?.used === true;
  const equipped = item.system?.equipped;
  return equipped !== undefined && equipped !== null && `${equipped}` !== "" && `${equipped}` !== "false";
}

function displayDamage(item) {
  if (!item) return "-";
  const sys = item.system ?? {};
  if (sys.utilisation === "1mainou2mains") {
    const dm1 = sys.dm1 || `1${game.i18n.localize("CNK.De-short")}6`;
    const dm2 = sys.dm2 || `1${game.i18n.localize("CNK.De-short")}6`;
    return `${dm1} / ${dm2}`;
  }
  return sys.dm || sys.wpn?.dm || `1${game.i18n.localize("CNK.De-short")}6`;
}

function itemSubtitle(item) {
  if (!item) return "";
  if (isSortType(item.type)) return t("subtitle.spell");
  if (isWeaponType(item.type)) return t("subtitle.weapon");
  return t("subtitle.item");
}

async function enrich(text) {
  return foundry.applications.ux.TextEditor.implementation.enrichHTML(text ?? "");
}

function getWeaponAttackDomain(item) {
  switch (item?.type) {
    case "wpncontact": return { main: "combat", type: "contact", wpnType: "wpncontact" };
    case "wpndistance": return { main: "combat", type: "distance", wpnType: "wpndistance" };
    case "wpngrenade": return { main: "combat", type: "distance", wpnType: "wpngrenade" };
    case "wpnartillerie": return { main: "combat", type: "distance", wpnType: "wpnartillerie" };
    case "sortilege": return { main: "combat", type: "magique", wpnType: "sortilege" };
    default: return { main: "combat", type: "contact", wpnType: item?.type ?? "wpncontact" };
  }
}

function buildRollData(actor, main, type, title, mental = false) {
  const system = actorSystem(actor);
  const diceUsed = num(system?.roll?.modDice, 20);
  const dataRoll = system?.[main]?.[type];
  if (!dataRoll) return null;
  let base = dataRoll.modificateur;
  let rollWButtons = "";
  if (mental) rollWButtons = "resistancementale";
  if (base === undefined && dataRoll.total !== undefined) base = dataRoll.total;
  else if (base === undefined && dataRoll.total === undefined) base = dataRoll.actuel;
  const data = { content: {} };
  data.title = title;
  data.base = num(base, 0);
  data.content.listDice = { 12: `${game.i18n.localize("CNK.De-short")}12`, 20: `${game.i18n.localize("CNK.De-short")}20` };
  data.content.dice = diceUsed;
  data.content.nbreDe = 1;
  data.content.bRoll = [];
  data.canUseChance = !mental;
  data.rollWButtons = rollWButtons;
  let i = 0;
  for (const r of dataRoll?.bonusRoll ?? []) data.content.bRoll.push({ id: i++, active: r?.active ?? false, name: r.name, value: r.value });
  for (const r of dataRoll?.bonusRollCondition ?? []) data.content.bRoll.push({ id: i++, active: r?.active ?? false, name: r.name, value: r.value });
  return data;
}

function buildCharacteristicRollDataFromEntry(actor, entry, title) {
  const system = actorSystem(actor);
  const diceUsed = num(system?.roll?.modDice, 20);
  const raw = entry?.data ?? {};
  const base = num(raw.modificateur ?? raw.total ?? raw.actuel ?? raw.score ?? entry?.score ?? 0, 0);
  return {
    title,
    base,
    content: {
      listDice: { 12: `${game.i18n.localize("CNK.De-short")}12`, 20: `${game.i18n.localize("CNK.De-short")}20` },
      dice: diceUsed,
      nbreDe: 1,
      bRoll: [
        ...(raw?.bonusRoll ?? []),
        ...(raw?.bonusRollCondition ?? [])
      ].map((roll, id) => ({
        id,
        active: roll?.active ?? false,
        name: roll?.name,
        value: roll?.value
      }))
    },
    canUseChance: true,
    rollWButtons: ""
  };
}

function buildAttackRollData(actor, item) {
  const domain = getWeaponAttackDomain(item);
  const system = actorSystem(actor);
  const dataRoll = system?.[domain.main]?.[domain.type];
  if (!dataRoll) return null;
  const target = game.user.targets.values().next()?.value?.document;
  const base = domain.wpnType === "sortilege" ? num(dataRoll.modificateur ?? dataRoll.total, 0) : num(dataRoll.total ?? dataRoll.modificateur, 0);
  let diceUsed = num(system?.roll?.modDice, 20);
  if (domain.wpnType !== "sortilege") diceUsed = getNumberWpnEquipped(actor) > 1 ? 12 : diceUsed;
  return {
    title: item.name,
    base,
    content: { listDice: { 12: `${game.i18n.localize("CNK.De-short")}12`, 20: `${game.i18n.localize("CNK.De-short")}20` }, dice: diceUsed, nbreDe: 1, bRoll: [], bRoll2: [], type: domain.wpnType },
    canUseChance: true, target, wpn: item.id, main: domain.main, type: domain.type
  };
}

function itemTypeLabel(item) {
  if (!item?.type) return t("subtitle.item");
  const key = `TYPES.Item.${item.type}`;
  const label = game.i18n.localize(key);
  return label === key ? item.type : label;
}

function itemMeta(item) {
  const rank = num(item?.system?.rang, NaN);
  const level = num(item?.system?.niveau, NaN);
  if (Number.isFinite(rank) && rank > 0) return `Rang ${rank}`;
  if (Number.isFinite(level) && level > 0) return `Niveau ${level}`;
  const selectedRanks = Object.values(item?.system?.listrang ?? {}).filter((rang) => rang?.selected).length;
  if (selectedRanks > 0) return `${itemTypeLabel(item)} • ${selectedRanks} rang${selectedRanks > 1 ? 's' : ''}`;
  return itemTypeLabel(item);
}

function itemSummary(item) {
  const sources = [
    item?.system?.description,
    item?.system?.desc,
    item?.system?.resume,
    item?.system?.résumé,
    item?.system?.effet,
    item?.system?.texte,
    item?.system?.notes,
    item?.system?.rang1?.description
  ];
  if (item?.system?.listrang && !sources.some(Boolean)) {
    for (const rang of Object.values(item.system.listrang)) {
      if (rang?.selected) {
        const value = rang.description ?? rang.desc ?? rang.name;
        if (value) sources.unshift(value);
        break;
      }
    }
  }
  return shortText(sources.find((value) => stripHtml(value)) ?? "");
}

function getSelectedVoieRanks(item) {
  const selected = Object.entries(item?.system?.listrang ?? {})
    .filter(([, rang]) => rang?.selected)
    .sort(([a], [b]) => num(a, 0) - num(b, 0))
    .map(([, rang]) => rang)
    .filter(Boolean);

  if (selected.length) return selected;

  const fallback = [];
  for (let index = 1; index <= 5; index += 1) {
    const rang = item?.system?.[`rang${index}`];
    if (!rang || (!rang.active && !rang.selected && !rang.name && !rang.description && !rang.desc)) continue;
    fallback.push(rang);
  }
  return fallback;
}

function voieMeta(item) {
  const ranks = getSelectedVoieRanks(item);
  if (!ranks.length) return itemMeta(item);
  const names = ranks
    .map((rang, index) => rang?.name ?? rang?.label ?? rang?.titre ?? `Rang ${index + 1}`)
    .filter(Boolean);
  return names.length ? names.join(" • ") : itemMeta(item);
}

function voieSummary(item) {
  const ranks = getSelectedVoieRanks(item);
  if (!ranks.length) return itemSummary(item);
  const parts = ranks.map((rang, index) => {
    const name = rang?.name ?? rang?.label ?? rang?.titre ?? `Rang ${index + 1}`;
    const desc = shortText(rang?.description ?? rang?.desc ?? rang?.texte ?? rang?.effect ?? "", 120);
    return desc ? `${name} — ${desc}` : name;
  }).filter(Boolean);
  return shortText(parts.join(" • "), 220);
}

function getCollectionItems(actor, collection) {
  const items = actor?.items?.contents ?? [];

  if (collection === "voies") {
    const direct = [
      ...(actor?.itemTypes?.voie ?? []),
      ...(actor?.itemTypes?.voies ?? [])
    ];

    const profilVoies = Object.values(actor?.items?.find((item) => item.type === "profil")?.system?.voie ?? {})
      .filter((item) => item && typeof item === "object" && item.system);

    const filteredItems = items.filter((item) => {
      const haystack = normalizeText(`${item.type} ${item.name} ${item.folder?.name ?? ""}`);
      return ENTRY_TYPES.voies.includes(normalizeText(item.type)) || haystack.includes("voie");
    });

    const merged = [];
    const seen = new Set();
    for (const entry of [...direct, ...profilVoies, ...filteredItems]) {
      if (!entry) continue;
      const key = entry.id ?? entry._id ?? entry.uuid ?? `${entry.name ?? "voie"}-${entry.system?.type ?? ""}-${Object.keys(entry.system?.listrang ?? {}).join("-")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(entry);
    }

    return merged.sort((a, b) => `${a.name ?? ""}`.localeCompare(`${b.name ?? ""}`, game.i18n.lang || "fr", { sensitivity: "base" }));
  }

  if (collection === "avantages") {
    const types = new Set(ENTRY_TYPES.avantages.map(normalizeText));
    const list = items.filter((item) => {
      const itemType = normalizeText(item.type);
      if (types.has(itemType)) return true;
      const haystack = normalizeText(`${item.type} ${item.name} ${item.folder?.name ?? ""}`);
      return /avantage|desavantage|phobie|folie|capacite|trait/.test(haystack);
    });
    return list.sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang || "fr", { sensitivity: "base" }));
  }

  return [];
}


function getCurrentHudActor() {
  const queuedTokenActor = lastQueuedArgonTokenId
    ? canvas?.tokens?.get(lastQueuedArgonTokenId)?.actor
    : null;
  return queuedTokenActor
    ?? game.actors?.get(currentHudActorId)
    ?? canvas?.tokens?.controlled?.[0]?.actor
    ?? game.user?.character
    ?? null;
}

function capitalize(text) {
  const value = `${text ?? ""}`.trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "";
}

function localizeMaybe(value, fallback = "") {
  if (!value) return fallback;
  const localized = game.i18n.localize(value);
  return localized === value ? fallback || value : localized;
}

function getCharacteristicEntries(actor) {
  const characteristics = actor?.system?.caracteristiques;
  if (!characteristics || typeof characteristics !== "object") return [];
  return Object.entries(characteristics)
    .filter(([, data]) => data && typeof data === "object" && (data.modificateur !== undefined || data.total !== undefined || data.actuel !== undefined || data.score !== undefined))
    .map(([key, data]) => {
      const label = localizeMaybe(CONFIG.CNK?.CarPossible?.[key], capitalize(key));
      const score = num(data.modificateur ?? data.total ?? data.actuel ?? data.score ?? 0, 0);
      return { key, label, score, data };
    })
    .sort((a, b) => a.label.localeCompare(b.label, game.i18n.lang || "fr", { sensitivity: "base" }));
}

function getActionLabelKey(key) {
  const buttonMap = {
    voies: `${MODULE_ID}.buttons.voies`,
    avantages: `${MODULE_ID}.buttons.avantages`,
    caracteristiques: `${MODULE_ID}.buttons.caracteristiques`,
    initiative: `${MODULE_ID}.buttons.initiative`,
    resistancementale: `${MODULE_ID}.buttons.resistanceMentale`,
    sheet: `${MODULE_ID}.buttons.sheet`
  };
  return buttonMap[key] ?? `${MODULE_ID}.buttons.${key}`;
}

function clearHudPopoverCloseTimer() {
  if (!hoverCloseTimer) return;
  clearTimeout(hoverCloseTimer);
  hoverCloseTimer = null;
}

function closeHudPopover() {
  clearHudPopoverCloseTimer();
  const popover = document.getElementById(`${MODULE_ID}-popover`);
  if (popover) popover.remove();
}

function scheduleHudPopoverClose(delay = 120) {
  clearHudPopoverCloseTimer();
  hoverCloseTimer = setTimeout(() => {
    const popover = document.getElementById(`${MODULE_ID}-popover`);
    if (popover?.matches(":hover")) return;
    closeHudPopover();
  }, delay);
}

function positionPopover(anchor, popover) {
  const rect = anchor.getBoundingClientRect();
  const maxWidth = Math.min(420, Math.max(260, window.innerWidth - 24));
  popover.style.maxWidth = `${maxWidth}px`;
  popover.style.visibility = "hidden";
  document.body.appendChild(popover);
  const popRect = popover.getBoundingClientRect();
  let left = rect.left + rect.width / 2 - popRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popRect.width - 8));
  let top = rect.top - popRect.height - 10;
  if (top < 8) top = rect.bottom + 10;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.style.visibility = "visible";
}

function buildPopover(anchor, title, items = [], actionKey = "") {
  const existing = document.getElementById(`${MODULE_ID}-popover`);
  if (existing?.dataset.cnkAnchorKey === `${actionKey}:${anchor?.dataset?.cnkAction ?? ""}` && existing.dataset.cnkTitle === title) return existing;

  closeHudPopover();
  const popover = document.createElement("div");
  popover.id = `${MODULE_ID}-popover`;
  popover.className = "cnk-argon-popover";
  popover.dataset.cnkAnchorKey = `${actionKey}:${anchor?.dataset?.cnkAction ?? ""}`;
  popover.dataset.cnkTitle = title;
  popover.innerHTML = `<div class="cnk-argon-popover__title">${title}</div><div class="cnk-argon-popover__body"></div>`;
  const body = popover.querySelector(".cnk-argon-popover__body");
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "cnk-argon-popover__empty";
    empty.textContent = t("empty");
    body.appendChild(empty);
  } else {
    for (const item of items) body.appendChild(item);
  }
  positionPopover(anchor, popover);

  popover.addEventListener("mouseenter", () => clearHudPopoverCloseTimer());
  popover.addEventListener("mouseleave", () => scheduleHudPopoverClose(220));

  const onPointerDown = (event) => {
    if (!popover.contains(event.target) && !anchor.contains(event.target)) {
      closeHudPopover();
      document.removeEventListener("pointerdown", onPointerDown, true);
    }
  };
  document.addEventListener("pointerdown", onPointerDown, true);
  popover.addEventListener("pointerdown", (event) => event.stopPropagation(), true);
  return popover;
}

function createListButton({ img, title, subtitle = "", summary = "", onClick, hint = "" }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "cnk-argon-popover__item";
  button.innerHTML = `
    <span class="cnk-argon-popover__item-icon" style="background-image:url('${img}')"></span>
    <span class="cnk-argon-popover__item-text">
      <span class="cnk-argon-popover__item-title">${title}</span>
      <span class="cnk-argon-popover__item-subtitle">${subtitle}</span>
      ${summary ? `<span class="cnk-argon-popover__item-summary">${summary}</span>` : ""}
    </span>
  `;
  if (hint) button.title = hint;
  button.addEventListener("mouseenter", () => clearHudPopoverCloseTimer());
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearHudPopoverCloseTimer();
  }, true);
  button.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    clearHudPopoverCloseTimer();
    await onClick?.();
    closeHudPopover();
  }, true);
  return button;
}

async function showCollectionEntryInfo(item, titleOverride = "") {
  if (!item) return;
  if (typeof item.sheet?.render === "function") {
    item.sheet.render(true);
    return;
  }

  const title = titleOverride || item.name || t("subtitle.item");
  const meta = itemMeta(item);
  const descriptions = [
    item?.system?.description,
    item?.system?.desc,
    item?.system?.resume,
    item?.system?.résumé,
    item?.system?.effet,
    item?.system?.texte,
    item?.system?.notes,
    item?.system?.rang1?.description
  ].filter((value) => stripHtml(value));

  if (!descriptions.length && item?.system?.listrang) {
    for (const rang of Object.values(item.system.listrang)) {
      if (!rang?.selected) continue;
      const value = rang.description ?? rang.desc ?? rang.name;
      if (stripHtml(value)) descriptions.push(value);
    }
  }

  const description = descriptions.length
    ? await enrich(descriptions.join("<hr>"))
    : `<p>${foundry.utils.escapeHTML(t("empty"))}</p>`;

  new Dialog({
    title,
    content: `<div class="cnk-argon-entry-info"><p><strong>${foundry.utils.escapeHTML(meta)}</strong></p>${description}</div>`,
    buttons: {
      ok: { label: "OK" }
    },
    default: "ok"
  }).render(true);
}

async function showCollectionPopover(anchor, collection) {
  const actor = getCurrentHudActor();
  if (!actor) return;
  const title = game.i18n.localize(getActionLabelKey(collection));
  const items = getCollectionItems(actor, collection).map((item) => {
    const img = item.img && !item.img.endsWith("item-bag.svg") ? item.img : setBaseImg(item.type);
    const meta = collection === "voies" ? voieMeta(item) : itemMeta(item);
    const summary = collection === "voies" ? voieSummary(item) : itemSummary(item);
    const clickHint = collection === "voies"
      ? "Cliquer pour voir les informations de la voie"
      : "Cliquer pour voir les informations de l'élément";
    const hint = `${item.name}
${meta}${summary ? `
${summary}` : ""}
${clickHint}`;
    return createListButton({
      img,
      title: item.name,
      subtitle: meta,
      summary: summary,
      hint,
      onClick: async () => showCollectionEntryInfo(item, item.name)
    });
  });
  buildPopover(anchor, title, items, collection);
}

async function triggerCharacteristicRoll(actor, entry) {
  if (!actor || !entry) return;
  if (!actor.isOwner) {
    ui.notifications?.warn(t("errors.actorNotOwned"));
    return;
  }

  const title = entry.label;

  try {
    const data = buildRollData(actor, "caracteristiques", entry.key, title, false);
    if (data) {
      await sendRoll(actor, data);
      return;
    }
  } catch (error) {
    console.error(`[${MODULE_ID}] Characteristic roll failed with system data.`, error);
  }

  const fallbackMain = entry.key === "force" ? "physique" : null;
  if (fallbackMain) {
    try {
      const data = buildRollData(actor, fallbackMain, entry.key, title, false);
      if (data) {
        await sendRoll(actor, data);
        return;
      }
    } catch (error) {
      console.error(`[${MODULE_ID}] Characteristic roll fallback failed.`, error);
    }
  }

  try {
    const data = buildCharacteristicRollDataFromEntry(actor, entry, title);
    if (data) await sendRoll(actor, data);
  } catch (error) {
    console.error(`[${MODULE_ID}] Characteristic roll entry fallback failed.`, error);
    ui.notifications?.error(t("errors.characteristicRollFailed"));
  }
}

async function showCharacteristicsPopover(anchor) {
  const actor = getCurrentHudActor();
  if (!actor) return;
  const entries = getCharacteristicEntries(actor).map((entry) => createListButton({
    img: ICONS.caracteristiques,
    title: entry.label,
    subtitle: `${t("labels.modifier")} ${entry.score >= 0 ? "+" : ""}${entry.score}`,
    hint: `${entry.label}
${t("labels.modifier")} ${entry.score >= 0 ? "+" : ""}${entry.score}
Cliquer pour lancer le jet`,
    onClick: async () => triggerCharacteristicRoll(actor, entry)
  }));
  buildPopover(anchor, game.i18n.localize(getActionLabelKey("caracteristiques")), entries, "caracteristiques");
}

async function triggerInitiativeRoll() {
  const actor = getCurrentHudActor();
  if (!actor) return;
  const title = localizeMaybe("CNK.COMBAT.Initiative", game.i18n.localize(getActionLabelKey("initiative")));
  const data = buildRollData(actor, "combat", "initiative", title, false);
  if (data) sendRoll(actor, data);
}

async function triggerMentalResistanceRoll() {
  const actor = getCurrentHudActor();
  if (!actor || actor.type === "vehicule" || !actor.system?.derives?.volonte) return;
  const data = buildRollData(actor, "derives", "volonte", game.i18n.localize("CNK.DERIVES.Resistance-mentale"), true);
  if (data) sendRoll(actor, data);
}

function handleCustomActionHover(actionKey, element) {
  const anchor = element ?? document.querySelector(`#enhancedcombathud [data-cnk-action="${actionKey}"], .argon [data-cnk-action="${actionKey}"]`) ?? document.querySelector("#enhancedcombathud, .argon");
  if (!anchor) return;
  clearHudPopoverCloseTimer();
  switch (actionKey) {
    case "voies":
      return showCollectionPopover(anchor, "voies");
    case "avantages":
      return showCollectionPopover(anchor, "avantages");
    case "caracteristiques":
      return showCharacteristicsPopover(anchor);
  }
}

function handleCustomActionClick(actionKey, element) {
  const anchor = element ?? document.querySelector(`#enhancedcombathud [data-cnk-action="${actionKey}"], .argon [data-cnk-action="${actionKey}"]`) ?? document.querySelector("#enhancedcombathud, .argon");
  switch (actionKey) {
    case "voies":
      return handleCustomActionHover("voies", anchor);
    case "avantages":
      return handleCustomActionHover("avantages", anchor);
    case "caracteristiques":
      return handleCustomActionHover("caracteristiques", anchor);
    case "initiative":
      return triggerInitiativeRoll();
    case "resistancementale":
      return triggerMentalResistanceRoll();
    case "sheet": {
      const actor = getCurrentHudActor();
      return actor?.sheet?.render(true);
    }
  }
}

function isArgonHudVisible() {
  const hud = document.getElementById("enhancedcombathud");
  if (!hud) return false;
  const style = window.getComputedStyle(hud);
  return style.display !== "none" && style.visibility !== "hidden" && !hud.classList.contains("hidden");
}

function queueArgonHudOpen(token, { controlToken = false, forceRefresh = false } = {}) {
  if (game.user?.isGM) return;
  if (!canvas?.ready) return;
  if (!token?.isOwner) return;
  const actor = token.actor;
  if (!actor || !SUPPORTED_ACTOR_TYPES.includes(actor.type)) return;

  currentHudActorId = actor.id;
  lastQueuedArgonTokenId = token.id ?? actor.id;

  if (argonOpenTimer) {
    window.clearTimeout(argonOpenTimer);
    argonOpenTimer = null;
  }

  queueArgonHudOpen._forceRefresh = forceRefresh || queueArgonHudOpen._forceRefresh === true;
  queueArgonHudOpen._controlToken = controlToken || queueArgonHudOpen._controlToken === true;

  argonOpenTimer = window.setTimeout(() => {
    argonOpenTimer = null;
    const liveToken = canvas?.tokens?.get(lastQueuedArgonTokenId)
      ?? canvas?.tokens?.controlled?.find((candidate) => candidate?.id === lastQueuedArgonTokenId)
      ?? canvas?.tokens?.placeables?.find((candidate) => candidate?.id === lastQueuedArgonTokenId)
      ?? token;

    const shouldControl = queueArgonHudOpen._controlToken === true;
    const shouldRefresh = queueArgonHudOpen._forceRefresh === true;
    queueArgonHudOpen._controlToken = false;
    queueArgonHudOpen._forceRefresh = false;

    if (!liveToken?.isOwner) return;
    if (!SUPPORTED_ACTOR_TYPES.includes(liveToken.actor?.type)) return;

    if (shouldControl && !liveToken.controlled) {
      try { liveToken.control({ releaseOthers: true }); } catch (_err) {}
    }

    currentHudActorId = liveToken.actor.id;

    if (typeof ui.ARGON?.toggle !== "function") return;

    const visible = isArgonHudVisible();
    const activeActorId = ui.ARGON?.actor?.id ?? ui.ARGON?.portraitPanel?.actor?.id ?? null;
    const actorChanged = !!activeActorId && activeActorId !== liveToken.actor.id;

    if (!visible) {
      ui.ARGON.toggle();
      return;
    }

    if (shouldRefresh || actorChanged) {
      ui.ARGON.toggle();
      window.setTimeout(() => {
        if (!isArgonHudVisible() && typeof ui.ARGON?.toggle === "function") ui.ARGON.toggle();
      }, 90);
    }
  }, 220);
}

function installHudHandlers() {
  const candidates = document.querySelectorAll("#enhancedcombathud .action-element, .argon .action-element");
  for (const el of candidates) {
    const actionKey = el.dataset.cnkAction;
    if (!actionKey || el.dataset.cnkBound === "1") continue;
    el.dataset.cnkBound = "1";
    el.style.cursor = "pointer";
    if (HOVER_ACTIONS.has(actionKey)) {
      el.addEventListener("mouseenter", (_event) => {
        handleCustomActionHover(actionKey, el);
      }, true);
      el.addEventListener("mouseleave", (event) => {
        const related = event.relatedTarget;
        if (related && document.getElementById(`${MODULE_ID}-popover`)?.contains(related)) return;
        scheduleHudPopoverClose(220);
      }, true);
      el.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
      }, true);
    } else {
      el.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handleCustomActionClick(actionKey, el);
      }, true);
    }
  }
}

Hooks.on("canvasReady", () => {
  if (game.user?.isGM) return;
  const actor = game.user?.character;
  if (!actor || !canvas?.ready) return;
  const current = canvas.tokens?.controlled?.[0];
  if (current?.actor?.id === actor.id) {
    queueArgonHudOpen(current, { forceRefresh: true });
    return;
  }
  const token = canvas.tokens?.placeables?.find((t) => t.actor?.id === actor.id && t.isOwner);
  if (token) {
    token.control({ releaseOthers: true });
    queueArgonHudOpen(token, { forceRefresh: true });
  }
});

Hooks.on("controlToken", (token, controlled) => {
  if (!controlled) return;
  queueArgonHudOpen(token, { forceRefresh: true });
});

Hooks.on("createToken", (tokenDocument) => {
  if (game.user?.isGM) return;
  if (!canvas?.ready) return;
  if (tokenDocument?.parent?.id !== canvas.scene?.id) return;
  window.setTimeout(() => {
    const token = canvas.tokens?.get(tokenDocument.id);
    if (!token?.isOwner) return;
    queueArgonHudOpen(token, { controlToken: true, forceRefresh: true });
  }, 260);
});

Hooks.on("updateToken", (tokenDocument, change) => {
  if (game.user?.isGM) return;
  if (!canvas?.ready) return;
  if (tokenDocument?.parent?.id !== canvas.scene?.id) return;
  if (!["x", "y", "hidden", "actorId", "texture", "name"].some((key) => key in (change ?? {}))) return;
  window.setTimeout(() => {
    const token = canvas.tokens?.get(tokenDocument.id);
    if (!token?.isOwner) return;
    if (token.controlled || game.user?.character?.id === token.actor?.id) {
      queueArgonHudOpen(token, { forceRefresh: true });
    }
  }, 180);
});

Hooks.once("ready", () => {
  ensureRuntimeStyle();
  watchHudDom();
});

Hooks.once("init", () => {
  if (game.system.id !== "cthulhu-no-kami") return;
  Hooks.once("argonInit", (CoreHUD) => {
    const ARGON = CoreHUD.ARGON;
    const ActionPanel = ARGON.MAIN.ActionPanel;
    const { ItemButton, ActionButton, ButtonPanelButton } = ARGON.MAIN.BUTTONS;
    const { ButtonPanel } = ARGON.MAIN.BUTTON_PANELS;

    class CnkWeaponButton extends ItemButton {
      static get template() { return "modules/enhancedcombathud/templates/partials/ItemButton.hbs"; }
      get hasTooltip() { return true; }
      get subtitle() { return itemSubtitle(this.item); }
      async getTooltipData() {
        const details = [{ label: `${MODULE_ID}.tooltip.damage`, value: displayDamage(this.item) }];
        if (isWeaponType(this.item.type)) {
          details.push({ label: `${MODULE_ID}.tooltip.attackMod`, value: num(this.item.system?.wpn?.attaque?.total ?? this.item.system?.wpn?.attaque?.base, 0) });
          details.push({ label: `${MODULE_ID}.tooltip.damageMod`, value: num(this.item.system?.wpn?.degats?.total ?? this.item.system?.wpn?.degats?.base, 0) });
        }
        return { title: this.item.name, subtitle: this.subtitle, description: await enrich(this.item.system?.description ?? ""), details, properties: [] };
      }
      async _onLeftClick() { const data = buildAttackRollData(this.actor, this.item); if (data) return sendRollAtk(this.actor, data); }
      async _onRightClick() { this.item.sheet?.render(true); }
    }

    class CnkSimpleActionButton extends ActionButton {
      constructor({ actionKey, label, icon, colorScheme = 0, visible = () => true }) {
        super();
        this._actionKey = actionKey;
        this._label = label;
        this._icon = icon;
        this._colorScheme = colorScheme;
        this._visibleFn = visible;
      }
      get actionKey() { return this._actionKey; }
      get label() { return this._label; }
      get icon() { return this._icon; }
      get colorScheme() { return this._colorScheme; }
      get visible() { try { return this._visibleFn(this.actor) !== false; } catch (_err) { return true; } }
      get hasTooltip() { return !HOVER_ACTIONS.has(this.actionKey); }
      async getTooltipData() {
        return {
          title: game.i18n.localize(this.label),
          description: "",
          details: [],
          properties: []
        };
      }
      async _onMouseEnter(event) {
        if (!HOVER_ACTIONS.has(this.actionKey)) return;
        const element = event?.currentTarget ?? this.element ?? this._element ?? null;
        return handleCustomActionHover(this.actionKey, element);
      }
      async _onMouseLeave(_event) {
        if (!HOVER_ACTIONS.has(this.actionKey)) return;
        scheduleHudPopoverClose(220);
      }
      async _onLeftClick(event) {
        if (HOVER_ACTIONS.has(this.actionKey)) return;
        const element = event?.currentTarget ?? this.element ?? this._element ?? null;
        return handleCustomActionClick(this.actionKey, element);
      }
      async _onRightClick(_event) {
        if (this.actionKey === "sheet") return this.actor?.sheet?.render(true);
      }
    }

    class CnkCombatPanel extends ActionPanel {
      get label() { return `${MODULE_ID}.panels.combat`; }
      async _getButtons() {
        currentHudActorId = this.actor?.id ?? currentHudActorId;
        const items = (this.actor?.items?.contents ?? []).filter(isDisplayedAttackItem);
        return items.map((item) => new CnkWeaponButton({ item, inActionPanel: true }));
      }
    }

    class CnkActionsPanel extends ActionPanel {
      get label() { return `${MODULE_ID}.panels.actions`; }
      async _getButtons() {
        currentHudActorId = this.actor?.id ?? currentHudActorId;
        return [
          new CnkSimpleActionButton({ actionKey: "voies", label: `${MODULE_ID}.buttons.voies`, icon: ICONS.voies, colorScheme: 2 }),
          new CnkSimpleActionButton({ actionKey: "avantages", label: `${MODULE_ID}.buttons.avantages`, icon: ICONS.avantages, colorScheme: 1, visible: (actor) => getCollectionItems(actor, "avantages").length > 0 }),
          new CnkSimpleActionButton({ actionKey: "caracteristiques", label: `${MODULE_ID}.buttons.caracteristiques`, icon: ICONS.caracteristiques, colorScheme: 2, visible: (actor) => getCharacteristicEntries(actor).length > 0 }),
          new CnkSimpleActionButton({ actionKey: "initiative", label: `${MODULE_ID}.buttons.initiative`, icon: ICONS.initiative, colorScheme: 0, visible: (actor) => !!actor?.system?.combat?.initiative }),
          new CnkSimpleActionButton({ actionKey: "resistancementale", label: `${MODULE_ID}.buttons.resistanceMentale`, icon: ICONS.resistancementale, colorScheme: 1, visible: (actor) => actor?.type !== "vehicule" && actor?.system?.derives?.volonte }),
          new CnkSimpleActionButton({ actionKey: "sheet", label: `${MODULE_ID}.buttons.sheet`, icon: ICONS.sheet, colorScheme: 2 })
        ];
      }
    }

    class CnkPortraitPanel extends ARGON.PORTRAIT.PortraitPanel {
      get description() {
        const actor = this.actor;
        if (!actor) return "";
        if (actor.type === "entite") return `Challenge ${num(actor.system?.challenge, 0)}`;
        if (actor.type === "vehicule") return "Véhicule";
        return `Niveau ${num(actor.system?.niveau?.actuel, 0)}`;
      }
      async getStatBlocks() {
        const actor = this.actor; const system = actorSystem(actor); const rows = [];
        rows.push([{ text: t("portrait.hp"), color: "#d45757" }, { text: `${currentOf(system.derives?.pv)} / ${maxOf(system.derives?.pv)}` }]);
        if (actor.type === "eiyu") {
          rows.push([{ text: t("portrait.ki"), color: "#36b05d" }, { text: `${currentOf(system.derives?.ki)}` }]);
          rows.push([{ text: t("portrait.maho"), color: "#cf5f4e" }, { text: `${currentOf(system.derives?.maho)} / ${maxOf(system.derives?.maho)}` }]);
          if (system.derives?.serenite) rows.push([{ text: t("portrait.serenite"), color: "#56b9ce" }, { text: `${currentOf(system.derives?.serenite)} / ${maxOf(system.derives?.serenite)}` }]);
        } else {
          rows.push([{ text: t("portrait.defense"), color: "#53a0d5" }, { text: `${num(system.combat?.defense?.total, 0)}` }]);
          rows.push([{ text: t("portrait.initiative"), color: "#d7aa2b" }, { text: `${num(system.combat?.initiative?.total, 0)}` }]);
        }
        return rows;
      }
    }

    class CnkDrawerPanel extends ARGON.DRAWER.DrawerPanel { get visible() { return false; } get title() { return `${MODULE_ID}.panels.actions`; } get categories() { return []; } }
    class CnkWeaponSets extends ARGON.WeaponSets { get visible() { return true; } async _onSetChange() { return; } }
    class CnkMovementHud extends ARGON.MovementHud { get visible() { return false; } get movementMax() { return 1; } }
    class CnkButtonHud extends ARGON.ButtonHud { get visible() { return false; } async _getButtons() { return []; } }

    CoreHUD.defineSupportedActorTypes(SUPPORTED_ACTOR_TYPES);
    CoreHUD.definePortraitPanel(CnkPortraitPanel);
    CoreHUD.defineDrawerPanel(CnkDrawerPanel);
    CoreHUD.defineMainPanels([CnkCombatPanel, CnkActionsPanel, CoreHUD.ARGON.PREFAB.PassTurnPanel]);
    CoreHUD.defineWeaponSets(CnkWeaponSets);
    CoreHUD.defineMovementHud(CnkMovementHud);
    CoreHUD.defineButtonHud(CnkButtonHud);
  });
});
