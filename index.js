// ==UserScript==
// @name         OGame Discovery Helper
// @namespace    ogame.discovery.helper
// @version      18.4
// @description  Discovery Tracker
// @match        https://*.ogame.gameforge.com/game/*
// @grant        none
// ==/UserScript==

(
    function () {
        "use strict";

        const STORAGE_KEY = "ogameDiscovery";
        const MAX_SYSTEM = 499;
        const MAX_POSITION = 15;
        const SCAN_DELAY = 250;
        const DISCOVERY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
        const DISCOVERY_RESEND_SCAN_COUNT = 12;
        const DISCOVERY_RESEND_SCAN_INTERVAL_MS = 800;

        let resendScanTimer = null;

        function loadData () {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
            } catch (e) {
                return {};
            }
        }

        function saveData (data) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        }

        function getPlanetCoords () {
            const el = document.querySelector(".planetlink.active .planet-koords");
            if (!el) {
                return null;
            }

            const match = el.textContent.match(/\[(\d+):(\d+):(\d+)\]/);
            if (!match) {
                return null;
            }

            return {
                galaxy: parseInt(match[1], 10),
                system: parseInt(match[2], 10),
                position: parseInt(match[3], 10),
            };
        }

        function getVisibleGalaxyCoords () {
            const gInput = document.querySelector("#galaxy_input");
            const sInput = document.querySelector("#system_input");

            if (gInput && sInput && gInput.value && sInput.value) {
                const galaxy = parseInt(gInput.value, 10);
                const system = parseInt(sInput.value, 10);

                if (Number.isFinite(galaxy) && Number.isFinite(system)) {
                    return {galaxy, system};
                }
            }

            const discoverLink = document.querySelector(".galaxyRow .planetDiscover[onclick]");
            if (discoverLink) {
                const onclick = discoverLink.getAttribute("onclick") || "";
                const match = onclick.match(/'galaxy':\s*(\d+).*?'system':\s*(\d+)/s);

                if (match) {
                    return {
                        galaxy: parseInt(match[1], 10),
                        system: parseInt(match[2], 10),
                    };
                }
            }

            const galaxyContent = document.querySelector("#galaxyContent");
            if (galaxyContent) {
                const html = galaxyContent.innerHTML;
                const match = html.match(/\[(\d+):(\d+):(\d+)\]/);

                if (match) {
                    return {
                        galaxy: parseInt(match[1], 10),
                        system: parseInt(match[2], 10),
                    };
                }
            }

            return null;
        }

        function parseCooldown (text) {
            if (!text) {
                return null;
            }

            const plainText = text
                .replace(/<[^>]+>/g, " ")
                .replace(/&nbsp;/g, " ")
                .trim();

            const match = plainText.match(/(\d+)\s*(?:t|d)\s*(\d+)\s*h\s*(\d+)\s*m\s*(\d+)\s*s/i);
            if (!match) {
                return null;
            }

            const d = parseInt(match[1], 10);
            const h = parseInt(match[2], 10);
            const m = parseInt(match[3], 10);
            const s = parseInt(match[4], 10);

            return Date.now() + (
                (
                    (
                        d * 24 + h
                    ) * 60 + m
                ) * 60 + s
            ) * 1000;
        }

        function getUnavailableUntil (tooltip) {
            const parsed = parseCooldown(tooltip);
            if (parsed) {
                return parsed;
            }

            return Date.now() + DISCOVERY_COOLDOWN_MS;
        }

        function isFleetSlotLimit (text) {
            if (!text) {
                return false;
            }

            return /maximale\s+anzahl\s+flotten\s+erreicht|keine\s+freien\s+flottenslots\s+verf[üu]gbar/i.test(text);
        }

        function normalizeSystem (system) {
            let result = system;

            while (result < 1) {
                result += MAX_SYSTEM;
            }
            while (result > MAX_SYSTEM) {
                result -= MAX_SYSTEM;
            }

            return result;
        }

        function getSystemSearchOrder (start) {
            const order = [start];

            for (let dist = 1; dist <= Math.floor(MAX_SYSTEM / 2); dist++) {
                const left = normalizeSystem(start - dist);
                const right = normalizeSystem(start + dist);

                order.push(left);

                if (right !== left) {
                    order.push(right);
                }
            }

            return order;
        }

        function scanSystem () {
            const coords = getVisibleGalaxyCoords();
            if (!coords) {
                return;
            }

            const cells = document.querySelectorAll(".galaxyRow .cellPosition");
            if (cells.length !== 15) {
                return;
            }

            const data = loadData();

            cells.forEach((cell) => {
                const position = parseInt(cell.textContent.trim(), 10);
                if (!position || position > MAX_POSITION) {
                    return;
                }

                const row = cell.closest(".galaxyRow");
                if (!row) {
                    return;
                }

                const icon = row.querySelector(".planetDiscoverIcons");
                if (!icon) {
                    return;
                }

                const key = coords.galaxy + ":" + coords.system + ":" + position;

                if (icon.classList.contains("planetDiscoverUnavailable")) {
                    const tooltip = icon.getAttribute("data-tooltip-title") || "";

                    if (isFleetSlotLimit(tooltip)) {
                        return;
                    }

                    data[key] = getUnavailableUntil(tooltip);
                    return;
                }

                if (icon.classList.contains("planetDiscoverDefault")) {
                    data[key] = 0;
                }
            });

            saveData(data);
        }

        function findNext () {
            const start = getPlanetCoords();
            if (!start) {
                return null;
            }

            const data = loadData();
            const now = Date.now();
            const systems = getSystemSearchOrder(start.system);

            for (const system of systems) {
                for (let p = 1; p <= MAX_POSITION; p++) {
                    const key = start.galaxy + ":" + system + ":" + p;

                    if (!(
                        key in data
                    )) {
                        continue;
                    }

                    const value = data[key];

                    if (value === 0 || value < now) {
                        return {
                            g: start.galaxy,
                            s: system,
                            p: p,
                        };
                    }
                }
            }

            return null;
        }


        function runScanAndRefresh () {
            scanSystem();
            updateUI();
        }

        function reserveNextDiscoveryTarget () {
            const next = findNext();
            if (!next) {
                return;
            }

            const data = loadData();
            const key = next.g + ":" + next.s + ":" + next.p;

            data[key] = Date.now() + DISCOVERY_COOLDOWN_MS;
            saveData(data);
            updateUI();
        }

        function scheduleDiscoverySendRescanBurst () {
            if (resendScanTimer) {
                clearInterval(resendScanTimer);
                resendScanTimer = null;
            }

            let runs = 0;
            runScanAndRefresh();

            resendScanTimer = setInterval(() => {
                runScanAndRefresh();
                runs += 1;

                if (runs >= DISCOVERY_RESEND_SCAN_COUNT) {
                    clearInterval(resendScanTimer);
                    resendScanTimer = null;
                }
            }, DISCOVERY_RESEND_SCAN_INTERVAL_MS);
        }

        function createUI () {
            let box = document.getElementById("discoverHelper");
            if (box) {
                return box;
            }

            box = document.createElement("div");
            box.id = "discoverHelper";

            box.style.position = "relative";
            box.style.background = "rgba(0,0,0,0.85)";
            box.style.color = "white";
            box.style.padding = "12px";
            box.style.border = "1px solid #555";
            box.style.fontSize = "13px";
            box.style.zIndex = "9999";
            box.style.borderRadius = "6px";
            box.style.lineHeight = "1.4";
            box.style.display = "flex";
            box.style.flexDirection = "column";
            box.style.top = "10px";
            box.style.marginBottom = "20px";

            const toolbar = document.getElementById("toolbarcomponent");
            if (toolbar && toolbar.parentNode) {
                toolbar.insertAdjacentElement("afterend", box);
                return box;
            }

            document.body.appendChild(box);
            return box;
        }

        function updateUI () {
            const box = createUI();
            const planet = getPlanetCoords();
            const next = findNext();

            if (!planet) {
                box.innerHTML = "Koordinaten nicht erkannt";
                return;
            }

            let html = "";
            html += "Aktueller Planet<br>";
            html += "<b>" + planet.galaxy + ":" + planet.system + ":" + planet.position + "</b><br>";

            if (!next) {
                html += "Keine freie Entdeckung gefunden";
                box.innerHTML = html;
                return;
            }

            const url = location.origin +
                "/game/index.php?page=ingame&component=galaxy&galaxy=" +
                next.g + "&system=" + next.s;

            html += "Nächste Entdeckung<br>";
            html += "<a href=\"" + url + "\" style=\"color:#6cf;font-weight:bold;text-decoration:none;\">";
            html += next.g + ":" + next.s + ":" + next.p;
            html += "</a>";

            box.innerHTML = html;
        }

        function scheduleRescan () {
            setTimeout(() => {
                runScanAndRefresh();
            }, SCAN_DELAY);

            setTimeout(() => {
                runScanAndRefresh();
            }, 900);
        }

        function observeGalaxy () {
            const galaxy = document.querySelector("#galaxyContent");
            if (!galaxy) {
                return;
            }

            const observer = new MutationObserver(() => {
                scheduleRescan();
            });

            observer.observe(galaxy, {
                childList: true,
                subtree: true
            });

            scheduleRescan();
        }


        function observeDiscoveryActions () {
            document.addEventListener("click", (event) => {
                const source = event.target instanceof Element
                    ? event.target
                    : event.target instanceof Node
                        ? event.target.parentElement
                        : null;
                if (!source) {
                    return;
                }

                const target = source.closest("#ago_discovery");
                if (!target) {
                    return;
                }

                reserveNextDiscoveryTarget();
                scheduleDiscoverySendRescanBurst();
            }, true);
        }

        function init () {
            createUI();
            updateUI();
            observeGalaxy();
            observeDiscoveryActions();

            setTimeout(() => {
                runScanAndRefresh();
            }, 1200);
        }

        init();
    }
)();
