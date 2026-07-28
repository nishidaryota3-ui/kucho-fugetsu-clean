// スプレッドシートID
const SPREADSHEET_ID = '1m0y8AOJNx1Ad4I44poPheQAQNki1-QQIwi9wSw8jaBg';
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzI8q03lIuD3NnEshN8g-q44q6lV9XkR9239q9-sX0xX/exec';

let saijikiDatabase = []; // 3枚目：歳時記データベース（季語照会用）
let authorDatabase = [];  // 1枚目：俳句集成（作者サジェスト用）

let currentHaikuData = {
    phrase: '',
    kigo: '',         // 子季語・表記季語（D列用）
    parentKigo: '',   // 親季語（E列用）
    season: 'haru',   // 季節コード（H列用）
    detailSeason: '', // 詳細季節（G列用）
    author: '',
    authorKana: ''
};

window.onload = function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    restoreCachedMasterData();
    
    // 作者候補用に1枚目「俳句集成」を取得
    fetchAuthorMasterData();

    // 季語自動検出用に3枚目「歳時記データベース」を取得
    fetchSaijikiMasterData();

    window.addEventListener('online', processOfflineQueue);
    processOfflineQueue();
};

function restoreCachedMasterData() {
    try {
        const cachedSaijiki = localStorage.getItem('hugetsu_saijiki_db');
        const cachedAuthor = localStorage.getItem('hugetsu_author_db');
        
        if (cachedSaijiki) saijikiDatabase = JSON.parse(cachedSaijiki);
        if (cachedAuthor) {
            authorDatabase = JSON.parse(cachedAuthor);
            updateAuthorDatalist();
        }
    } catch (e) {
        console.error('マスターキャッシュ復元エラー', e);
    }
}

/* 1枚目「俳句集成」から作者データのみ取得 */
function fetchAuthorMasterData() {
    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?range=A:C&tqx=responseHandler:authorDataReceived`;
    document.body.appendChild(script);
}

window.authorDataReceived = function(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        const rows = data.table.rows;
        let authorMap = {};

        for (let i = 0; i < rows.length; i++) {
            const c = rows[i].c;
            if (!c) continue;

            const getVal = (idx) => (c[idx] && c[idx].v !== null) ? String(c[idx].v).trim() : '';
            const author = getVal(1);      // B列: 作者名
            const authorKana = getVal(2);  // C列: 作者よみがな

            if (author && author !== '作者名' && author !== '作者不詳') {
                if (!authorMap[author]) {
                    authorMap[author] = authorKana || author;
                }
            }
        }

        authorDatabase = Object.keys(authorMap).map(name => ({
            name: name,
            kana: authorMap[name]
        }));
        authorDatabase.sort((a, b) => a.kana.localeCompare(b.kana, 'ja'));

        localStorage.setItem('hugetsu_author_db', JSON.stringify(authorDatabase));
        updateAuthorDatalist();
    } catch (e) {
        console.error('作者マスター解析エラー', e);
    }
};

/* 3枚目「歳時記データベース」から季語情報を取得 */
function fetchSaijikiMasterData() {
    const sheetName = encodeURIComponent('歳時記データベース');
    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${sheetName}&range=A:F&tqx=responseHandler:saijikiDataReceived`;
    document.body.appendChild(script);
}

window.saijikiDataReceived = function(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        const rows = data.table.rows;
        let kigoList = [];

        for (let i = 0; i < rows.length; i++) {
            const c = rows[i].c;
            if (!c) continue;

            const getVal = (idx) => (c[idx] && c[idx].v !== null) ? String(c[idx].v).trim() : '';
            
            const rawSeason = getVal(0);            // A列: 季節 (例: huyu)
            const detailSeason = getVal(1);         // B列: 詳細季節 (例: 初冬)
            const parentKigo = getVal(2);           // C列: 親季語 (例: 酉の市)
            const parentKana = getVal(3);           // D列: 親季語よみがな
            const childKigo = getVal(4);            // E列: 子季語 (例: 熊手市)

            const seasonCode = parseSeasonCode(rawSeason);

            // 子季語（E列）エントリー
            if (childKigo && childKigo !== '子季語') {
                kigoList.push({
                    kigo: childKigo,
                    parentKigo: parentKigo || childKigo,
                    season: seasonCode,
                    detailSeason: detailSeason
                });
            }

            // 親季語（C列）エントリー
            if (parentKigo && parentKigo !== '親季語') {
                kigoList.push({
                    kigo: parentKigo,
                    parentKigo: parentKigo,
                    season: seasonCode,
                    detailSeason: detailSeason
                });
            }
        }

        let uniqueMap = {};
        kigoList.forEach(item => {
            if (!uniqueMap[item.kigo]) uniqueMap[item.kigo] = item;
        });
        saijikiDatabase = Object.values(uniqueMap);

        localStorage.setItem('hugetsu_saijiki_db', JSON.stringify(saijikiDatabase));
    } catch (e) {
        console.error('歳時記マスター解析エラー', e);
    }
};

/* 季節表記のコード化変換 */
function parseSeasonCode(str) {
    if (!str) return 'haru';
    const s = str.toLowerCase().trim();
    if (s.includes('haru') || s === '春') return 'haru';
    if (s.includes('natsu') || s === '夏') return 'natsu';
    if (s.includes('aki') || s === '秋') return 'aki';
    if (s.includes('fuyu') || s.includes('huyu') || s === '冬') return 'huyu';
    if (s.includes('shinnen') || s.includes('sinnen') || s === '新年') return 'shinnen';
    if (s.includes('muki') || s === '無季') return 'muki';
    return 'haru';
}

/* 💡 作者ドロップダウン（datalist）の安全な生成（エラー回避処理追加） */
function updateAuthorDatalist() {
    const authorListEl = document.getElementById('authorList');
    if (!authorListEl) return;

    authorListEl.innerHTML = '';
    authorDatabase.forEach(item => {
        if (!item || !item.name) return;
        const opt = document.createElement('option');
        opt.value = item.kana ? `${item.name}（${item.kana}）` : item.name;
        authorListEl.appendChild(opt);
    });
}

/* 画面遷移制御 */
function goToStep(stepNumber) {
    document.querySelectorAll('.step-screen').forEach(el => el.classList.remove('active'));
    const target = document.getElementById(`step${stepNumber}`);
    if (target) target.classList.add('active');
}

function goToStep2() {
    const phraseInput = document.getElementById('inputPhrase').value.trim();
    if (!phraseInput) {
        alert('句を入力してください。');
        return;
    }

    currentHaikuData.phrase = phraseInput;

    detectKigo(phraseInput);
    goToStep(2);
}

/* 🔍 歳時記DB（3枚目シート）からの最長一致照会 */
function detectKigo(phrase) {
    let detected = null;
    const cleanPhrase = phrase.replace(/\s+/g, '');

    if (saijikiDatabase && saijikiDatabase.length > 0) {
        // 文字数の長い単語から順にソート（例：「熊手市」＞「熊手」）
        let sortedDatabase = [...saijikiDatabase].sort((a, b) => b.kigo.length - a.kigo.length);

        for (let item of sortedDatabase) {
            if (cleanPhrase.includes(item.kigo)) {
                detected = item;
                break; // 最も長い単語で即決定
            }
        }
    }

    const promptEl = document.getElementById('detectedKigoText');
    if (detected) {
        promptEl.innerText = `${detected.kigo}`;
        
        document.getElementById('kigoInput').value = detected.parentKigo;
        document.getElementById('seasonSelect').value = detected.season || 'huyu';
        
        const detailSelect = document.getElementById('detailSeasonSelect');
        if (detailSelect) detailSelect.value = detected.detailSeason || '';

        currentHaikuData.kigo = detected.kigo;
        currentHaikuData.parentKigo = detected.parentKigo;
    } else {
        if (promptEl) promptEl.innerText = '見つかりませんでした（手動でご入力ください）';
        document.getElementById('kigoInput').value = '';
        document.getElementById('seasonSelect').value = 'haru';
        
        const detailSelect = document.getElementById('detailSeasonSelect');
        if (detailSelect) detailSelect.value = '';
        
        currentHaikuData.kigo = '';
        currentHaikuData.parentKigo = '';
    }
}

function checkAndHokanKigoData() {
    const val = document.getElementById('kigoInput').value.trim();
    if (!val) return;

    let hit = saijikiDatabase.find(item => item.kigo === val || item.parentKigo === val);
    if (hit) {
        if (hit.season) document.getElementById('seasonSelect').value = hit.season;
        const detailSelect = document.getElementById('detailSeasonSelect');
        if (detailSelect && hit.detailSeason) detailSelect.value = hit.detailSeason;
    }
}

function onAuthorNameChange() {
    let nameVal = document.getElementById('authorInput').value.trim();
    if (!nameVal) return;

    if (nameVal.includes('（')) {
        const parts = nameVal.split('（');
        nameVal = parts[0];
        const kanaPart = parts[1].replace('）', '');
        document.getElementById('authorInput').value = nameVal;
        document.getElementById('authorKanaInput').value = kanaPart;
        return;
    }

    const hit = authorDatabase.find(item => item.name === nameVal);
    if (hit) {
        document.getElementById('authorKanaInput').value = hit.kana;
    }
}

function onAuthorInputChanged() {
    onAuthorNameChange();
}

function onAuthorKanaInputChanged() {
    const kanaVal = document.getElementById('authorKanaInput').value.trim();
    if (!kanaVal) return;

    const hit = authorDatabase.find(item => item.kana === kanaVal);
    if (hit) {
        document.getElementById('authorInput').value = hit.name;
    }
}

function goToStep3() {
    const inputKigoVal = document.getElementById('kigoInput').value.trim();
    
    let hit = saijikiDatabase.find(item => item.kigo === inputKigoVal || item.parentKigo === inputKigoVal);

    currentHaikuData.parentKigo = inputKigoVal;
    currentHaikuData.kigo = (hit && hit.kigo !== hit.parentKigo) ? hit.kigo : inputKigoVal;
    currentHaikuData.season = document.getElementById('seasonSelect').value;
    
    const detailSelect = document.getElementById('detailSeasonSelect');
    currentHaikuData.detailSeason = detailSelect ? detailSelect.value : '';
    
    currentHaikuData.author = document.getElementById('authorInput').value.trim() || '西田亮太';
    currentHaikuData.authorKana = document.getElementById('authorKanaInput').value.trim();

    document.getElementById('previewPhrase').innerText = currentHaikuData.phrase;
    document.getElementById('previewAuthor').innerText = currentHaikuData.author;

    let seasonJa = getSeasonNameJa(currentHaikuData.season);
    let kigoStr = currentHaikuData.parentKigo || '無季';
    let detailSuffix = currentHaikuData.detailSeason ? `（${currentHaikuData.detailSeason}）` : '';
    
    document.getElementById('previewBreadcrumb').innerHTML = 
        `<span>季寄せ</span> <span class="separator">&lt;</span> <span>${seasonJa}</span> <span class="separator">&lt;</span> <span>${kigoStr}${detailSuffix}</span>`;

    goToStep(3);
}

function submitHaiku() {
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerText = '送信中...';

    const payload = {
        phrase: currentHaikuData.phrase,
        author: currentHaikuData.author,
        authorKana: currentHaikuData.authorKana,
        kigo: currentHaikuData.kigo || currentHaikuData.parentKigo,
        parentKigo: currentHaikuData.parentKigo,
        detailSeason: currentHaikuData.detailSeason,
        season: currentHaikuData.season,
        timestamp: new Date().toISOString()
    };

    if (navigator.onLine) {
        sendToGas(payload)
            .then(() => {
                submitBtn.disabled = false;
                submitBtn.innerText = '登録する';
                goToStep(4);
            })
            .catch(() => {
                saveToOfflineQueue(payload);
                submitBtn.disabled = false;
                submitBtn.innerText = '登録する';
                alert('通信エラーのため、一時保存しました。次回オンライン時に自動送信されます。');
                goToStep(4);
            });
    } else {
        saveToOfflineQueue(payload);
        submitBtn.disabled = false;
        submitBtn.innerText = '登録する';
        goToStep(4);
    }
}

function sendToGas(data) {
    return fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
}

function saveToOfflineQueue(data) {
    let queue = [];
    try {
        const stored = localStorage.getItem('hugetsu_offline_queue');
        if (stored) queue = JSON.parse(stored);
    } catch (e) {}

    queue.push(data);
    localStorage.setItem('hugetsu_offline_queue', JSON.stringify(queue));
}

function processOfflineQueue() {
    if (!navigator.onLine) return;

    try {
        const stored = localStorage.getItem('hugetsu_offline_queue');
        if (!stored) return;

        let queue = JSON.parse(stored);
        if (queue.length === 0) return;

        let promises = queue.map(item => sendToGas(item));
        Promise.all(promises).then(() => {
            localStorage.removeItem('hugetsu_offline_queue');
        }).catch(e => console.error('オフラインキュー送信エラー', e));
    } catch (e) {
        console.error('キュー処理エラー', e);
    }
}

function resetForm() {
    document.getElementById('inputPhrase').value = '';
    document.getElementById('kigoInput').value = '';
    
    const detailSelect = document.getElementById('detailSeasonSelect');
    if (detailSelect) detailSelect.value = '';
    
    document.getElementById('authorInput').value = '';
    document.getElementById('authorKanaInput').value = '';
    
    goToStep(1);
}

function getSeasonNameJa(code) {
    const map = {'haru':'春', 'natsu':'夏', 'aki':'秋', 'huyu':'冬', 'shinnen':'新年', 'muki':'無季'};
    return map[code] || code;
}
