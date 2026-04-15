// ════════════════════════════════════════════════
// 伝票スキャナー — Google Apps Script
// ════════════════════════════════════════════════
var SHEET_ID    = '1EaXbCgIR42ggOCAGCHo9sSsfbwWlZ8wPij4Pq6PEZRY';
var FOLDER_NAME = '伝票スキャナー画像';
var HEADER_ROW  = 4;
var ORDER_COL   = 1;
var TRACK_COL   = 6;
var RATE_COL    = 7;
var DATE_COL    = 8;
var IMG_COL     = 10;  // J列: 画像URL（固定）
var HAWB_COL    = 2;   // B列: HAWB番号
var SHEETS = ['SG発送履歴','MY発送履歴','PH発送履歴','TW発送履歴','VN発送履歴','TH発送履歴'];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var res = data.action === 'uploadImage' ? uploadImage(data)
            : data.action === 'saveBatch'   ? saveBatch(data)
            : data.action === 'deleteFile'  ? deleteFile(data)
            : { status:'error', msg:'unknown action' };
    return ContentService
      .createTextOutput(JSON.stringify(res))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status:'error', msg:err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── 画像をDriveに保存 → OCRで文字抽出 ──────
function uploadImage(data) {
  var folder = getOrCreateFolder(FOLDER_NAME);
  var filename;
  if (data.type === 'sagawa') {
    var dateStr = data.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'M/d');
    filename = '佐川　' + dateStr + '.jpg';
  } else {
    filename = 'product_tmp_' + new Date().getTime() + '.jpg';
  }
  var b64 = data.image.replace(/^data:image\/[^;]+;base64,/, '');
  var blob = Utilities.newBlob(Utilities.base64Decode(b64), 'image/jpeg', filename);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  var fileUrl = 'https://drive.google.com/file/d/' + file.getId() + '/view';

  var result = { status:'ok', fileUrl:fileUrl };
  try {
    var lang = (data.type === 'product') ? 'en' : 'ja';
    var ocrText = runOcr(file, lang);
    result.ocrText = ocrText || '(empty)';
    if (data.type === 'sagawa') {
      result.tracking = extractTracking(ocrText);
      result.amount   = extractAmount(ocrText);
    } else {
      result.orderId = extractOrderId(ocrText);
      if (result.orderId) {
        file.setName(result.orderId + '.jpg');
      }
    }
  } catch(e) {
    result.ocrError = e.toString();
  }
  return result;
}

// ─── Order IDで行を検索して書き込み ──────────
function saveBatch(data) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var n = data.products.length;
  var perItem = n > 0 ? Math.round(parseFloat(data.amount) / n) : 0;
  var tracking = formatTracking(data.tracking);
  var results = [];

  data.products.forEach(function(p) {
    var found = false;
    for (var si = 0; si < SHEETS.length; si++) {
      var sheet = ss.getSheetByName(SHEETS[si]);
      if (!sheet) continue;

      var lastRow = sheet.getLastRow();
      if (lastRow < HEADER_ROW + 1) continue;

      var colAB = sheet.getRange(1, ORDER_COL, lastRow, 2).getValues();
      var matchedRows = [];
      for (var ri = 0; ri < colAB.length; ri++) {
        if (String(colAB[ri][0]).trim() === String(p.orderId).trim()) {
          matchedRows.push({ rowNum: ri + 1, hawb: String(colAB[ri][1]).trim() });
        }
      }

      if (matchedRows.length === 0) continue;

      var targetRow = matchedRows[0];
      if (matchedRows.length > 1) {
        var withHawb = matchedRows.filter(function(r) { return r.hawb !== ''; });
        if (withHawb.length > 0) targetRow = withHawb[0];
      }

      var rowNum = targetRow.rowNum;
      sheet.getRange(rowNum, TRACK_COL).setValue(tracking);
      sheet.getRange(rowNum, RATE_COL).setValue(perItem);
      sheet.getRange(rowNum, DATE_COL).setValue(data.date);
      if (p.imageUrl) {
        sheet.getRange(rowNum, IMG_COL).setFormula(
          '=HYPERLINK("' + p.imageUrl + '","📷 画像")'
        );
      }
      found = true;
      results.push({ orderId:p.orderId, sheet:SHEETS[si], row:rowNum, hawb:targetRow.hawb, status:'updated' });
      break;
    }
    if (!found) results.push({ orderId:p.orderId, status:'not_found' });
  });

  return { status:'ok', count:n, perItem:perItem, results:results };
}

// ─── OCR ────────────────────────────────────
function runOcr(file, lang) {
  var folder = getOrCreateFolder(FOLDER_NAME);
  var resource = {
    title: 'ocr_tmp_' + Date.now(),
    mimeType: 'application/vnd.google-apps.document',
    parents: [{ id: folder.getId() }]  // マイドライブに散らばらないよう指定フォルダ内に作成
  };
  var copy = Drive.Files.copy(resource, file.getId(), { ocr:true, ocrLanguage:lang });
  try {
    var text = DocumentApp.openById(copy.id).getBody().getText();
    return text;
  } finally {
    try { Drive.Files.remove(copy.id); } catch(e) {}  // エラー時も必ず削除
  }
}

// ─── マイドライブに残った一時ファイルを一括削除 ──
function cleanupStrayFiles() {
  var result = Drive.Files.list({
    q: 'name contains "ocr_tmp_" and trashed = false',
    pageSize: 100,
    fields: 'files(id,name)'
  });
  var count = 0;
  if (result.files && result.files.length > 0) {
    result.files.forEach(function(f) {
      try { Drive.Files.remove(f.id); count++; } catch(e) {}
    });
  }
  Logger.log('削除した一時ファイル数: ' + count);
  return { deleted: count };
}

// ─── テキスト抽出 ────────────────────────────
function extractOrderId(text) {
  var m = text.match(/[Oo]rder\s*[Ii][Dd][^A-Z0-9]*([A-Z0-9]{8,20})/);
  if (m) return m[1];
  m = text.match(/[Mm][aã][^:]*:[\s]*([A-Z0-9]{10,20})/);
  if (m) return m[1];
  m = text.match(/\b((?:MY|SG|PH|TW|VN|TH)\d{10,15})\b/);
  if (m) return m[1];
  m = text.match(/\b(\d{6}[A-Z0-9]{6,12})\b/);
  return m ? m[1] : '';
}

function extractTracking(text) {
  var m = text.match(/お問い合わせ[状]?[Nn][Oo]?[.．:：\s]*(\d[\d\-\s]{10,15}\d)/);
  if (m) return m[1].replace(/[\-\s]/g,'');
  m = text.match(/\b(\d{4}[-\s]\d{4}[-\s]\d{4})\b/);
  if (m) return m[1].replace(/[\-\s]/g,'');
  m = text.match(/\b(\d{12})\b/);
  return m ? m[1] : '';
}

function extractAmount(text) {
  var m = text.match(/[¥￥]?[\s]*(\d{1,3}(?:[,，]\d{3})+)/);
  return m ? m[1].replace(/[,，]/g,'') : '';
}

function formatTracking(raw) {
  var d = String(raw||'').replace(/\D/g,'');
  return d.length === 12
    ? d.slice(0,4)+'-'+d.slice(4,8)+'-'+d.slice(8,12)
    : (raw||'');
}

// ─── ヘッダー列を探すか追加する ──────────────
function findOrCreateColumn(sheet, headerRow, name) {
  var last = sheet.getLastColumn();
  if (last > 0) {
    var headers = sheet.getRange(headerRow, 1, 1, last).getValues()[0];
    var idx = headers.indexOf(name);
    if (idx >= 0) return idx + 1;
  }
  var newCol = last + 1;
  sheet.getRange(headerRow, newCol).setValue(name).setFontWeight('bold');
  return newCol;
}

// ─── Drive ファイル削除 ───────────────────────
function deleteFile(data) {
  try {
    if (data.fileId) DriveApp.getFileById(data.fileId).setTrashed(true);
    return { status:'ok' };
  } catch(e) { return { status:'error', msg:e.toString() }; }
}

// ─── Drive フォルダ ──────────────────────────
function getOrCreateFolder(name) {
  var f = DriveApp.getFoldersByName(name);
  return f.hasNext() ? f.next() : DriveApp.createFolder(name);
}
