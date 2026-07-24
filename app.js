var GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwgm4eh8qZGRxvFS8_b8iEJAC9vRGw31gOvjgsPQMPc1ymU4oKonErvUkL0Ucf6xnZO/exec';
var SPREADSHEET_ID = '1m0y8AOJNx1Ad4I44poPheQAQNki1-QQIwi9wSw8jaBg';

var kigoDatabase = [];
var existingPhrases = []; 
var existingAuthors = []; // 作者名重複・サジェスト用データセット

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

function kigoDataReceived(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        var rows = data.table.rows;
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
                kigoDatabase.push({
                    parentKigo: parentKigo,
                    childKigo: childKigo || parentKigo,
                    kigoKana: kigoKana,
                    detailSeason: detailSeason,
                    season: normalizedSeason
                });
            }
        }
    } catch (e) { console.error(e); }
}

function phrasesDataReceived(data) {
    try {
        if (!data || !data.table || !data.table.rows) return;
        var rows = data.table.rows;
        var authorMap = {};

        for (var i = 0; i < rows.length; i++) {
            var c = rows[i].c;
            if (!c) continue;

            if (c[0] && c[0].v) {
                var phraseStr = String(c[0].v).trim();
                if (phraseStr && phraseStr !== '句') existingPhrases.push(phraseStr);
            }

            var authorName = c[1] && c[1].v ? String(c[1].v).trim() : '';
            var authorKana = c[2] && c[2].v ? String(c[2].v).trim() : '';

            if (authorName && authorName !== '作者名' && authorName !== '作者') {
                if (!authorMap[authorName]) {
                    authorMap[authorName] = authorKana;
                }
            }
        }

        var nameDatalist = document.getElementById('authorList');
        var kanaDatalist = document.getElementById('authorKanaList');
        
        for (var name in authorMap) {
            var kana = authorMap[name];
            existingAuthors.push({ name: name, kana: kana });
            
            if (nameDatalist) {
                // 漢字名と「漢字（よみがな）」の両方を候補に登録（ひらがな検索用）
                var opt = document.createElement('option');
                opt.value = name;
                nameDatalist.appendChild(opt);

                if (kana) {
                    var optCombo = document.createElement('option');
                    optCombo.value = name + ' (' + kana + ')';
                    nameDatalist.appendChild(optCombo);
                }
            }
            if (kanaDatalist && kana) {
                var optK = document.createElement('option');
                optK.value = kana;
                kanaDatalist.appendChild(optK);
            }
        }
    } catch (e) { console.error(e); }
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

// ひらがな入力で「漢字（よみがな）」が選ばれた際の自動クレンジング
function onAuthorInputChanged() {
    var input = document.getElementById('authorInput');
    var val = input.value.trim();
    if (val.indexOf('(') !== -1) {
        var cleanName = val.split('(')[0].trim();
        input.value = cleanName;
        onAuthorNameChange();
    }
}

// よみがなが入力された時、対応する正しい漢字作者名を自動補正セット
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

// 作者名変更時に「よみがな」を自動挿入
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
    } catch (e) {
        console.error('重複チェックエラー（処理は継続します）:', e);
    }

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
    } catch (e) {
        console.error(e);
    }

    goToStep(2);
}

function goToStep3() {
    try {
        checkAndHokanKigoData();

        var inputKigo = document.getElementById('kigoInput').value.trim();
        var authorVal = document.getElementById('authorInput').value.trim() || '西田亮太';
        var kanaVal = toHiragana(document.getElementById('authorKanaInput').value) || 'にしだりょうた';

        // 👤 作者名の異体字・漢字違い・表記揺れチェック
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

        // プレビューテキスト設定
        var pEl = document.getElementById('previewPhrase');
        pEl.innerText = currentHaikuData.phrase;

        document.getElementById('previewAuthor').innerText = currentHaikuData.author;
        
        // 🥖 パンくず表示（無季の場合は「home < 季寄せ < 無季」とシンプル化）
        var bcEl = document.getElementById('previewBreadcrumb');
        if (currentHaikuData.season === 'muki' || currentHaikuData.kigo === '無季') {
            bcEl.innerHTML = '<span>home</span><span class="separator">&lt;</span><span>季寄せ</span><span class="separator">&lt;</span><span style="font-weight: bold;">無季</span>';
        } else {
            var seasonJa = seasonMapToJa[currentHaikuData.season] || '無季';
            var kigoLabel = currentHaikuData.kigo + (currentHaikuData.detailSeason ? '（' + currentHaikuData.detailSeason + '）' : '');
            bcEl.innerHTML = '<span>home</span><span class="separator">&lt;</span><span>季寄せ</span><span class="separator">&lt;</span><span>' + seasonJa + '</span><span class="separator">&lt;</span><span style="font-weight: bold;">' + kigoLabel + '</span>';
        }

        goToStep(3);

        // 📏 縦書きテキストが領域内に100%収まるよう高さを厳密計算して自動動的縮小
        setTimeout(function() {
            adjustPreviewFontSize();
        }, 60);

    } catch (e) {
        console.error(e);
        goToStep(3);
    }
}

// 縦書き専用の高度判定＆収容アルゴリズム
function adjustPreviewFontSize() {
    var pEl = document.getElementById('previewPhrase');
    var wrapper = document.getElementById('previewTextWrapper');
    if (!pEl || !wrapper) return;

    // 親要素のリアルな高さ（ピクセル）を取得
    var maxH = wrapper.clientHeight - 20; 
    if (maxH <= 0) return;

    var fontSize = 2.0; // 開始フォントサイズ (rem)
    pEl.style.fontSize = fontSize + 'rem';

    // 縦書き要素の実高度（getBoundingClientRect）が親枠を超える間、0.05remずつピタッと縮小
    var currentH = pEl.getBoundingClientRect().height;
    while (currentH > maxH && fontSize > 0.5) {
        fontSize -= 0.05;
        pEl.style.fontSize = fontSize + 'rem';
        currentH = pEl.getBoundingClientRect().height;
    }
}

function submitHaiku() {
    var btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.innerText = '送信中...';

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
            alert('送信に失敗しました：' + data.message);
        }
    })
    .catch(function(err) {
        btn.disabled = false;
        btn.innerText = '登録';
        goToStep(4);
    });
}

function resetForm() {
    var input = document.getElementById('inputPhrase');
    if (input) input.value = '';
    document.getElementById('kigoInput').value = '';
    document.getElementById('detailSeasonInput').value = '';
    goToStep(1);
    if (input) input.focus();
}
