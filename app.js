// スプレッドシートID
const SPREADSHEET_ID = '1m0y8AOJNx1Ad4I44poPheQAQNki1-QQIwi9wSw8jaBg';
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzI8q03lIuD3NnEshN8g-q44q6lV9XkR9239q9-sX0xX/exec'; // 送信先GASのURL

let kigoDatabase = [];
let authorDatabase = []; // { name: '松尾芭蕉', kana: 'まつおばしょう' }

let currentHaikuData = {
    phrase: '',
    kigo: '',
    season: 'haru',
    detailSeason: '',
    author: '',
    authorKana: ''
};

window.onload = function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }

    // キャッシュからの初期読み込み
    restoreCachedMasterData();

    // 最新マスターデータの取得
    fetchMasterData();

    // オフライン未送信キューの自動送信チェック
    window.addEventListener('online', processOfflineQueue);
    processOfflineQueue();
};

function restoreCachedMasterData() {
    try {
        const cachedKigo = localStorage.getItem('hugetsu_kigo_db');
        const cachedAuthor = localStorage.getItem('hugetsu_author_db');
        if (cachedKigo) kigoDatabase = JSON.parse(cachedKigo);
        if (cachedAuthor) {
            authorDatabase = JSON.parse(cachedAuthor);
            updateAuthorDatalist();
        }
    } catch (e) {
        console.error('マスターキャッシュ復元エラー', e);
    }
}

function fetchMasterData() {
    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?range=A:H&tqx=responseHandler:masterDataReceived`;
    document.body.appendChild(script);
}

window.masterDataReceived = function(data) {
    try {
        const rows = data.table.rows;
        let kigoMap = {};
        let authorMap = {};

        for (let i = 0; i < rows.length; i++) {
            const c = rows[i].c;
            if (!c) continue;

            const getVal = (idx) => (c[idx] && c[idx].v !== null) ? String(c[idx].v).trim() : '';
            
            const author = getVal(1);
            const authorKana = getVal(2);
            const kigo = getVal(3);
            const parentKigo = getVal(4);
            const kigoKana = getVal(5);
            const season = getVal(6).toLowerCase();
            const detailSeason = getVal(7);

            // 季語DB構築
            if (kigo && kigo !== '季語') {
                kigoMap[kigo] = {
                    kigo: kigo,
                    parentKigo: parentKigo || kigo,
                    kigoKana: kigoKana,
                    season: season,
                    detailSeason: detailSeason
                };
            }

            // 作者DB構築（漢字名キーでユニーク化）
            if (author && author !== '作者名' && author !== '作者不詳') {
                if (!authorMap[author]) {
                    authorMap[author] = authorKana || author;
                }
            }
        }

        kigoDatabase = Object.values(kigoMap);
        
        authorDatabase = Object.keys(authorMap).map(name => ({
            name: name,
            kana: authorMap[name]
        }));

        // 五十音順（あいうえお順）にソート
        authorDatabase.sort((a, b) => a.kana.localeCompare(b.kana, 'ja'));

        // ローカルキャッシュ保存
        localStorage.setItem('hugetsu_kigo_db', JSON.stringify(kigoDatabase));
        localStorage.setItem('hugetsu_author_db', JSON.stringify(authorDatabase));

        updateAuthorDatalist();
    } catch (e) {
        console.error('マスターデータ解析エラー', e);
    }
};

/* 💡 重複なし・あいうえお順のドロップダウンリスト生成 */
function updateAuthorDatalist() {
    const authorListEl = document.getElementById('authorList');
    if (!authorListEl) return;

    authorListEl.innerHTML = '';
    
    authorDatabase.forEach(item => {
        const opt = document.createElement('option');
        // 表示を1行に統一（例：松尾芭蕉（まつおばしょう））
        opt.value = item.name;
        opt.label = `${item.name}（${item.kana}）`;
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

    // 自動季語検出
    detectKigo(phraseInput);
    goToStep(2);
}

function detectKigo(phrase) {
    let detected = null;

    // 長い季語から優先マッチ
    let sortedKigo = [...kigoDatabase].sort((a, b) => b.kigo.length - a.kigo.length);

    for (let item of sortedKigo) {
        if (phrase.includes(item.kigo)) {
            detected = item;
            break;
        }
    }

    const promptEl = document.getElementById('detectedKigoText');
    if (detected) {
        promptEl.innerText = `${detected.kigo} (${getSeasonNameJa(detected.season)})`;
        document.getElementById('kigoInput').value = detected.parentKigo || detected.kigo;
        document.getElementById('seasonSelect').value = detected.season || 'haru';
        document.getElementById('detailSeasonInput').value = detected.detailSeason || '';
    } else {
        promptEl.innerText = '見つかりませんでした（手動でご入力ください）';
        document.getElementById('kigoInput').value = '';
        document.getElementById('seasonSelect').value = 'haru';
        document.getElementById('detailSeasonInput').value = '';
    }
}

function checkAndHokanKigoData() {
    const val = document.getElementById('kigoInput').value.trim();
    if (!val) return;

    const hit = kigoDatabase.find(item => item.kigo === val || item.parentKigo === val);
    if (hit) {
        if (hit.season) document.getElementById('seasonSelect').value = hit.season;
        if (hit.detailSeason) document.getElementById('detailSeasonInput').value = hit.detailSeason;
    }
}

function onAuthorNameChange() {
    const nameVal = document.getElementById('authorInput').value.trim();
    if (!nameVal) return;

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
    currentHaikuData.kigo = document.getElementById('kigoInput').value.trim();
    currentHaikuData.season = document.getElementById('seasonSelect').value;
    currentHaikuData.detailSeason = document.getElementById('detailSeasonInput').value.trim();
    currentHaikuData.author = document.getElementById('authorInput').value.trim() || '西田亮太';
    currentHaikuData.authorKana = document.getElementById('authorKanaInput').value.trim();

    // プレビュー画面の反映
    document.getElementById('previewPhrase').innerText = currentHaikuData.phrase;
    document.getElementById('previewAuthor').innerText = currentHaikuData.author;

    // パンくず生成（季寄せと同等スタイル）
    let seasonJa = getSeasonNameJa(currentHaikuData.season);
    let kigoStr = currentHaikuData.kigo || '無季';
    let detailSuffix = currentHaikuData.detailSeason ? `（${currentHaikuData.detailSeason}）` : '';
    
    document.getElementById('previewBreadcrumb').innerHTML = 
        `<span>季寄せ</span> <span class="separator">&lt;</span> <span>${seasonJa}</span> <span class="separator">&lt;</span> <span>${kigoStr}${detailSuffix}</span>`;

    goToStep(3);
}

/* スプレッドシート送信＆オフライン対応 */
function submitHaiku() {
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    submitBtn.innerText = '送信中...';

    const payload = {
        phrase: currentHaikuData.phrase,
        author: currentHaikuData.author,
        authorKana: currentHaikuData.authorKana,
        kigo: currentHaikuData.kigo,
        season: currentHaikuData.season,
        detailSeason: currentHaikuData.detailSeason,
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
                // 送信失敗時はローカルキューへ退避
                saveToOfflineQueue(payload);
                submitBtn.disabled = false;
                submitBtn.innerText = '登録する';
                alert('通信エラーのため、一時保存しました。次回オンライン時に自動送信されます。');
                goToStep(4);
            });
    } else {
        // オフライン時
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
    document.getElementById('detailSeasonInput').value = '';
    document.getElementById('authorInput').value = '';
    document.getElementById('authorKanaInput').value = '';
    
    goToStep(1);
}

function getSeasonNameJa(code) {
    const map = {'haru':'春', 'natsu':'夏', 'aki':'秋', 'huyu':'冬', 'shinnen':'新年', 'muki':'無季'};
    return map[code] || code;
}
