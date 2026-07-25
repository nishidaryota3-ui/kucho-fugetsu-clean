var GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwgm4eh8qZGRxvFS8_b8iEJAC9vRGw31gOvjgsPQMPc1ymU4oKonErvUkL0Ucf6xnZO/exec';
var SPREADSHEET_ID = '1m0y8AOJNx1Ad4I44poPheQAQNki1-QQIwi9wSw8jaBg';

var kigoDatabase = [];
var existingPhrases = []; 
var existingAuthors = []; 

var autoDetectedParentKigo = '';
var autoDetectedKigoKana = '';

var currentHaikuData = {
    phrase: '',
    author: '',
    authorKana: '',
    kigo: '',
    parentKigo: '',
    kigoKana: '',
    season: 'natsu',
    detailSeason: '',
    manualKigo: ''
};

var seasonMapToJa = { 'haru':'春', 'natsu':'夏', 'aki':'秋', 'huyu':'冬', 'shinnen':'新年', 'muki':'無季' };

window.onload = function() {
    // オフライン未送信通知バーの生成
    createOfflineStatusBar();
    checkAndSendPendingQueue();

    // 通信復帰（オンライン化）時に自動で未送信キューを送信
    window.addEventListener('online', function() {
        checkAndSendPendingQueue();
    });

    // キャッシュ保存されたマスターデータの復元（オフライン時対応）
    restoreCachedMasterData();

    try {
        var scriptKigo = document.createElement('script');
        var sheetKigoName = encodeURIComponent('歳時記データベース');
        scriptKigo.src = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/gviz/tq?sheet=' + sheetKigoName + '&range=A:H&tqx=responseHandler:kigoDataReceived';
        document.body.appendChild(scriptKigo);

        var scriptPhrases = document.createElement('script');
        var sheet1Name = encodeURIComponent('シート1');
        scriptPhrases.src = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/gviz/tq?sheet=' + sheet1Name + '&range=A:C&tqx=responseHandler:phrasesDataReceived';
        document.body.appendChild(scriptPhrases);
    } catch (e) { console.error(e); }
};

// 歳時記データの受信＆ローカル保存
function kigoDataReceived(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        var rows = data.table.rows;
        var tempKigoDb = [];

        for (var i = 0; i < rows.length; i++) {
            var c = rows[i].c;
            if (!c) continue;

            var seasonVal    = c[0] && c[0].v ? String(c[0].v).trim() : 'muki';
            var detailSeason = c[1] && c[1].v ? String(c[1].v).trim() : '';
            var parentKigo   = c[2] && c[2].v ? String(c[2].v).trim() : '';
            var kigoKana     = c[3] && c[3].v ? String(c[3].v).trim() : '';
            var childKigo    = c[4] && c[4].v ? String(c[4].v).trim() : '';

            var normalizedSeason = 'muki';
            var sLower = seasonVal.toLowerCase();
            if (sLower.indexOf('春') !== -1 || sLower.indexOf('haru') !== -1) normalizedSeason = 'haru';
            else if (sLower.indexOf('夏') !== -1 || sLower.indexOf('natsu') !== -1) normalizedSeason = 'natsu';
            else if (sLower.indexOf('秋') !== -1 || sLower.indexOf('aki') !== -1) normalizedSeason = 'aki';
            else if (sLower.indexOf('冬') !== -1 || sLower.indexOf('huyu') !== -1) normalizedSeason = 'huyu';
            else if (sLower.indexOf('新年') !== -1 || sLower.indexOf('shinnen') !== -1) normalizedSeason = 'shinnen';

            if (childKigo || parentKigo) {
                tempKigoDb.push({
                    parentKigo: parentKigo,
                    childKigo: childKigo || parentKigo,
                    kigoKana: kigoKana,
                    detailSeason: detailSeason,
                    season: normalizedSeason
                });
            }
        }
        if (tempKigoDb.length > 0) {
            kigoDatabase = tempKigoDb;
            localStorage.setItem('fugetsu_kigoDatabase', JSON.stringify(kigoDatabase));
        }
    } catch (e) { console.error(e); }
}

// 既存句・作者データの受信＆ローカル保存
function phrasesDataReceived(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        var rows = data.table.rows;
        var authorMap = {};
        var tempPhrases = [];

        for (var i = 0; i < rows.length; i++) {
            var c = rows[i].c;
            if (!c) continue;

            if (c[0] && c[0].v) {
                var phraseStr = String(c[0].v).trim();
                if (phraseStr && phraseStr !== '句') tempPhrases.push(phraseStr);
            }

            var authorName = c[1] && c[1].v ? String(c[1].v).trim() : '';
            var authorKana = c[2] && c[2].v ? String(c[2].v).trim() : '';

            if (authorName && authorName !== '作者名' && authorName !== '作者') {
                if (!authorMap[authorName]) {
                    authorMap[authorName] = authorKana;
                }
            }
        }

        if (tempPhrases.length > 0) {
            existingPhrases = tempPhrases;
            localStorage.setItem('fugetsu_existingPhrases', JSON.stringify(existingPhrases));
        }

        var tempAuthors = [];
        for (var name in authorMap) {
            tempAuthors.push({ name: name, kana: authorMap[name] });
        }
        if (tempAuthors.length > 0) {
            existingAuthors = tempAuthors;
            localStorage.setItem('fugetsu_existingAuthors', JSON.stringify(existingAuthors));
            updateAuthorDatalists();
        }
    } catch (e) { console.error(e); }
}

// ローカルストレージからのマスターデータ読み込み（圏外時対策）
function restoreCachedMasterData() {
    try {
        var cachedKigo = localStorage.getItem('fugetsu_kigoDatabase');
        if (cachedKigo) kigoDatabase = JSON.parse(cachedKigo);

        var cachedPhrases = localStorage.getItem('fugetsu_existingPhrases');
        if (cachedPhrases) existingPhrases = JSON.parse(cachedPhrases);

        var cachedAuthors = localStorage.getItem('fugetsu_existingAuthors');
        if (cachedAuthors) {
            existingAuthors = JSON.parse(cachedAuthors);
            updateAuthorDatalists();
        }
    } catch (e) { console.error(e); }
}

function updateAuthorDatalists() {
    var nameDatalist = document.getElementById('authorList');
    var kanaDatalist = document.getElementById('authorKanaList');
    if (!nameDatalist || !kanaDatalist) return;

    nameDatalist.innerHTML = '';
    kanaDatalist.innerHTML = '';

    for (var i = 0; i < existingAuthors.length; i++) {
        var item = existingAuthors[i];
        var opt = document.createElement('option');
        opt.value = item.name;
        nameDatalist.appendChild(opt);

        if (item.kana) {
            var optCombo = document.createElement('option');
            optCombo.value = item.name + ' (' + item.kana + ')';
            nameDatalist.appendChild(optCombo);

            var optK = document.createElement('option');
            optK.value = item.kana;
            kanaDatalist.appendChild(optK);
        }
    }
}

// カタカナ ➔ ひらがな変換
function toHiragana(str) {
    if (!str) return '';
    return str.replace(/[\u30a1-\u30f6]/g, function(match) {
        return String.fromCharCode(match.charCodeAt(0) - 0x60);
    }).replace(/[\s ]/g, '');
}

// 🔍 文字列類似度（レーベンシュタイン距離）判定
function getSimilarityRatio(str1, str2) {
    try {
        if (!str1 || !str2) return 0;
        var s1 = String(str1).replace(/[\s 、。,.・]/g, '');
        var s2 = String(str2).replace(/[\s 、。,.・]/g, '');
        if (s1 === s2) return 1.0;

        var len1 = s1.length;
        var len2 = s2.length;
        if (len1 === 0 || len2 === 0) return 0;

        var matrix = [];
        for (var i = 0; i <= len1; i++) matrix[i] = [i];
        for (var j = 0; j <= len2; j++) matrix[0][j] = j;

        for (var i = 1; i <= len1; i++) {
            for (var j = 1; j <= len2; j++) {
                var cost = (s1.charAt(i - 1) === s2.charAt(j - 1)) ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }

        var distance = matrix[len1][len2];
        var maxLen = Math.max(len1, len2);
        return (maxLen - distance) / maxLen;
    } catch (e) {
        return 0;
    }
}

function onAuthorInputChanged() {
    var input = document.getElementById('authorInput');
    var val = input.value.trim();
    if (val.indexOf('(') !== -1) {
        var cleanName = val.split('(')[0].trim();
        input.value = cleanName;
        onAuthorNameChange();
    }
}

function onAuthorKanaInputChanged() {
    var kanaInput = document.getElementById('authorKanaInput');
    var hiraVal = toHiragana(kanaInput.value);
    
    if (!hiraVal || existingAuthors.length === 0) return;

    for (var i = 0; i < existingAuthors.length; i++) {
        if (toHiragana(existingAuthors[i].kana) === hiraVal) {
            document.getElementById('authorInput').value = existingAuthors[i].name;
            break;
        }
    }
}

function onAuthorNameChange() {
    var val = document.getElementById('authorInput').value.trim();
    if (!val || existingAuthors.length === 0) return;

    for (var i = 0; i < existingAuthors.length; i++) {
        if (existingAuthors[i].name === val) {
            if (existingAuthors[i].kana) {
                document.getElementById('authorKanaInput').value = existingAuthors[i].kana;
            }
            break;
        }
    }
}

function checkAndHokanKigoData() {
    try {
        var el = document.getElementById('kigoInput');
        if (!el) return;
        var val = el.value.trim();
        if (!val || !kigoDatabase || kigoDatabase.length === 0) return;

        var matched = null;
        for (var i = 0; i < kigoDatabase.length; i++) {
            var item = kigoDatabase[i];
            if (!item) continue;
            if (item.parentKigo === val || item.childKigo === val) {
                matched = item;
                break;
            }
            if (item.childKigo) {
                var subWords = item.childKigo.split(/[,、\s]+/);
                if (subWords.indexOf(val) !== -1) {
                    matched = item;
                    break;
                }
            }
        }

        if (matched) {
            document.getElementById('kigoInput').value = matched.parentKigo || val;
            document.getElementById('seasonSelect').value = matched.season || 'muki';
            document.getElementById('detailSeasonInput').value = matched.detailSeason || '';
        }
    } catch (e) { console.error(e); }
}

function goToStep(stepNum) {
    var screens = document.querySelectorAll('.step-screen');
    for (var i = 0; i < screens.length; i++) {
        screens[i].classList.remove('active');
    }
    var target = document.getElementById('step' + stepNum);
    if (target) {
        target.classList.add('active');
    }
}

function goToStep2() {
    var inputEl = document.getElementById('inputPhrase');
    var phrase = inputEl ? inputEl.value.trim() : '';
    if (!phrase) { 
        alert('句を入力してください。'); 
        return; 
    }

    try {
        if (existingPhrases && existingPhrases.length > 0) {
            var mostSimilarPhrase = '';
            var maxRatio = 0;

            for (var k = 0; k < existingPhrases.length; k++) {
                var ratio = getSimilarityRatio(phrase, existingPhrases[k]);
                if (ratio > maxRatio) {
                    maxRatio = ratio;
                    mostSimilarPhrase = existingPhrases[k];
                }
            }

            if (maxRatio >= 0.8) {
                var matchPercent = Math.round(maxRatio * 100);
                var confirmMsg = '【登録重複の可能性あり】\n\n入力された句は、すでに登録されている以下の句と一致率 ' + matchPercent + '% です。\n\n既存の句：「' + mostSimilarPhrase + '」\n\nこのまま進んでもよろしいですか？';
                if (!confirm(confirmMsg)) {
                    return;
                }
            }
        }
    } catch (e) { console.error(e); }

    currentHaikuData.phrase = phrase;

    try {
        var matched = null;
        var matchedWordLength = 0;

        if (kigoDatabase && kigoDatabase.length > 0) {
            for (var i = 0; i < kigoDatabase.length; i++) {
                var item = kigoDatabase[i];
                if (!item || !item.childKigo) continue;
                var subWords = item.childKigo.split(/[,、\s]+/);
                for (var j = 0; j < subWords.length; j++) {
                    var word = subWords[j];
                    if (word && phrase.indexOf(word) !== -1) {
                        if (word.length > matchedWordLength) {
                            matchedWordLength = word.length;
                            matched = item;
                        }
                    }
                }
            }
        }

        if (matched) {
            autoDetectedParentKigo = matched.parentKigo || '';
            autoDetectedKigoKana = matched.kigoKana || '';
            var displayDetail = matched.detailSeason || '';
            
            document.getElementById('detectedKigoText').innerHTML = '<span>' + autoDetectedParentKigo + '</span>（' + (displayDetail || '登録済') + '）';
            document.getElementById('kigoInput').value = autoDetectedParentKigo;
            document.getElementById('seasonSelect').value = matched.season || 'muki';
            document.getElementById('detailSeasonInput').value = displayDetail;
        } else {
            autoDetectedParentKigo = '';
            autoDetectedKigoKana = '';
            document.getElementById('detectedKigoText').innerHTML = '自動検出できませんでした<br><span style="font-size:0.85rem; font-weight:normal; color:#777;">（直接入力してください）</span>';
            document.getElementById('kigoInput').value = '';
            document.getElementById('seasonSelect').value = 'muki';
            document.getElementById('detailSeasonInput').value = '';
        }
    } catch (e) { console.error(e); }

    goToStep(2);
}

function goToStep3() {
    try {
        checkAndHokanKigoData();

        var inputKigo = document.getElementById('kigoInput').value.trim();
        var authorVal = document.getElementById('authorInput').value.trim() || '西田亮太';
        var kanaVal = toHiragana(document.getElementById('authorKanaInput').value) || 'にしだりょうた';

        if (existingAuthors && existingAuthors.length > 0) {
            var isExactMatch = false;
            var similarAuthor = null;
            var maxAuthorRatio = 0;

            for (var a = 0; a < existingAuthors.length; a++) {
                var item = existingAuthors[a];
                if (item.name === authorVal) {
                    isExactMatch = true;
                    break;
                }
                var ratioName = getSimilarityRatio(authorVal, item.name);
                var ratioKana = getSimilarityRatio(kanaVal, toHiragana(item.kana));
                var maxR = Math.max(ratioName, ratioKana);

                if (maxR > maxAuthorRatio) {
                    maxAuthorRatio = maxR;
                    similarAuthor = item;
                }
            }

            if (!isExactMatch && similarAuthor && maxAuthorRatio >= 0.7) {
                var authorConfirm = '【作者名の確認】\n\n入力された「' + authorVal + '」は、既存の登録作者「' + similarAuthor.name + '（' + similarAuthor.kana + '）」と類似しています。\n\n既存の【 ' + similarAuthor.name + ' 】に変更して進みますか？\n\n・[OK] ➔ 既存の「' + similarAuthor.name + '」に変更する\n・[キャンセル] ➔ 入力通りの「' + authorVal + '」で進む';
                
                if (confirm(authorConfirm)) {
                    authorVal = similarAuthor.name;
                    kanaVal = toHiragana(similarAuthor.kana) || kanaVal;
                    document.getElementById('authorInput').value = authorVal;
                    document.getElementById('authorKanaInput').value = kanaVal;
                }
            }
        }

        currentHaikuData.author = authorVal;
        currentHaikuData.authorKana = kanaVal;
        
        if (inputKigo === '') {
            currentHaikuData.kigo = '無季';
            currentHaikuData.parentKigo = '無季';
            currentHaikuData.kigoKana = 'むき';
            currentHaikuData.season = 'muki';
            currentHaikuData.detailSeason = '無季';
            currentHaikuData.manualKigo = '';
        } else {
            currentHaikuData.kigo = inputKigo;
            currentHaikuData.parentKigo = inputKigo;
            currentHaikuData.season = document.getElementById('seasonSelect').value;
            currentHaikuData.detailSeason = document.getElementById('detailSeasonInput').value.trim();

            var matchedKana = '';
            for (var i = 0; i < kigoDatabase.length; i++) {
                var item = kigoDatabase[i];
                if (item && (item.parentKigo === inputKigo || item.childKigo === inputKigo)) {
                    matchedKana = item.kigoKana;
                    break;
                }
            }
            currentHaikuData.kigoKana = matchedKana || autoDetectedKigoKana || 'むき';

            if (inputKigo !== autoDetectedParentKigo) {
                currentHaikuData.manualKigo = inputKigo;
            } else {
                currentHaikuData.manualKigo = '';
            }
        }

        var pEl = document.getElementById('previewPhrase');
        pEl.innerText = currentHaikuData.phrase;

        document.getElementById('previewAuthor').innerText = currentHaikuData.author;
        
        var bcEl = document.getElementById('previewBreadcrumb');
        if (currentHaikuData.season === 'muki' || currentHaikuData.kigo === '無季') {
            bcEl.innerHTML = '<span>home</span><span class="separator">&lt;</span><span>季寄せ</span><span class="separator">&lt;</span><span style="font-weight: bold;">無季</span>';
        } else {
            var seasonJa = seasonMapToJa[currentHaikuData.season] || '無季';
            var kigoLabel = currentHaikuData.kigo + (currentHaikuData.detailSeason ? '（' + currentHaikuData.detailSeason + '）' : '');
            bcEl.innerHTML = '<span>home</span><span class="separator">&lt;</span><span>季寄せ</span><span class="separator">&lt;</span><span>' + seasonJa + '</span><span class="separator">&lt;</span><span style="font-weight: bold;">' + kigoLabel + '</span>';
        }

        goToStep(3);

        setTimeout(function() {
            adjustPreviewFontSize();
        }, 60);

    } catch (e) {
        console.error(e);
        goToStep(3);
    }
}

function adjustPreviewFontSize() {
    var pEl = document.getElementById('previewPhrase');
    var wrapper = document.getElementById('previewTextWrapper');
    if (!pEl || !wrapper) return;

    var maxH = wrapper.clientHeight - 20; 
    if (maxH <= 0) return;

    var fontSize = 2.0; 
    pEl.style.fontSize = fontSize + 'rem';

    var currentH = pEl.getBoundingClientRect().height;
    while (currentH > maxH && fontSize > 0.5) {
        fontSize -= 0.05;
        pEl.style.fontSize = fontSize + 'rem';
        currentH = pEl.getBoundingClientRect().height;
    }
}

// 📡 オフライン対応：送信処理（圏外ならキュー保存）
function submitHaiku() {
    var btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerText = '送信中...';

    // オフライン（圏外）の場合
    if (!navigator.onLine) {
        saveToPendingQueue(currentHaikuData);
        btn.disabled = false;
        btn.innerText = '登録';
        alert('【オフライン一時保存】\n\n現在端末がオフラインのため、句を端末内に安全に一時保存しました。\n電波が繋がり次第、自動的にスプレッドシートへ送信されます。');
        goToStep(4);
        return;
    }

    // オンライン通信
    fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(currentHaikuData)
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        btn.disabled = false;
        btn.innerText = '登録';
        if (data.status === 'success') {
            goToStep(4);
        } else {
            // エラー時はローカル保存にフォールバック
            saveToPendingQueue(currentHaikuData);
            goToStep(4);
        }
    })
    .catch(function(err) {
        btn.disabled = false;
        btn.innerText = '登録';
        // 通信失敗時もローカル保存して完了へ
        saveToPendingQueue(currentHaikuData);
        goToStep(4);
    });
}

// 送信待ちキューの追加
function saveToPendingQueue(dataObj) {
    try {
        var queue = getPendingQueue();
        queue.push(dataObj);
        localStorage.setItem('fugetsu_pendingQueue', JSON.stringify(queue));
        updateOfflineStatusBar();
    } catch (e) { console.error(e); }
}

// 未送信キューの取得
function getPendingQueue() {
    try {
        var q = localStorage.getItem('fugetsu_pendingQueue');
        return q ? JSON.parse(q) : [];
    } catch (e) { return []; }
}

// オンライン復帰時の自動バックグラウンド一括送信
function checkAndAndSendPendingQueue() {
    if (!navigator.onLine) {
        updateOfflineStatusBar();
        return;
    }

    var queue = getPendingQueue();
    if (queue.length === 0) {
        updateOfflineStatusBar();
        return;
    }

    var item = queue[0]; // 1件ずつ送信
    fetch(GAS_WEB_APP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(item)
    })
    .then(function(res) { return res.json(); })
    .then(function() {
        var currentQ = getPendingQueue();
        currentQ.shift(); // 送信成功したものをキューから削除
        localStorage.setItem('fugetsu_pendingQueue', JSON.stringify(currentQ));
        updateOfflineStatusBar();
        if (currentQ.length > 0) {
            checkAndSendPendingQueue(); // 残りを順次送信
        }
    })
    .catch(function() {
        updateOfflineStatusBar();
    });
}

function checkAndSendPendingQueue() {
    checkAndAndSendPendingQueue();
}

// 通知バーのUI追加＆更新
function createOfflineStatusBar() {
    var bar = document.createElement('div');
    bar.id = 'offlineStatusBar';
    bar.className = 'offline-status-bar';
    document.body.appendChild(bar);
}

function updateOfflineStatusBar() {
    var bar = document.getElementById('offlineStatusBar');
    if (!bar) return;
    var queue = getPendingQueue();
    if (queue.length > 0) {
        bar.innerText = '📡 未送信の句：' + queue.length + '件（電波接続時に自動送信）';
        bar.style.display = 'block';
    } else {
        bar.style.display = 'none';
    }
}

function resetForm() {
    var input = document.getElementById('inputPhrase');
    if (input) input.value = '';
    document.getElementById('kigoInput').value = '';
    document.getElementById('detailSeasonInput').value = '';
    goToStep(1);
    if (input) input.focus();
}
