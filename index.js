//變數設定區
var CHANNEL_ACCESS_TOKEN = '這是秘密';
var SHEET_ID = '這是秘密';
var SHEET_NAME = '校車資料';
var MAP_URL = 'https://www.google.com/maps/d/u/0/edit?mid=1V43qdEP3FcfG_m-KrdWhewfD8FbTA4M&usp=sharing'; // 全路線地圖
const APIKEY = '這是秘密';

//LINE Bot設定
function doPost(e) {
    try {
        var msg = JSON.parse(e.postData.contents);
        var replyToken = msg.events[0].replyToken;
        var userMessage = msg.events[0].message;
        var eventType = msg.events[0].type;

        if (eventType === 'message') {
            var replyText = "";

            if (userMessage.type === 'location') {
                replyText = findNearestStops(userMessage.latitude, userMessage.longitude);
            } else if (userMessage.type === 'text') {
                replyText = handleTextMessage(userMessage.text);
            }

            sendLineMessage(replyToken, replyText);
        }
        return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
    } catch (ex) {
        Logger.log(ex);
        return ContentService.createTextOutput(JSON.stringify({ status: 'error' })).setMimeType(ContentService.MimeType.JSON);
    }
}


// 設定 Rich Menu，寫成這樣而不用collab是因為比較好修改
const MENU_CONFIG = {
    IMAGE_ID: '1oyxH6k8gdW6ZvJtc5kvtDboXufSrTMoo',
    MENU_ID: 'richmenu-d9803e9266d18ab44ad11f11b0e4719b' // 執行 createRichMenu 後取得的 ID
};

//建立 Rich Menu (2500x843)
function createRichMenu() {
    const url = 'https://api.line.me/v2/bot/richmenu';
    const payload = {
        "size": { "width": 2500, "height": 843 },
        "selected": true,
        "name": "校車四格選單",
        "chatBarText": "開啟選單",
        "areas": [
            { // 01: 所有路線
                "bounds": { "x": 0, "y": 0, "width": 625, "height": 843 },
                "action": { "type": "message", "text": "所有路線" }
            },
            { // 02: 全路線地圖
                "bounds": { "x": 625, "y": 0, "width": 625, "height": 843 },
                "action": { "type": "message", "text": "全路線地圖" }
            },
            { // 03: 尋找最近車站
                "bounds": { "x": 1250, "y": 0, "width": 625, "height": 843 },
                "action": { "type": "message", "text": "尋找最近車站" }
            },
            { // 04: 聊天
                "bounds": { "x": 1875, "y": 0, "width": 625, "height": 843 },
                "action": { "type": "message", "text": "跟校車車聊天" }
            }
        ]
    };

    try {
        const response = UrlFetchApp.fetch(url, {
            'method': 'post',
            'headers': {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
            },
            'payload': JSON.stringify(payload)
        });

        const result = JSON.parse(response.getContentText());
        console.log("建立成功，將此 ID 填回 MENU_CONFIG.MENU_ID：\n" + result.richMenuId);

    } catch (e) {
        console.error("建立失敗：", e);
    }
}

//上傳選單圖片
function uploadRichMenuImage() {
    if (!MENU_CONFIG.MENU_ID) return console.error("錯誤：MENU_CONFIG.MENU_ID 未填寫");

    try {
        const imageBlob = DriveApp.getFileById(MENU_CONFIG.IMAGE_ID).getBlob();
        const url = `https://api-data.line.me/v2/bot/richmenu/${MENU_CONFIG.MENU_ID}/content`;

        UrlFetchApp.fetch(url, {
            'method': 'post',
            'headers': {
                'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN,
                'Content-Type': 'image/jpeg'
            },
            'payload': imageBlob
        });

        console.log("上傳成功");

    } catch (e) {
        console.error("上傳失敗：", e);
    }
}

//設為預設選單
function setDefaultRichMenu() {
    if (!MENU_CONFIG.MENU_ID) return console.error("錯誤：MENU_CONFIG.MENU_ID 未填寫");

    try {
        const url = `https://api.line.me/v2/bot/user/all/richmenu/${MENU_CONFIG.MENU_ID}`;

        UrlFetchApp.fetch(url, {
            'method': 'post',
            'headers': { 'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN }
        });

        console.log("設定成功");

    } catch (e) {
        console.error("設定失敗：", e);
    }
}

//機器人處理文字訊息
function handleTextMessage(text) {
    var data = getSheetData();
    var trimmedText = text.trim();
    var trigger = "tayo";

    if (trimmedText === "所有路線") {
        return getAllRoutes(data);
    }

    if (trimmedText === "全路線地圖") {
        return "🗺️ 這是我們製作的校車路線總圖，點擊查看：\n" + MAP_URL;
    }

    if (trimmedText === "尋找最近車站") {
        return "➶請點擊左下角「⌨️」號 \n⮕「＞」\n⮕「+」\n⮕「位置資訊」\n⮕右上角「分享」，以傳送您的位置資訊。";
    }

    if (trimmedText === "跟校車車聊天") {
        return "叭叭！我是校車車 Tayo！！如果想跟我聊天，請傳送「tayo + 想說的話呦！」"
    }

    if (trimmedText.toLowerCase().startsWith("tayo")) {
        var userInquiry = trimmedText.replace(/tayo/i, "").trim();

        // 狀況一：使用者只打 Tayo 沒說話
        if (!userInquiry) {
            return "叭叭！找 Tayo 有什麼事嗎？"; // 直接 return 字串
        }

        var finalPrompt = "你是一台正心中學的校車巴士tayo。與你對話的是一位學生，請根據以下問題簡短回答，字數20字內，一定要快點回答，不要使用表情符號，請模仿動畫小巴士tayo的個性，例如找朋友、發出叭叭聲: " + userInquiry;

        var aiResult = callGemini(finalPrompt);

        return aiResult;
    }

    //是否為「路線名稱」
    var routeResult = getStationsByRoute(data, trimmedText);
    if (routeResult) {
        return routeResult;
    }

    //是否為「車站名稱」
    var stationResult = getStationInfo(data, trimmedText);
    if (stationResult) {
        return stationResult;
    }

    //非指令字元回傳指令表
    return getHelpMessage();
}


// --- 各個功能函式 ---

// 1.指令表
function getHelpMessage() {
    return "👋 哈囉！我是校車車。\n" +
        "請輸入以下指令或傳送位置：\n\n" +
        "1️⃣ 輸入「所有路線」：查看有哪些路線\n" +
        "2️⃣ 輸入路線名稱(如 市A線)：查看該線所有站點\n" +
        "3️⃣ 輸入站名(如 大崙郵局)：查看詳細發車資訊\n" +
        "4️⃣ 輸入「全路線地圖」：查看地圖連結\n" +
        "📍 點擊左下角「+」傳送位置資訊：尋找最近車站";
}

// 2.回傳所有路線 (不重複)
function getAllRoutes(data) {
    var routes = [];
    for (var i = 0; i < data.length; i++) {
        var rName = data[i][6]; // G欄
        if (rName && routes.indexOf(rName) === -1) {
            routes.push(rName);
        }
    }

    if (routes.length === 0) return "資料庫中沒有路線資料喔！";

    return "🚌 目前行駛的路線有：\n\n" + routes.join("\n") +
        "\n\n輸入路線名稱 (例如「" + routes[0] + "」) 可查看詳細站點。";
}

// 3.依路線名稱回傳站點(沒有模糊搜尋)
function getStationsByRoute(data, routeName) {
    var stations = [];
    for (var i = 0; i < data.length; i++) {
        if (data[i][6] === routeName) { // 比對G欄
            stations.push(data[i][1]); // 收集B欄站名
        }
    }

    if (stations.length > 0) {
        return "🚌 路線【" + routeName + "】的所有站點：\n" +
            "(按行車順序排列)\n\n" +
            stations.join(" ⬇️\n") +
            "\n\n💡 輸入站名可查詢詳細時間與導航。";
    }
    return null; 
}

//4.依車站名稱回傳詳細資訊
function getStationInfo(data, stationName) {
    //這裡的主程式給副函式的stationName是使用者輸入、已移除空格(trimmed)的文字
    //data是getSheetData得到的二維陣列

    for (var i = 0; i < data.length; i++) {
        if (data[i][1].toString().indexOf(stationName) > -1) {
            //data[i][1]是站名、toString強制轉型成字串、indexOf尋找子字串（找到回傳索引值，沒找到傳-1）

            var row = data[i];//符合條件的站點存在row
            var navLink = row[0];       //如果沒法生成連結（經緯度在表單中消失），至少可以用資料庫裡的
            if (row[8] && row[7]) {     // 用經緯度做成導航連結
                navLink = "<https://www.google.com/maps?q=>" + row[8] + "," + row[7] + "&travelmode=walking";
            }

            var cTime = formatTime(row[2]);
            var dTime = formatTime(row[3]);

            return "🚏 站點：【" + row[1] + "】\n" +
                "🚌 路線：" + row[6] + "\n" +
                "🏢 公司：" + row[5] + "\n" +
                "------------------------\n" +
                "📅 週一發車時間：" + cTime + "\n" +
                "📅 二至五發車時間：" + dTime + "\n" +
                "💰 月票金額：" + row[4] + "元\n" +
                "------------------------\n" +
                "🔗 點擊導航：\n" + navLink;
        }
    }
    return null; //讓主程式繼續判斷
}

// 5.傳送位置，傳最近 3 個車站
function findNearestStops(userLat, userLng) {
    var data = getSheetData();
    var stations = [];

    for (var i = 0; i < data.length; i++) {
        var sLat = data[i][8]; // I欄 Lat
        var sLng = data[i][7]; // H欄 Lng

        if (!sLat || !sLng || sLat === "失敗") continue;

        var dist = calculateDistance(userLat, userLng, sLat, sLng);  //給他使用者以及data[i]的經緯
        stations.push({   //把每站距離和資料封裝成物件，存在stations陣列
            info: data[i],
            distance: dist
        });
    }

    //a和b是stations中的任兩個物件，透過相減運算來由小到大排序距離
    stations.sort(function (a, b) { return a.distance - b.distance; });

    if (stations.length === 0) return "無法計算距離，請確認資料庫經緯度是否完整。";

    var msg = "📍 離你最近的 3 個校車站：\n\n";

    for (var k = 0; k < Math.min(3, stations.length); k++) {
        var st = stations[k];
        var row = st.info;
        var navLink = "https://www.google.com/maps?q=" + row[8] + "," + row[7] + "&travelmode=walking";

        msg += (k + 1) + ". 【" + row[1] + "】 (" + row[6] + ")\n"; // 站名 (路線)
        msg += "   📏 直線距離約 " + Math.round(st.distance * 1000) + " 公尺\n";
        msg += "   🔗 導航： " + navLink + "\n\n";
    }

    msg += "💡 輸入站名可查看詳細發車時間。";
    return msg;
}

//工具函式：

// 讀取 Sheet 資料
function getSheetData() {
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);
    var lastRow = sheet.getLastRow();
    // 從第2列開始讀取 (避開標題)，讀取 A:I (共9欄)
    return sheet.getRange(2, 1, lastRow - 1, 9).getValues();
}

// 時間格式化
function formatTime(val) {
    if (val instanceof Date) {
        return Utilities.formatDate(val, "GMT+8", "HH:mm");
    }
    return val ? val : "無資料";
}

// 計算距離 (Haversine大圓公式)
function calculateDistance(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}




//--------聊天
//
function callGemini(prompt) {
    var API_KEY = "這是秘密";

    var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + API_KEY;

    var payload = {
        "contents": [{
            "parts": [{
                "text": String(prompt) // 強制轉字串，避免傳入 undefined
            }]
        }]
    };

    var options = {
        "method": "post",
        "contentType": "application/json",
        "payload": JSON.stringify(payload),
        "muteHttpExceptions": true // 讓 400/500 錯誤也能被讀取
    };

    try {
        var response = UrlFetchApp.fetch(url, options);
        var responseCode = response.getResponseCode();
        var responseText = response.getContentText();

        //若 Google 回傳不是 200，把錯誤回傳給 LINE
        if (responseCode !== 200) {
            return "Google 拒絕連線 (Code " + responseCode + "):\n" + responseText;
        }

        var json = JSON.parse(responseText);

        // 檢查有沒有內容
        if (json.candidates && json.candidates.length > 0) {
            var content = json.candidates[0].content;
            if (content && content.parts && content.parts.length > 0) {
                return content.parts[0].text; // 成功
            } else {
                return "Google 回傳了 candidates 但沒有文字:\n" + responseText;
            }
        } else {
            // 安全性阻擋常見於此
            if (json.promptFeedback) {
                return "內容被 Google 安全過濾擋下:\n" + JSON.stringify(json.promptFeedback);
            }
            return "結構錯誤，找不到回應:\n" + responseText;
        }

    } catch (e) {
        // 程式直接崩潰的錯誤
        return "程式發生例外錯誤:\n" + e.toString();
    }
}


// 傳送 LINE 訊息 API
function sendLineMessage(replyToken, text) {
    var url = 'https://api.line.me/v2/bot/message/reply';
    var payload = {
        replyToken: replyToken,
        messages: [{ type: 'text', text: text }]
    };

    try {
        var response = UrlFetchApp.fetch(url, {
            'method': 'post',
            'headers': {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + CHANNEL_ACCESS_TOKEN
            },
            'payload': JSON.stringify(payload),
            'muteHttpExceptions': true // 即使失敗 回傳錯誤內容
        });


    } catch (e) {
        console.log("連線發生錯誤: " + e.toString());
    }
}