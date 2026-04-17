const CONFIG = {
  spreadsheetId: '1saOKB_w_IpsScAcw6-nabWOgvaBiaB4YzmstB2yo1ec',
  sheetName: 'Contact Submissions',
};

function doGet() {
  return jsonResponse_({
    ok: true,
    service: 'aark-contact-form-webhook',
    message: 'Deploy this Apps Script as a web app and use its URL in CONTACT_FORM_CONFIG.sheetsWebhookUrl.',
  });
}

function doPost(e) {
  try {
    const payload = parsePayload_(e);
    const submission = normalizeSubmission_(payload);
    const sheet = getSheet_();

    ensureHeaders_(sheet);
    sheet.appendRow([
      new Date(),
      submission.name,
      submission.phone,
      submission.email,
      submission.subject,
      submission.message,
      submission.sourcePage,
      submission.formServiceUrl,
      JSON.stringify(payload),
    ]);

    return jsonResponse_({ ok: true });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error.message,
    });
  }
}

function parsePayload_(e) {
  if (e && e.postData && e.postData.contents) {
    const contents = e.postData.contents;

    try {
      return JSON.parse(contents);
    } catch (error) {
      return { form_data: parseFormEncoded_(contents) };
    }
  }

  return { form_data: (e && e.parameter) || {} };
}

function parseFormEncoded_(contents) {
  return String(contents || '')
    .split('&')
    .filter(Boolean)
    .reduce((result, pair) => {
      const separatorIndex = pair.indexOf('=');
      const rawKey = separatorIndex >= 0 ? pair.slice(0, separatorIndex) : pair;
      const rawValue = separatorIndex >= 0 ? pair.slice(separatorIndex + 1) : '';
      const key = decodeFormValue_(rawKey);
      result[key] = decodeFormValue_(rawValue);
      return result;
    }, {});
}

function decodeFormValue_(value) {
  return decodeURIComponent(String(value || '').replace(/\+/g, ' '));
}

function normalizeSubmission_(payload) {
  const formData = payload.form_data || payload || {};

  return {
    name: stringOrEmpty_(formData.name),
    phone: stringOrEmpty_(formData.phone),
    email: stringOrEmpty_(formData.email),
    subject: stringOrEmpty_(formData.subject),
    message: stringOrEmpty_(formData.message),
    sourcePage: stringOrEmpty_(formData.submitted_from || formData._url || payload.form_url),
    formServiceUrl: stringOrEmpty_(payload.form_url || formData._url),
  };
}

function getSheet_() {
  if (!CONFIG.spreadsheetId || CONFIG.spreadsheetId.indexOf('PASTE_') === 0) {
    throw new Error('Set CONFIG.spreadsheetId before deploying the webhook.');
  }

  const spreadsheet = SpreadsheetApp.openById(CONFIG.spreadsheetId);
  return spreadsheet.getSheetByName(CONFIG.sheetName) || spreadsheet.insertSheet(CONFIG.sheetName);
}

function ensureHeaders_(sheet) {
  if (sheet.getLastRow() > 0) return;

  sheet.appendRow([
    'Submitted At',
    'Name',
    'Phone / WhatsApp',
    'Email',
    'Subject',
    'Message',
    'Source Page',
    'Form Service URL',
    'Raw Payload',
  ]);
  sheet.setFrozenRows(1);
}

function stringOrEmpty_(value) {
  return value == null ? '' : String(value);
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
