(function() {
   
    let config = { deepLKey: null, useTrans: true, mode: true };
    let currentKey = null;
    let lyricsData = [];
    let hasTimestamp = false; // タイムスタンプの有無フラグ
    
    const ui = {
        container: null, bg: null, wrapper: null, 
        title: null, artist: null, artwork: null, 
        lyrics: null, input: null, settings: null,
        btnArea: null, uploadMenu: null, deleteDialog: null
    };

    let hideTimer = null;
    let uploadMenuGlobalSetup = false;
    let deleteDialogGlobalSetup = false;

    // ▼ グラス風メニュー/ダイアログ用のスタイルを追加
    (function injectGlassMenuStyle() {
        const styleId = 'ytm-glass-menu-style';
        if (document.getElementById(styleId)) return;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .ytm-upload-menu {
                position: absolute;
                bottom: 52px;
                right: 0;
                min-width: 240px;
                padding: 8px;
                border-radius: 18px;
                background: rgba(15, 15, 20, 0.75);
                box-shadow: 0 18px 40px rgba(0, 0, 0, 0.55);
                backdrop-filter: blur(22px) saturate(160%);
                -webkit-backdrop-filter: blur(22px) saturate(160%);
                border: 1px solid rgba(255, 255, 255, 0.16);
                display: flex;
                flex-direction: column;
                gap: 4px;
                z-index: 9999;
                transform-origin: bottom right;
                transform: translateY(6px) scale(0.96);
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.16s ease-out, transform 0.16s ease-out;
            }
            .ytm-upload-menu.visible {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
            }
            .ytm-upload-menu-title {
                font-size: 12px;
                opacity: 0.75;
                padding: 4px 10px 6px;
            }
            .ytm-upload-menu-item {
                border: none;
                background: transparent;
                color: #fff;
                padding: 8px 10px;
                font-size: 13px;
                display: flex;
                align-items: center;
                gap: 8px;
                border-radius: 12px;
                cursor: pointer;
                text-align: left;
                width: 100%;
            }
            .ytm-upload-menu-item:hover {
                background: rgba(255, 255, 255, 0.12);
            }
            .ytm-upload-menu-item-icon {
                width: 20px;
                display: inline-flex;
                justify-content: center;
                align-items: center;
                opacity: 0.9;
            }
            .ytm-upload-menu-separator {
                height: 1px;
                margin: 4px 6px;
                background: radial-gradient(circle at center, rgba(255,255,255,0.4), transparent);
                opacity: 0.6;
            }

            /* 削除用グラスダイアログ */
            .ytm-confirm-dialog {
                position: absolute;
                bottom: 52px;
                right: 56px;
                min-width: 260px;
                padding: 10px 10px 8px;
                border-radius: 18px;
                background: rgba(15, 15, 20, 0.92);
                box-shadow: 0 18px 40px rgba(0, 0, 0, 0.65);
                backdrop-filter: blur(22px) saturate(160%);
                -webkit-backdrop-filter: blur(22px) saturate(160%);
                border: 1px solid rgba(255, 255, 255, 0.16);
                z-index: 9999;
                transform-origin: bottom right;
                transform: translateY(6px) scale(0.96);
                opacity: 0;
                pointer-events: none;
                transition: opacity 0.16s ease-out, transform 0.16s ease-out;
            }
            .ytm-confirm-dialog.visible {
                opacity: 1;
                transform: translateY(0) scale(1);
                pointer-events: auto;
            }
            .ytm-confirm-title {
                font-size: 13px;
                font-weight: 600;
                margin-bottom: 4px;
            }
            .ytm-confirm-message {
                font-size: 12px;
                opacity: 0.85;
                margin-bottom: 10px;
                line-height: 1.4;
            }
            .ytm-confirm-buttons {
                display: flex;
                justify-content: flex-end;
                gap: 8px;
            }
            .ytm-confirm-btn {
                border-radius: 999px;
                padding: 5px 12px;
                border: none;
                font-size: 12px;
                cursor: pointer;
            }
            .ytm-confirm-btn.cancel {
                background: transparent;
                color: #fff;
                border: 1px solid rgba(255, 255, 255, 0.2);
            }
            .ytm-confirm-btn.cancel:hover {
                background: rgba(255, 255, 255, 0.12);
            }
            .ytm-confirm-btn.danger {
                background: rgba(255, 61, 80, 0.9);
                color: #fff;
            }
            .ytm-confirm-btn.danger:hover {
                background: rgba(255, 61, 80, 1);
            }
        `;
        document.head.appendChild(style);
    })();

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

    // LRCHub形式対応 + タイムスタンプ無しのときは静的テキスト扱い
    const parseLRC = (lrc) => {
        hasTimestamp = false;
        if (!lrc) return [];

        // タグが1つでもあるかチェック
        const tagTest = /\[\d{2}:\d{2}\.\d{2,3}\]/;
        if (!tagTest.test(lrc)) {
            // ★タイムスタンプ無し → time:null の静的テキストとして扱う
            return lrc
                .split(/\r?\n/)
                .map(t => t.trim())
                .filter(Boolean)
                .map(text => ({
                    time: null,
                    text
                }));
        }

        // ここからはタイムスタンプ付き
        hasTimestamp = true;

        const tagExp = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
        const result = [];
        let match;
        let lastTime = null;
        let lastIndex = 0;

        while ((match = tagExp.exec(lrc)) !== null) {
            const min = parseInt(match[1], 10);
            const sec = parseInt(match[2], 10);
            const fracStr = match[3];
            const frac = parseInt(fracStr, 10) / (fracStr.length === 2 ? 100 : 1000);
            const time = min * 60 + sec + frac;

            if (lastTime !== null) {
                // 前のタグから今回のタグの直前までが「前の行の歌詞」
                const rawText = lrc.slice(lastIndex, match.index);
                const text = rawText.replace(/\r?\n/g, ' ').trim();
                if (text) {
                    result.push({ time: lastTime, text });
                }
            }

            lastTime = time;
            lastIndex = tagExp.lastIndex;
        }

        // 最後のタグ以降のテキストも行として追加
        if (lastTime !== null && lastIndex < lrc.length) {
            const rawText = lrc.slice(lastIndex);
            const text = rawText.replace(/\r?\n/g, ' ').trim();
            if (text) {
                result.push({ time: lastTime, text });
            }
        }

        return result;
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

    // ★現在再生中の動画URLを取得して youtu.be に変換
    const getCurrentVideoUrl = () => {
        try {
            const url = new URL(location.href);
            const vid = url.searchParams.get('v');
            if (vid) {
                return `https://youtu.be/${vid}`;
            }
            // vパラメータがない場合はそのまま
            return location.href;
        } catch (e) {
            console.warn('Failed to get current video url', e);
            return '';
        }
    };

    // ★現在再生中の動画IDだけ欲しいとき用
    const getCurrentVideoId = () => {
        try {
            const url = new URL(location.href);
            return url.searchParams.get('v');
        } catch (e) {
            console.warn('Failed to get current video id', e);
            return null;
        }
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

    // ★ Uploadボタン用 グラスUIメニュー作成
    function setupUploadMenu(uploadBtn) {
        if (!ui.btnArea || ui.uploadMenu) return;

        ui.btnArea.style.position = 'relative';

        const menu = createEl('div', 'ytm-upload-menu', 'ytm-upload-menu');
        menu.innerHTML = `
            <div class="ytm-upload-menu-title">歌詞アップロード</div>
            <button class="ytm-upload-menu-item" data-action="local">
                <span class="ytm-upload-menu-item-icon">💾</span>
                <span>ローカルフォルダーのアップロード</span>
            </button>
            <button class="ytm-upload-menu-item" data-action="add-sync">
                <span class="ytm-upload-menu-item-icon">✨</span>
                <span>歌詞の同期表示を追加</span>
            </button>
            <div class="ytm-upload-menu-separator"></div>
            <button class="ytm-upload-menu-item" data-action="fix">
                <span class="ytm-upload-menu-item-icon">✏️</span>
                <span>歌詞の間違い修正リクエスト</span>
            </button>
        `;
        ui.btnArea.appendChild(menu);
        ui.uploadMenu = menu;

        const toggleMenu = (show) => {
            if (!ui.uploadMenu) return;
            const cl = ui.uploadMenu.classList;
            if (show === undefined) {
                cl.toggle('visible');
            } else if (show) {
                cl.add('visible');
            } else {
                cl.remove('visible');
            }
        };

        // Uploadボタンをトグルとして使う
        uploadBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            toggleMenu();
        });

        // メニュー内クリック処理
        ui.uploadMenu.addEventListener('click', (ev) => {
            const target = ev.target.closest('.ytm-upload-menu-item');
            if (!target) return;
            const action = target.dataset.action;
            toggleMenu(false);

            if (action === 'local') {
                // ① ローカルファイル（.lrc/.txt）アップロード
                ui.input?.click();
            } else if (action === 'add-sync') {
                // ② LRCHub manual に video_url 付きで飛ぶ
                const videoUrl = getCurrentVideoUrl();
                const base = 'https://lrchub.coreone.work';
                const lrchubUrl = videoUrl
                    ? `${base}/manual?video_url=${encodeURIComponent(videoUrl)}`
                    : base;
                window.open(lrchubUrl, '_blank');
            } else if (action === 'fix') {
                // ③ 歌詞の間違い修正リクエスト → GitHub の編集画面へ
                const vid = getCurrentVideoId();
                if (!vid) {
                    alert('動画IDが取得できませんでした。YouTube Music の再生画面で実行してください。');
                    return;
                }
                const githubUrl = `https://github.com/LRCHub/${vid}/edit/main/README.md`;
                window.open(githubUrl, '_blank');
            }
        });

        // 画面のどこかをクリックしたらメニューを閉じる
        if (!uploadMenuGlobalSetup) {
            uploadMenuGlobalSetup = true;
            document.addEventListener('click', (ev) => {
                if (!ui.uploadMenu) return;
                if (!ui.uploadMenu.classList.contains('visible')) return;
                if (ui.uploadMenu.contains(ev.target) || uploadBtn.contains(ev.target)) return;
                ui.uploadMenu.classList.remove('visible');
            }, true);
        }
    }

    // ★ 歌詞削除用グラスダイアログ
    function setupDeleteDialog(trashBtn) {
        if (!ui.btnArea || ui.deleteDialog) return;

        ui.btnArea.style.position = 'relative';

        const dialog = createEl('div', 'ytm-delete-dialog', 'ytm-confirm-dialog', `
            <div class="ytm-confirm-title">歌詞を削除</div>
            <div class="ytm-confirm-message">
                この曲の保存済み歌詞を削除しますか？<br>
                <span style="font-size:11px;opacity:0.7;">ローカルキャッシュのみ削除されます。</span>
            </div>
            <div class="ytm-confirm-buttons">
                <button class="ytm-confirm-btn cancel">キャンセル</button>
                <button class="ytm-confirm-btn danger">削除</button>
            </div>
        `);
        ui.btnArea.appendChild(dialog);
        ui.deleteDialog = dialog;

        const toggleDialog = (show) => {
            if (!ui.deleteDialog) return;
            const cl = ui.deleteDialog.classList;
            if (show === undefined) {
                cl.toggle('visible');
            } else if (show) {
                cl.add('visible');
            } else {
                cl.remove('visible');
            }
        };

        trashBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            toggleDialog();
        });

        const cancelBtn = dialog.querySelector('.ytm-confirm-btn.cancel');
        const dangerBtn = dialog.querySelector('.ytm-confirm-btn.danger');

        if (cancelBtn) {
            cancelBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                toggleDialog(false);
            });
        }

        if (dangerBtn) {
            dangerBtn.addEventListener('click', (ev) => {
                ev.stopPropagation();
                if (currentKey) {
                    storage.remove([currentKey, currentKey + "_TR"]);
                    currentKey = null;
                    lyricsData = [];
                    renderLyrics([]);
                }
                toggleDialog(false);
            });
        }

        if (!deleteDialogGlobalSetup) {
            deleteDialogGlobalSetup = true;
            document.addEventListener('click', (ev) => {
                if (!ui.deleteDialog) return;
                if (!ui.deleteDialog.classList.contains('visible')) return;
                if (ui.deleteDialog.contains(ev.target) || trashBtn.contains(ev.target)) return;
                ui.deleteDialog.classList.remove('visible');
            }, true);
        }
    }
    
    function initSettings() {
        if (ui.settings) return;
        ui.settings = createEl('div', 'ytm-settings-panel', '', `
            <button id="ytm-settings-close-btn" 
                style="
                    position:absolute;
                    right:12px;
                    top:10px;
                    width:24px;
                    height:24px;
                    border-radius:999px;
                    border:none;
                    background:rgba(255,255,255,0.08);
                    color:#fff;
                    font-size:16px;
                    line-height:1;
                    cursor:pointer;
                ">×</button>
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

        const closeBtn = document.getElementById('ytm-settings-close-btn');
        if (closeBtn) {
            closeBtn.onclick = (ev) => {
                ev.stopPropagation();
                ui.settings.classList.remove('active');
            };
        }
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
        const btns = [];

        // Uploadボタン
        const uploadBtnConfig = {
            txt: 'Upload',
            click: () => {} // 実際の処理は setupUploadMenu 内で設定
        };

        const trashBtnConfig = {
            txt: '🗑️',
            cls: 'icon-btn',
            click: () => {} // 実処理はグラスダイアログで
        };

        const settingsBtnConfig = {
            txt: '⚙️',
            cls: 'icon-btn',
            click: () => { initSettings(); ui.settings.classList.toggle('active'); }
        };

        btns.push(uploadBtnConfig, trashBtnConfig, settingsBtnConfig);
        
        btns.forEach(b => {
            const btn = createEl('button', '', `ytm-glass-btn ${b.cls || ''}`, b.txt);
            btn.onclick = b.click;
            ui.btnArea.appendChild(btn);

            if (b === uploadBtnConfig) {
                // Uploadボタンにグラスメニューを紐づけ
                setupUploadMenu(btn);
            }
            if (b === trashBtnConfig) {
                // 削除ボタンにグラスダイアログを紐づけ
                setupDeleteDialog(btn);
            }
        });

        ui.input = createEl('input');
        ui.input.type = 'file';
        ui.input.accept = '.lrc,.txt';
        ui.input.style.display = 'none';
        ui.input.onchange = handleUpload;
        document.body.appendChild(ui.input);

        info.append(ui.title, ui.artist, ui.btnArea);
        leftCol.append(ui.artwork, info);
        
        ui.lyrics = createEl('div', 'my-lyrics-container');
        ui.wrapper.append(leftCol, ui.lyrics);
        document.body.appendChild(ui.wrapper);

        setupAutoHideEvents();
    }

    const tick = async () => {
        if (!document.getElementById('my-mode-toggle')) {
            const rc = document.querySelector('.right-controls-buttons');
            if (rc) {
                const btn = createEl('button', 'my-mode-toggle', '', 'IMMERSION');
                btn.onclick = () => {
                    config.mode = !config.mode;
                    document.body.classList.toggle('ytm-custom-layout', config.mode);
                };
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
        if (currentKey !== key) {
            currentKey = key;
            updateMetaUI(meta);
            loadLyrics(meta);
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
    }

    async function loadLyrics(meta) {
        // DeepL設定読み込み
        if (!config.deepLKey) config.deepLKey = await storage.get('ytm_deepl_key');
        const cachedTrans = await storage.get('ytm_trans_enabled');
        if (cachedTrans !== undefined) config.useTrans = cachedTrans;

        // まずはストレージから読み込み
        let data = await storage.get(currentKey + "_TR") || await storage.get(currentKey);
        
        // まだキャッシュがないときだけ API へ
        if (!data) {
            try {
                const track = meta.title.replace(/\s*[\(-\[].*?[\)-]].*/, "");
                const artist = meta.artist;
                const youtube_url = getCurrentVideoUrl(); // ★現在のURLを付与

                const res = await new Promise(resolve => {
                    chrome.runtime.sendMessage(
                        {
                            type: 'GET_LYRICS',
                            payload: { track, artist, youtube_url }
                        },
                        resolve
                    );
                });

                console.log('[CS] GET_LYRICS response:', res);

                if (res?.success) {
                    data = res.lyrics || '';
                } else {
                    console.warn('Lyrics API failed:', res?.error);
                }
            } catch (e) {
                console.warn('Lyrics API fetch failed', e);
            }
        }

        if (!data) {
            renderLyrics([]);
            return;
        }

        if (typeof data === 'string') { 
            let parsed = parseLRC(data);
            console.log('[CS] parsed lines:', parsed.length, 'hasTimestamp:', hasTimestamp);
            renderLyrics(parsed); 
            
            if (config.useTrans && config.deepLKey) {
                parsed = await translate(parsed);
                storage.set(currentKey + "_TR", parsed); 
            } else {
                storage.set(currentKey, data); 
            }
            lyricsData = parsed;
            renderLyrics(parsed);
        } else {
            lyricsData = data;
            renderLyrics(data);
        }
    }

    function renderLyrics(data) {
        if (!ui.lyrics) return;
        ui.lyrics.innerHTML = '';

        const hasData = Array.isArray(data) && data.length > 0;
        document.body.classList.toggle('ytm-no-lyrics', !hasData);
        
        // 歌詞が1行も無いとき → LRCHubへの案内を表示
        if (!hasData) {
            const meta = getMetadata();
            const title = meta?.title || '';
            const artist = meta?.artist || '';
            const infoText = title && artist
                ? `「${title} / ${artist}」の歌詞はまだ見つかりませんでした。`
                : 'この曲の歌詞はまだ見つかりませんでした。';

            const videoUrl = getCurrentVideoUrl();
            const base = 'https://lrchub.coreone.work';
            const lrchubManualUrl = videoUrl
                ? `${base}/manual?video_url=${encodeURIComponent(videoUrl)}`
                : base;

            ui.lyrics.innerHTML = `
                <div class="no-lyrics-message" style="padding:20px; opacity:0.8;">
                    <p>${infoText}</p>
                    <p style="margin-top:8px;">
                        <a href="${lrchubManualUrl}"
                           target="_blank"
                           rel="noopener noreferrer">
                           LRCHubで歌詞を追加する
                        </a>
                    </p>
                </div>
            `;
            return;
        }

        // 歌詞があるとき
        data.forEach(line => {
            const row = createEl('div', '', 'lyric-line', `<span>${line.text}</span>`);
            if (line.translation) {
                row.appendChild(createEl('span', '', 'lyric-translation', line.translation));
            }
            row.onclick = () => {
                // タイムスタンプが無い & time:null の場合はシークしない（ただのテキスト）
                if (!hasTimestamp || line.time == null) return;
                const v = document.querySelector('video');
                if (v) v.currentTime = line.time;
            };
            ui.lyrics.appendChild(row);
        });
    }

    const handleUpload = (e) => {
        const file = e.target.files[0];
        if (!file || !currentKey) return;
        const r = new FileReader();
        r.onload = (ev) => {
            storage.set(currentKey, ev.target.result);
            currentKey = null; // reload
        };
        r.readAsText(file);
        e.target.value = '';
    };

    // Sync Logic
    document.addEventListener('timeupdate', (e) => {
        if (!document.body.classList.contains('ytm-custom-layout') || !lyricsData.length) return;
        if (e.target.tagName !== 'VIDEO') return; 
        
        // タイムスタンプが無い場合は自動スクロール・ハイライト無効
        if (!hasTimestamp) return;

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
