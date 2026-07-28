// スプレッドシートID
const SPREADSHEET_ID = '1m0y8AOJNx1Ad4I44poPheQAQNki1-QQIwi9wSw8jaBg';
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzI8q03lIuD3NnEshN8g-q44q6lV9XkR9239q9-sX0xX/exec'; // 送信先GASのURL

let primaryKigoDatabase = [];   // 第1優先：俳句集成の季語
let secondaryKigoDatabase = []; // 第2優先：歳時記データベースの季語
let authorDatabase = [];        // 作者データベース（あいうえお順）

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

    // キャッシュからの即時復元
    restoreCachedMasterData();

    // 1段階目：一番左「俳句集成」のマスターデータを取得
    fetchPrimaryMasterData();

    // 2段階目：3番目「歳時記データベース」のマスターデータをバックグラウンド取得
    fetchSecondaryMasterData();

    // オフライン未送信キューの自動送信チェック
    window.addEventListener('online', processOfflineQueue);
    processOfflineQueue();
};

function restoreCachedMasterData() {
    try {
        const cachedPriKigo = localStorage.getItem('hugetsu_pri_kigo_db');
        const cachedSecKigo = localStorage.getItem('hugetsu_sec_kigo_db');
        const cachedAuthor = localStorage.getItem('hugetsu_author_db');
        
        if (cachedPriKigo) primaryKigoDatabase = JSON.parse(cachedPriKigo);
        if (cachedSecKigo) secondaryKigoDatabase = JSON.parse(cachedSecKigo);
        if (cachedAuthor) {
            authorDatabase = JSON.parse(cachedAuthor);
            updateAuthorDatalist();
        }
    } catch (e) {
        console.error('マスターキャッシュ復元エラー', e);
    }
}

/* 1段階目：一番左「俳句集成」の取得 */
function fetchPrimaryMasterData() {
    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?range=A:I&tqx=responseHandler:primaryDataReceived`;
    document.body.appendChild(script);
}

window.primaryDataReceived = function(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        const rows = data.table.rows;
        let kigoList = [];
        let authorMap = {};

        for (let i = 0; i < rows.length; i++) {
            const c = rows[i].c;
            if (!c) continue;

            const getVal = (idx) => (c[idx] && c[idx].v !== null) ? String(c[idx].v).trim() : '';
            
            const author = getVal(1);      // B列: 作者名
            const authorKana = getVal(2);  // C列: 作者よみがな
            const kigo = getVal(3);        // D列: 季語
            const parentKigo = getVal(4);  // E列: 親季語
            const detailSeason = getVal(6);// G列: 詳細季節
            const season = getVal(7).toLowerCase(); // H列: 季節

            if (kigo && kigo !== '季語' && kigo !== '句') {
                kigoList.push({
                    kigo: kigo,
                    parentKigo: parentKigo || kigo,
                    season: season || 'haru',
                    detailSeason: detailSeason
                });
            }

            if (author && author !== '作者名' && author !== '作者不詳') {
                if (!authorMap[author]) {
                    authorMap[author] = authorKana || author;
                }
            }
        }

        // 重複排除
        let uniqueMap = {};
        kigoList.forEach(item => { if (!uniqueMap[item.kigo]) uniqueMap[item.kigo] = item; });
        primaryKigoDatabase = Object.values(uniqueMap);

        authorDatabase = Object.keys(authorMap).map(name => ({
            name: name,
            kana: authorMap[name]
        }));
        authorDatabase.sort((a, b) => a.kana.localeCompare(b.kana, 'ja'));

        localStorage.setItem('hugetsu_pri_kigo_db', JSON.stringify(primaryKigoDatabase));
        localStorage.setItem('hugetsu_author_db', JSON.stringify(authorDatabase));

        updateAuthorDatalist();
    } catch (e) {
        console.error('第1マスターデータ解析エラー', e);
    }
};

/* 2段階目：3番目「歳時記データベース」の取得 */
function fetchSecondaryMasterData() {
    const sheetName = encodeURIComponent('歳時記データベース');
    const script = document.createElement('script');
    script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?sheet=${sheetName}&range=A:F&tqx=responseHandler:secondaryDataReceived`;
    document.body.appendChild(script);
}

window.secondaryDataReceived = function(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        const rows = data.table.rows;
        let kigoList = [];

        for (let i = 0; i < rows.length; i++) {
            const c = rows[i].c;
            if (!c) continue;

            const getVal = (idx) => (c[idx] && c[idx].v !== null) ? String(c[idx].v).trim() : '';
            
            const season = getVal(1).toLowerCase(); // B列: 季節
            const detailSeason = getVal(2);         // C列: 詳細季節
            const parentKigo = getVal(3);           // D列: 親季語
            const childKigo = getVal(5);            // F列: 子季語

            if (childKigo && childKigo !== '子季語') {
                kigoList.push({
                    kigo: childKigo,
                    parentKigo: parentKigo || childKigo,
                    season: season || 'haru',
                    detailSeason: detailSeason
                });
            }
            if (parentKigo && parentKigo !== '親季語' && parentKigo !== childKigo) {
                kigoList.push({
                    kigo: parentKigo,
                    parentKigo: parentKigo,
                    season: season || 'haru',
                    detailSeason: detailSeason
                });
            }
        }

        let uniqueMap = {};
        kigoList.forEach(item => { if (!uniqueMap[item.kigo]) uniqueMap[item.kigo] = item; });
        secondaryKigoDatabase = Object.values(uniqueMap);

        localStorage.setItem('hugetsu_sec_kigo_db', JSON.stringify(secondaryKigoDatabase));
    } catch (e) {
        console.error('第2マスターデータ解析エラー', e);
    }
};

/* あいうえお順のドロップダウンリスト生成 */
function updateAuthorDatalist() {
    const authorListEl = document.getElementById('authorList');
    if (!authorListEl) return;

    authorListEl.innerHTML = '';
    authorDatabase.forEach(item => {
        const opt = document.createElement('option');
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

    // 2段階自動季語検出を実行
    detectKigo(phraseInput);
    goToStep(2);
}

/* 🔍 2段階検索ロジック（①俳句集成 → ②歳時記DB） */
function detectKigo(phrase) {
    let detected = null;

    // 第1優先：既存の俳句集成から検索（長い単語を優先）
    let sortedPrimary = [...primaryKigoDatabase].sort((a, b) => b.kigo.length - a.kigo.length);
    for (let item of sortedPrimary) {
        if (phrase.includes(item.kigo)) {
            detected = item;
            break;
        }
    }

    // 第2優先：ヒットしなかった場合、9,000語の歳時記データベースを検索
    if (!detected) {
        let sortedSecondary = [...secondaryKigoDatabase].sort((a, b) => b.kigo.length - a.kigo.length);
        for (let item of sortedSecondary) {
            if (phrase.includes(item.kigo)) {
                detected = item;
                break;
            }
        }
    }

    const promptEl = document.getElementById('detectedKigoText');
    if (detected) {
        let displayPrompt = detected.kigo;
        if (detected.kigo !== detected.parentKigo) {
            displayPrompt += ` （親季語：${detected.parentKigo}）`;
        }

        promptEl.innerText = `${displayPrompt} [${getSeasonNameJa(detected.season)}]`;
        
        // 画面の入力欄には「親季語」をセット
        document.getElementById('kigoInput').value = detected.parentKigo;
        document.getElementById('seasonSelect').value = detected.season || 'haru';
        document.getElementById('detailSeasonInput').value = detected.detailSeason || '';

        currentHaikuData.kigo = detected.kigo;
        currentHaikuData.parentKigo = detected.parentKigo;
    } else {
        promptEl.innerText = '見つかりませんでした（手動でご入力ください）';
        document.getElementById('kigoInput').value = '';
        document.getElementById('seasonSelect').value = 'haru';
        document.getElementById('detailSeasonInput').value = '';
        currentHaikuData.kigo = '';
        currentHaikuData.parentKigo = '';
    }
}

function checkAndHokanKigoData() {
    const val = document.getElementById('kigoInput').value.trim();
    if (!val) return;

    // 2段階で補完検索
    let hit = primaryKigoDatabase.find(item => item.kigo === val || item.parentKigo === val);
    if (!hit) {
        hit = secondaryKigoDatabase.find(item => item.kigo === val || item.parentKigo === val);
    }

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
    const inputKigoVal = document.getElementById('kigoInput').value.trim();
    
    // 入力・調整された親季語から構造を再確認
    let hit = primaryKigoDatabase.find(item => item.kigo === inputKigoVal || item.parentKigo === inputKigoVal);
    if (!hit) {
        hit = secondaryKigoDatabase.find(item => item.kigo === inputKigoVal || item.parentKigo === inputKigoVal);
    }

    currentHaikuData.parentKigo = inputKigoVal;
    currentHaikuData.kigo = (hit && hit.kigo !== hit.parentKigo) ? hit.kigo : inputKigoVal;
    currentHaikuData.season = document.getElementById('seasonSelect').value;
    currentHaikuData.detailSeason = document.getElementById('detailSeasonInput').value.trim();
    currentHaikuData.author = document.getElementById('authorInput').value.trim() || '西田亮太';
    currentHaikuData.authorKana = document.getElementById('authorKanaInput').value.trim();

    // プレビュー画面の反映
    document.getElementById('previewPhrase').innerText = currentHaikuData.phrase;
    document.getElementById('previewAuthor').innerText = currentHaikuData.author;

    // パンくず生成
    let seasonJa = getSeasonNameJa(currentHaikuData.season);
    let kigoStr = currentHaikuData.parentKigo || '無季';
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

    // 一番左「俳句集成」の列構成に合わせてデータを送信
    const payload = {
        phrase: currentHaikuData.phrase,                            // A列: 俳句
        author: currentHaikuData.author,                            // B列: 作者名
        authorKana: currentHaikuData.authorKana,                    // C列: 作者よみがな
        kigo: currentHaikuData.kigo || currentHaikuData.parentKigo, // D列: 季語（子季語/表記）
        parentKigo: currentHaikuData.parentKigo,                  // E列: 親季語
        detailSeason: currentHaikuData.detailSeason,                // G列: 詳細季節（初夏、三秋など）
        season: currentHaikuData.season,                            // H列: 季節（haru, akiなど）
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
    document.getElementById('detailSeasonInput').value = '';
    document.getElementById('authorInput').value = '';
    document.getElementById('authorKanaInput').value = '';
    
    goToStep(1);
}

function getSeasonNameJa(code) {
    const map = {'haru':'春', 'natsu':'夏', 'aki':'秋', 'huyu':'冬', 'shinnen':'新年', 'muki':'無季'};
    return map[code] || code;
}
