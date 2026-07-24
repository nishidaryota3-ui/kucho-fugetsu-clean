var GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbwgm4eh8qZGRxvFS8_b8iEJAC9vRGw31gOvjgsPQMPc1ymU4oKonErvUkL0Ucf6xnZO/exec';
var SPREADSHEET_ID = '1m0y8AOJNx1Ad4I44poPheQAQNki1-QQIwi9wSw8jaBg';

var kigoDatabase = [];
var existingPhrases = []; 
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
        scriptPhrases.src = 'https://docs.google.com/spreadsheets/d/' + SPREADSHEET_ID + '/gviz/tq?sheet=' + sheet1Name + '&range=A:A&tqx=responseHandler:phrasesDataReceived';
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
        for (var i = 0; i < rows.length; i++) {
            var c = rows[i].c;
            if (c && c[0] && c[0].v) {
                var phraseStr = String(c[0].v).trim();
                if (phraseStr && phraseStr !== '句') existingPhrases.push(phraseStr);
            }
        }
    } catch (e) { console.error(e); }
}

// 🔍 完全安全な文字列類似度（80%一致率）判定ロジック
function getSimilarityRatio(str1, str2) {
    try {
        if (!str1 || !str2) return 0;
        var s1 = String(str1).replace(/[\s　、。,.・]/g, '');
        var s2 = String(str2).replace(/[\s　、。,.・]/g, '');
        if (s1 === s2) return 1.0;

        var len1 = s1.length;
        var len2 = s2.length;
        if (len1 === 0 || len2 === 0) return 0;

        var matrix = [];
        for (var i = 0; i <= len1; i++) {
            matrix[i] = [i];
        }
        for (var j = 0; j <= len2; j++) {
            matrix[0][j] = j;
        }

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
        currentHaikuData.author = document.getElementById('authorInput').value.trim() || '西田亮太';
        currentHaikuData.authorKana = document.getElementById('authorKanaInput').value.trim() || 'にしだりょうた';
        
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

        var len = currentHaikuData.phrase.length;
        var isSmallScreen = (window.innerHeight <= 700);

        if (len <= 15) {
            pEl.style.fontSize = isSmallScreen ? '1.4rem' : '1.7rem';
        } else if (len <= 20) {
            pEl.style.fontSize = isSmallScreen ? '1.15rem' : '1.35rem';
        } else if (len <= 25) {
            pEl.style.fontSize = isSmallScreen ? '0.92rem' : '1.05rem';
        } else {
            pEl.style.fontSize = isSmallScreen ? '0.78rem' : '0.88rem';
        }

        document.getElementById('previewAuthor').innerText = currentHaikuData.author;
        document.getElementById('bcSeason').innerText = seasonMapToJa[currentHaikuData.season] || '無季';
        
        var kigoLabel = currentHaikuData.kigo + (currentHaikuData.detailSeason ? '（' + currentHaikuData.detailSeason + '）' : '');
        document.getElementById('bcKigo').innerText = kigoLabel;
    } catch (e) {
        console.error(e);
    }

    goToStep(3);
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
