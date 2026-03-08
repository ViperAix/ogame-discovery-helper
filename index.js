// ==UserScript==
// @name         OGame Discovery Helper
// @namespace    ogame.discovery.helper
// @version      18.0
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
            const match = text.match(/(\d+)t\s*(\d+)h\s*(\d+)m\s*(\d+)s/);
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
                    const cooldown = parseCooldown(tooltip);

                    if (cooldown) {
                        data[key] = cooldown;
                    }
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

        function createUI () {
            let box = document.getElementById("discoverHelper");
            if (box) {
                return box;
            }

            box = document.createElement("div");
            box.id = "discoverHelper";

            box.style.position = "fixed";
            box.style.right = "20px";
            box.style.bottom = "120px";
            box.style.background = "rgba(0,0,0,0.85)";
            box.style.color = "white";
            box.style.padding = "12px";
            box.style.border = "1px solid #555";
            box.style.fontSize = "13px";
            box.style.zIndex = "9999";
            box.style.borderRadius = "6px";
            box.style.lineHeight = "1.4";
            box.style.minWidth = "190px";

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
            html += "<b>" + planet.galaxy + ":" + planet.system + ":" + planet.position + "</b><br><br>";

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
                scanSystem();
                updateUI();
            }, SCAN_DELAY);

            setTimeout(() => {
                scanSystem();
                updateUI();
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

        function init () {
            createUI();
            updateUI();
            observeGalaxy();

            setTimeout(() => {
                scanSystem();
                updateUI();
            }, 1200);
        }

        init();
    }
)();