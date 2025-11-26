(function () {

    let config = { deepLKey: null, useTrans: true, mode: true };
    let currentKey = null;
    let lyricsData = [];


    const ui = {
        container: null, bg: null, wrapper: null,
        title: null, artist: null, artwork: null,
        lyrics: null, input: null, settings: null,
        btnArea: null, aiInfo: null
    };

    let hideTimer = null;


    const handleInteraction = () => {
        if (!ui.btnArea) return;

        ui.btnArea.classList.remove('inactive');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => {
            if (!ui.settings?.classList.contains('active') && !ui.btnArea.matches(':hover')) {
                ui.btnArea.classList.add('inactive');
            }
        }, 3000);
    };

    const storage = {
        _api: chrome?.storage?.local,
        get: (k) => new Promise(r => {
            if (!storage._api) return r(null);
            storage._api.get([k], res => r(res[k] || null));
        }),
        set: (k, v) => {
            if (!storage._api) return;
            storage._api.set({ [k]: v });
        },
        remove: (k) => {
            if (!storage._api) return;
            storage._api.remove(k);
        },
        clear: () => confirm('全データを削除しますか？') && storage._api?.clear(() => location.reload())
    };


    const parseLRC = (lrc) => {
        if (!lrc) return [];
        // Allow 1-2 digits for min/sec, optional milliseconds (2 or 3 digits)
        const timeExp = /\[(\d{1,2})\:(\d{1,2})(?:\.(\d{1,3}))?\]/;

        const lines = lrc.split('\n').reduce((acc, line) => {
            const m = line.match(timeExp);
            if (!m) return acc;

            const min = parseInt(m[1]);
            const sec = parseInt(m[2]);
            const msStr = m[3];

            let seconds = min * 60 + sec;

            if (msStr) {
                const ms = parseInt(msStr);
                if (msStr.length === 3) {
                    seconds += ms / 1000;
                } else {
                    // 2 digits (centiseconds) or 1 digit (deciseconds?) - usually centiseconds in LRC
                    seconds += ms / 100;
                }
            }

            const text = line.replace(timeExp, '').trim();
            if (text) acc.push({ time: seconds, text });
            return acc;
        }, []);

        // Sort by time to ensure correct syncing
        return lines.sort((a, b) => a.time - b.time);
    };


    const translate = async (lines) => {
        if (!config.deepLKey || !config.useTrans || !lines.length || lines[0].translation) return lines;
        try {
            const res = await new Promise(resolve => {
                chrome.runtime.sendMessage({
                    type: 'TRANSLATE',
                    payload: { text: lines.map(l => l.text), apiKey: config.deepLKey }
                }, resolve);
            });
            if (res?.success && res.translations?.length === lines.length) {
                lines.forEach((l, i) => l.translation = res.translations[i].text);
            }
        } catch (e) { console.error('DeepL failed', e); }
        return lines;
    };

    const getMetadata = () => {
        if (navigator.mediaSession?.metadata) {
            const { title, artist, artwork } = navigator.mediaSession.metadata;
            return { title, artist, src: artwork.length ? artwork[artwork.length - 1].src : null };
        }
        const t = document.querySelector('yt-formatted-string.title.style-scope.ytmusic-player-bar');
        const a = document.querySelector('.byline.style-scope.ytmusic-player-bar');
        return (t && a) ? { title: t.textContent, artist: a.textContent.split('•')[0].trim(), src: null } : null;
    };


    const createEl = (tag, id, cls, html) => {
        const el = document.createElement(tag);
        if (id) el.id = id;
        if (cls) el.className = cls;
        if (html) el.innerHTML = html;
        return el;
    };

    function setupAutoHideEvents() {

        if (document.body.dataset.autohideSetup) return;

        ['mousemove', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, handleInteraction));
        document.body.dataset.autohideSetup = "true";


        handleInteraction();
    }

    function initSettings() {
        if (ui.settings) return;
        ui.settings = createEl('div', 'ytm-settings-panel', '', `
            <h3>Settings</h3>
            <div class="setting-item">
                <label class="toggle-label"><span>Translation</span><input type="checkbox" id="trans-toggle"></label>
            </div>
            <div class="setting-item" style="margin-top:15px;">
                <input type="password" id="deepl-key-input" placeholder="DeepL API Key">
            </div>
            <div style="display:flex; gap:10px; margin-top:20px;">
                <button id="save-settings-btn" style="flex:1;">Save</button>
                <button id="clear-all-btn" style="background:#ff3b30; color:white;">Reset</button>
            </div>
        `);
        document.body.appendChild(ui.settings);

        document.getElementById('deepl-key-input').value = config.deepLKey || '';
        document.getElementById('trans-toggle').checked = config.useTrans;

        document.getElementById('save-settings-btn').onclick = () => {
            config.deepLKey = document.getElementById('deepl-key-input').value.trim();
            config.useTrans = document.getElementById('trans-toggle').checked;
            storage.set('ytm_deepl_key', config.deepLKey);
            storage.set('ytm_trans_enabled', config.useTrans);
            alert('Saved');
            ui.settings.classList.remove('active');
            currentKey = null; // force refresh
        };
        document.getElementById('clear-all-btn').onclick = storage.clear;
    }

    function initLayout() {
        if (document.getElementById('ytm-custom-wrapper')) {

            ui.wrapper = document.getElementById('ytm-custom-wrapper');
            ui.bg = document.getElementById('ytm-custom-bg');
            ui.lyrics = document.getElementById('my-lyrics-container');
            ui.title = document.getElementById('ytm-custom-title');
            ui.artist = document.getElementById('ytm-custom-artist');
            ui.artwork = document.getElementById('ytm-artwork-container');
            ui.btnArea = document.getElementById('ytm-btn-area');
            ui.aiInfo = document.getElementById('ytm-ai-info-area');

            // ★修正: handleInteractionが定義済みなのでここで呼ぶ
            setupAutoHideEvents();
            return;
        }

        ui.bg = createEl('div', 'ytm-custom-bg');
        document.body.appendChild(ui.bg);

        ui.wrapper = createEl('div', 'ytm-custom-wrapper');
        const leftCol = createEl('div', 'ytm-custom-left-col');

        ui.artwork = createEl('div', 'ytm-artwork-container');
        const info = createEl('div', 'ytm-custom-info-area');
        ui.title = createEl('div', 'ytm-custom-title');
        ui.artist = createEl('div', 'ytm-custom-artist');

        ui.btnArea = createEl('div', 'ytm-btn-area');
        const btns = [
            { txt: 'Upload', click: () => ui.input?.click() },
            { txt: '🗑️', cls: 'icon-btn', click: () => currentKey && confirm('歌詞を消しますか？') && storage.remove([currentKey, currentKey + "_TR"]) && (currentKey = null) },
            { txt: '⚙️', cls: 'icon-btn', click: () => { initSettings(); ui.settings.classList.toggle('active'); } }
        ];

        btns.forEach(b => {
            const btn = createEl('button', '', `ytm-glass-btn ${b.cls || ''}`, b.txt);
            btn.onclick = b.click;
            ui.btnArea.appendChild(btn);
        });

        ui.input = createEl('input');
        ui.input.type = 'file'; ui.input.accept = '.lrc,.txt'; ui.input.style.display = 'none';
        ui.input.onchange = handleUpload;
        document.body.appendChild(ui.input);

        info.append(ui.title, ui.artist, ui.btnArea);
        leftCol.append(ui.artwork, info);

        // Right Column
        const rightCol = createEl('div', 'ytm-custom-right-col');
        ui.aiInfo = createEl('div', 'ytm-ai-info-area');
        ui.lyrics = createEl('div', 'my-lyrics-container');

        rightCol.append(ui.aiInfo, ui.lyrics);
        ui.wrapper.append(leftCol, rightCol);
        document.body.appendChild(ui.wrapper);


        setupAutoHideEvents();
    }


    let lastVideoId = null;

    const getPlayerVideoId = () => {
        try {
            const player = document.getElementById('movie_player');
            if (player && player.getVideoData) {
                return player.getVideoData().video_id;
            }
        } catch (e) { }
        return null;
    };

    const tick = async () => {

        if (!document.getElementById('my-mode-toggle')) {
            const rc = document.querySelector('.right-controls-buttons');
            if (rc) {
                const btn = createEl('button', 'my-mode-toggle', '', 'IMMERSION');
                btn.onclick = () => { config.mode = !config.mode; document.body.classList.toggle('ytm-custom-layout', config.mode); };
                rc.prepend(btn);
            }
        }

        const layout = document.querySelector('ytmusic-app-layout');
        const isPlayerOpen = layout?.hasAttribute('player-page-open');

        if (!config.mode || !isPlayerOpen) {
            document.body.classList.remove('ytm-custom-layout');
            return;
        }

        document.body.classList.add('ytm-custom-layout');
        initLayout(); // Ensure UI exists

        const meta = getMetadata();
        if (!meta) return;

        const key = `${meta.title}///${meta.artist}`;
        const currentUrlId = getVideoId();
        const playerVideoId = getPlayerVideoId();

        if (currentKey !== key) {
            // Wait for URL to update if it matches the previous ID
            if (lastVideoId && currentUrlId === lastVideoId) {
                return;
            }

            // Wait for Player to actually load the new video
            if (playerVideoId && currentUrlId && playerVideoId !== currentUrlId) {
                return;
            }

            currentKey = key;
            lastVideoId = currentUrlId;
            updateMetaUI(meta);
            loadLyrics(meta);
        } else if (currentUrlId !== lastVideoId) {
            lastVideoId = currentUrlId;
        }
    };

    function updateMetaUI(meta) {
        ui.title.innerText = meta.title;
        ui.artist.innerText = meta.artist;
        if (meta.src) {
            ui.artwork.innerHTML = `<img src="${meta.src}" crossorigin="anonymous">`;
            ui.bg.style.backgroundImage = `url(${meta.src})`;
        }
        ui.lyrics.innerHTML = '<div style="opacity:0.5; padding:20px;">Loading...</div>';
        if (ui.aiInfo) ui.aiInfo.innerHTML = ''; // Clear AI info on track change
    }

    const getVideoId = () => {
        const params = new URLSearchParams(window.location.search);
        return params.get('v');
    };

    async function loadLyrics(meta) {
        lyricsData = []; // Clear immediately to prevent stale sync

        if (!config.deepLKey) config.deepLKey = await storage.get('ytm_deepl_key');
        const cachedTrans = await storage.get('ytm_trans_enabled');
        if (cachedTrans !== undefined) config.useTrans = cachedTrans;


        let data = await storage.get(currentKey + "_TR") || await storage.get(currentKey);
        let metadata = await storage.get(currentKey + "_META");


        if (!data) {
            try {
                const q = encodeURIComponent(`${meta.title} ${meta.artist}`.replace(/\s*[\(-\[].*?[\)-]].*/, ""));
                const res = await fetch(`https://lrclib.net/api/search?q=${q}`).then(r => r.json());
                const hit = res.find(i => i.syncedLyrics);
                if (hit) {
                    data = hit.syncedLyrics;
                    metadata = { source: 'lrclib' };
                    storage.set(currentKey + "_META", metadata);
                }
            } catch (e) { console.warn('LRCLib fetch failed'); }
        }

        // Fallback: Custom AI Generator
        if (!data) {
            const videoId = getVideoId();
            if (videoId) {
                // Show generating message without stopping music
                if (ui.lyrics) ui.lyrics.innerHTML = '<div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; opacity:0.7; gap:10px;"><div style="font-size:3em; font-weight:bold;">Generating Lyrics with AI...</div><div style="font-size:1.5em; opacity:0.8;">Youtube LRC Generatorに接続して歌詞を生成しています...</div><div class="loader" style="width:24px; height:24px; border:3px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin 1s linear infinite;"></div></div>';

                // Add spinner style if not exists
                if (!document.getElementById('ytm-loader-style')) {
                    const style = document.createElement('style');
                    style.id = 'ytm-loader-style';
                    style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
                    document.head.appendChild(style);
                }

                try {
                    // Polling logic: Retry if 429 (Processing) is returned
                    let res;
                    const maxRetries = 20; // 3s * 20 = 60s timeout

                    for (let i = 0; i < maxRetries; i++) {
                        const response = await fetch(`https://v2.app.lapius7.com/lrc_generator/api/youtubemusicmodenui.php?v=${videoId}`);

                        if (response.status === 429) {
                            // Still processing, wait 3s and retry
                            await new Promise(r => setTimeout(r, 3000));
                            continue;
                        }

                        res = await response.json();
                        break;
                    }

                    if (res && res.success && res.lrc) {
                        data = res.lrc;
                        metadata = { source: 'ai', generatedId: res.generatedId, videoId: videoId };
                        storage.set(currentKey + "_META", metadata);
                    } else {
                        throw new Error(res?.error || 'Unknown error');
                    }
                } catch (e) {
                    console.warn('AI Generator fetch failed', e);
                    if (ui.lyrics) ui.lyrics.innerHTML = '<div style="opacity:0.5; padding:20px;">Failed to generate lyrics.</div>';
                }
            }
        }

        if (!data) {
            renderLyrics([], metadata);
            if (ui.lyrics) {
                ui.lyrics.innerHTML = ''; // Clear previous content
                const noLyricsMsg = createEl('div', '', '', '<div style="opacity:0.5; padding:20px; text-align:center;">No lyrics found.</div>');
                ui.lyrics.appendChild(noLyricsMsg);
                renderAIInfo(metadata);
            }
            return;
        }


        if (typeof data === 'string') {
            let parsed = parseLRC(data);

            if (config.useTrans && config.deepLKey) {
                parsed = await translate(parsed);
                storage.set(currentKey + "_TR", parsed);
            } else {
                storage.set(currentKey, data);
            }
            lyricsData = parsed;
            renderLyrics(parsed, metadata);
        } else {

            lyricsData = data;
            renderLyrics(data, metadata);
        }
    }

    function renderLyrics(data, metadata) {
        if (!ui.lyrics) return;
        ui.lyrics.innerHTML = '';
        document.body.classList.toggle('ytm-no-lyrics', !data.length);

        data.forEach(line => {
            const row = createEl('div', '', 'lyric-line', `<span>${line.text}</span>`);
            if (line.translation) row.appendChild(createEl('span', '', 'lyric-translation', line.translation));
            row.onclick = () => document.querySelector('video').currentTime = line.time;
            ui.lyrics.appendChild(row);
        });

        renderAIInfo(metadata);
    }

    function renderAIInfo(metadata) {
        if (!ui.aiInfo) return;
        ui.aiInfo.innerHTML = '';
        ui.aiInfo.style.display = 'none';

        // Only show for AI generated content
        if (!metadata || metadata.source !== 'ai') return;

        ui.aiInfo.style.display = 'block';

        const container = createEl('div', '', 'ytm-ai-status-bar');

        // Status Label
        const status = createEl('div', '', 'ytm-ai-status');
        status.innerHTML = `<span class="ytm-ai-icon">✨</span> AI Generated`;

        // Actions
        const actions = createEl('div', '', 'ytm-ai-actions');

        const regenBtn = createEl('a', '', 'ytm-ai-action-btn', 'Information');
        let editUrl = `https://v2.app.lapius7.com/lrc_generator/${metadata.videoId || ''}`;
        if (metadata.generatedId) {
            editUrl += `#${metadata.generatedId}`;
        }
        regenBtn.href = editUrl;
        regenBtn.target = "_blank";
        regenBtn.title = "Regenerate or Edit Lyrics";

        actions.appendChild(regenBtn);

        if (metadata.generatedId && metadata.videoId) {
            const playerBtn = createEl('a', '', 'ytm-ai-action-btn player', '独自プレイヤー');
            playerBtn.href = `https://v2.app.lapius7.com/lrc_generator/${metadata.videoId}/player#${metadata.generatedId}`;
            playerBtn.target = "_blank";
            playerBtn.title = "Open in Standalone Player";
            actions.appendChild(playerBtn);
        }

        container.appendChild(status);
        container.appendChild(actions);
        ui.aiInfo.appendChild(container);
    }

    const handleUpload = (e) => {
        const file = e.target.files[0];
        if (!file || !currentKey) return;
        const r = new FileReader();
        r.onload = (ev) => {
            storage.set(currentKey, ev.target.result);
            storage.set(currentKey + "_META", { source: 'custom' }); // Set custom source
            currentKey = null; // reload
        };
        r.readAsText(file);
        e.target.value = '';
    };

    // Sync Logic
    document.addEventListener('timeupdate', (e) => {
        if (!document.body.classList.contains('ytm-custom-layout') || !lyricsData.length) return;
        if (e.target.tagName !== 'VIDEO') return;

        const t = e.target.currentTime;
        let idx = lyricsData.findIndex(l => l.time > t) - 1;
        if (idx < 0) idx = lyricsData[lyricsData.length - 1].time <= t ? lyricsData.length - 1 : -1;

        const current = lyricsData[idx];
        const next = lyricsData[idx + 1];
        const isInterlude = current && next && (next.time - current.time > 10) && (t - current.time > 6);

        const rows = document.querySelectorAll('.lyric-line');
        rows.forEach((r, i) => {
            if (i === idx && !isInterlude) {
                if (!r.classList.contains('active')) {
                    r.classList.add('active');
                    r.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            } else {
                r.classList.remove('active');
            }
        });
    }, true);

    console.log("YTM Immersion loaded.");
    setInterval(tick, 1000);
})();
